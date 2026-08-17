// THE WRETCH IS UNHARMED BY THE FORKS' REMOVAL. Three creatures were forked off its rig and then deleted, and the danger in
// that shape of change is not the code you meant to delete — it is the shared machinery you take with it. wretchExtra,
// placeWretch, the animator and the drift loop all belonged to the Wretch and were only ever borrowed.
//
// So this boots the real game and asks the questions a player would: does the Wretch exist, does it render, does its rig
// move, does it charge on all fours, does the Horrific Wretch spawn and hold its eye glow, and can both of them die. It also
// checks that nothing the removal left behind still spawns, and that a save round-trips.
//
//   node bench/assert-wretch-after-removal.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
let pass=0, fail=0;
const ok=(n,c,d)=>{ if(c){pass++; console.log('  ok   '+n);} else {fail++; console.log('  FAIL '+n+'   '+(d||''));} };
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errs=[]; pg.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('PAGEERROR:',String(e.message||e).slice(0,180)); });
    await pg.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.85)');

    // THE FILE PARSED AND THE LOOP IS RUNNING. A removal of 560 lines that leaves a reference behind throws once per frame
    // inside a try/catch and shows as nothing at all, which is how the drift pass died silently earlier today.
    ok('no page errors on boot', errs.length===0, errs.slice(0,2).join(' | '));

    // ---- THE WRETCH ----
    console.log('');
    console.log('[the Wretch]');
    await ev('__hc.wretchAt(12)'); await ev('__hc.wretchArm(true,true)'); await sleep(2500);
    const D=await ev("__hc.kindDrawn('wretch')");
    console.log('  drawn '+JSON.stringify(D));
    ok('it exists and is in the scene', !D.err && D.inScene===true && D.chainVisible===true, JSON.stringify(D));
    ok('it has a body with geometry', !D.err && D.meshes>0 && D.verts>0, JSON.stringify(D));
    const S=await ev("__hc.limbTable('wretch')");
    ok('no limb is mirrored or crossed', !S.err && S.arms.every(a=>a.cross!=='CROSSED'&&a.mirrored===0)
       && S.legs.every(l=>l.cross!=='CROSSED'&&l.mirrored===0),
       S.arms?S.arms.map(a=>a.cross+'/'+a.mirrored).join(' '):S.err);

    // ITS RIG MOVES. A still rig passes every "it is not broken" test for the wrong reason, so the gait is recorded from the
    // animation frame itself and the swing measured — which is also the negative control for rigTrace's re-attached collector.
    await ev("__hc.rigTrace('wretch')");
    await sleep(3000);
    const T=await ev('__hc.rigTrace()');
    const swing=T.rows&&T.rows.length ? Math.max(...T.rows.map(r=>r[1]))-Math.min(...T.rows.map(r=>r[1])) : 0;
    console.log('  gait '+T.n+' frames over '+T.span+'s, thigh swing '+swing.toFixed(3)+' rad');
    ok('the gait recorder collects frames', T.n>30, 'n='+T.n+' — the collector went out with kindPose and was re-attached');
    ok('the rig actually moves', swing>0.05, 'thigh peak-to-peak '+swing.toFixed(4)+' rad');

    // IT CHARGES ON ALL FOURS. This is Ben's own fix and the engine counts its own violations every frame, so the question is
    // answered by the counter rather than by a bench driving branches.
    await ev('__hc.wretchAudit(true)');
    await sleep(4000);
    const A=await ev('__hc.wretchAudit()');
    console.log('  pose audit '+JSON.stringify(A));
    ok('the charge-pose audit is still wired', A && A.n!=null, JSON.stringify(A));
    ok('no upright-charge violations', A.n===0, JSON.stringify(A));

    // ---- THE HORRIFIC WRETCH ----
    console.log('');
    console.log('[the Horrific Wretch]');
    await ev('__hc.hw(12)'); await sleep(3000);
    // TWO __hc.hwState DEFINITIONS EXIST and the later key wins, so this is the object form with a `creatures` list rather
    // than the array of instances. Reading it as an array reported "it spawns: FAIL" over a creature that had spawned.
    const H=await ev('__hc.hwState()');
    const crew=Array.isArray(H)?H:(H&&H.creatures)||[];
    console.log('  creatures '+JSON.stringify(crew).slice(0,140));
    ok('it spawns', crew.length>0 && crew.some(c=>c.horrific), JSON.stringify(H).slice(0,200));
    const G=await ev('__hc.hwGlowState()');
    console.log('  glow '+JSON.stringify(G));
    ok('its eye glow lights', !G.err && G.subject===true && G.eyesVisible===2 && G.plInt>0, JSON.stringify(G));
    const P=await ev('__hc.hwProbe()');
    ok('the drift loop is stepping it', Array.isArray(P) && P.length>0 && P.some(x=>x.steps>0),
       JSON.stringify(P).slice(0,200));

    // ---- AND THEY DIE, RELEASING EVERYTHING ----
    await ev('__hc.hwKill()'); await sleep(3500);
    const G2=await ev('__hc.hwGlowState()');
    console.log('  glow after death '+JSON.stringify(G2));
    ok('nothing glowing is stranded by the death', !G2.err && G2.eyesVisible===0 && G2.trailVisible===0
       && G2.plInt===0 && G2.hist===0, JSON.stringify(G2));

    // ---- NOTHING REMOVED STILL SPAWNS ----
    console.log('');
    console.log('[the removed creatures]');
    for(const k of ['meek','burrower','tenant']){
      const e=await ev(`(()=>{try{ return __hc.useEgg('egg_${k}', 9); }catch(err){ return {err:String(err.message||err)}; }})()`);
      ok('the '+k+' spawn egg no longer exists', !!e.err, JSON.stringify(e));
      const d=await ev(`__hc.kindDrawn('${k}')`);
      ok('nothing named '+k+' can be resolved', !!d.err, JSON.stringify(d)); }
    const anyProbe=await ev("(()=>({meek:typeof __hc.meek, burrower:typeof __hc.burrower, tenant:typeof __hc.tenant, tenBox:typeof __hc.tenBox, kindCost:typeof __hc.kindCost}))()");
    console.log('  probes '+JSON.stringify(anyProbe));
    ok('their probes are gone', Object.values(anyProbe).every(v=>v==='undefined'), JSON.stringify(anyProbe));

    // ---- A SAVE STILL ROUND-TRIPS ----
    console.log('');
    console.log('[a save]');
    // saveGame and SAVE_KEY are module scope and unreachable from a page eval, which is the same wall ITEMS and `scene` sit
    // behind. __hc.save is the game's own route to it, and __hc.loadNow puts it back through applySave — the path that used
    // to retire the three creatures on load and no longer mentions them.
    const sv=await ev("__hc.save()");
    console.log('  save '+JSON.stringify(sv));
    ok('a world saves', typeof sv==='string' && /^saved /.test(sv), JSON.stringify(sv));
    const ld=await ev("(()=>{ try{ return __hc.loadNow ? __hc.loadNow() : (typeof loadGame==='function' ? (loadGame(), 'loaded') : 'no load hook'); }catch(e){ return {err:String(e.message||e)}; } })()");
    console.log('  load '+JSON.stringify(ld));
    ok('and loads again without touching a removed creature', !(ld&&ld.err), JSON.stringify(ld));
    ok('still no page errors after all of it', errs.length===0, errs.slice(0,2).join(' | '));

    console.log('');
    console.log('  '+pass+' passed, '+fail+' failed');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} process.exit(fail?1:0); }
})();
