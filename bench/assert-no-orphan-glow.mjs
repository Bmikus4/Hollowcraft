// NOTHING GLOWING IS LEFT BEHIND BY A DEATH. This leak has shipped in this repo once: a killed creature stranded its eye
// light and a pair of floating eyes in the world for good, and the borrowed pool slot was never given back, so the game got
// darker the longer you played and nothing pointed at the creature.
//
// The check is worth having because the release is INVISIBLE in the diff that would break it. hwGlowStep re-derives its
// subject from `active` every frame and parks the light, the two eye sprites and the whole trail when there is none — one
// guard covering death, despawn and chunk unload. Anyone who "optimises" that into an on-death callback re-opens the leak
// on the two paths that are not a death, and every existing bench would stay green.
//
//   node bench/assert-no-orphan-glow.mjs
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
const ok=(name,cond,detail)=>{ if(cond){pass++; console.log('  ok   '+name);} else {fail++; console.log('  FAIL '+name+'   '+detail);} };
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.85)');   // night: the glow is faded to 15% by daylight and a dim reading proves nothing

    // NEGATIVE CONTROL FIRST. A "nothing is stranded" assertion that has never seen the glow ON is indistinguishable from an
    // assertion wired to a probe that always returns zero, and that is exactly the kind of green this repo has been bitten by.
    await ev('__hc.hw(12)');
    await sleep(2500);
    const lit=await ev('__hc.hwGlowState()');
    console.log('  glow with a Horrific Wretch alive: '+JSON.stringify(lit));
    ok('the probe can see the glow ON', lit.subject===true && lit.eyesVisible===2 && lit.plInt>0,
       'subject='+lit.subject+' eyes='+lit.eyesVisible+' plInt='+lit.plInt+' — negative control failed, the rest proves nothing');

    // Every fork alive, then every fork killed through the real damage path.
    await ev('__hc.meek(1)'); await ev('__hc.burrower(9)'); await ev('__hc.tenant(true)');
    await sleep(2000);
    for(const k of ['meek','burrower','tenant']) console.log('  kill '+k+' '+JSON.stringify(await ev(`__hc.kindKill('${k}')`)));
    await ev('__hc.hwKill()');
    await sleep(4000);

    const g=await ev('__hc.hwGlowState()');
    console.log('  glow after every death: '+JSON.stringify(g));
    ok('no eye sprite is left visible',   g.eyesVisible===0,  JSON.stringify(g));
    ok('no trail sprite is left visible', g.trailVisible===0, JSON.stringify(g));
    ok('the eye light is dark',           g.plInt===0,        JSON.stringify(g));
    ok('the eye light is parked off-world', g.plY===null||g.plY<-900, JSON.stringify(g));
    ok('the position history is cleared',  g.hist===0,        JSON.stringify(g));

    // The pool slot is RESERVED, not leaked: assignPointLights only withholds it while a Horrific Wretch is active, so with
    // none alive the whole pool must be back in circulation.
    const c=await ev('__hc.lightCensus()');
    console.log('  pool owners: '+JSON.stringify(c.owners));
    ok('the borrowed pool slot is back in circulation', !!c.owners && !!c.owners.pointPool, JSON.stringify(c.owners));

    console.log('\n  '+pass+' passed, '+fail+' failed');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} process.exit(fail?1:0); }
})();
