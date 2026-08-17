// SHE IS ALIVE ON THE SPOT. Ben: "add an idle sway" — static in place, but not a statue. This is the only animation she has,
// so it carries the whole impression of her being a person, and every way it can be wrong is measurable:
//
//   STAYS PUT. A sway is not motion; if she has travelled, the animal walk is still running under her.
//   MOVES AT ALL. A bone that never leaves its rest pose is the failure this project has hit four times in one day — code
//   that exists, compiles and is never executed. This is the negative control and it matters more than the rest.
//   ONLY A LITTLE. A head drifting more than a couple of degrees is a dance, not an idle.
//   NEVER VISIBLY LOOPS. Three cycles at unrelated periods should never return the same pose twice.
//   STOPS DEAD ON DEATH. A corpse that goes on breathing while it falls is far worse than no idle at all.
//
//   node bench/assert-foxgirl-idle.mjs
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
    const pg=await (await b.newContext({viewport:{width:900,height:700}})).newPage();
    const errs=[]; pg.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('PAGEERROR:',String(e.message||e).slice(0,180)); });
    await pg.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    for(let i=0;i<40;i++){ const d=await ev('__hc.human(4,1.8)'); if(!d.err){ await ev('__hc.humanGone()'); break; } await sleep(500); }
    console.log('  egg '+JSON.stringify(await ev("__hc.useEgg('egg_foxgirl', 6)")));
    await sleep(1500);

    // Twelve seconds, which is several periods of the slowest of the three cycles.
    const rows=[];
    for(let i=0;i<40;i++){ const r=await ev('__hc.foxgirlPose()'); if(!r.err) rows.push(r); await sleep(300); }
    if(!rows.length){ console.log('  she never appeared'); return; }
    const span=(f)=>{ const v=rows.map(f); return Math.max(...v)-Math.min(...v); };
    const travel=Math.max(...rows.map(r=>Math.hypot(r.at[0]-rows[0].at[0], r.at[2]-rows[0].at[2])));
    const headDeg=span(r=>r.head)*180/Math.PI, pelvisDeg=span(r=>r.pelvis)*180/Math.PI, chestDeg=span(r=>r.chest)*180/Math.PI;
    console.log('  '+rows.length+' samples over 12s   travel '+travel.toFixed(3)+' blocks');
    console.log('  head '+headDeg.toFixed(2)+' deg   pelvis '+pelvisDeg.toFixed(2)+' deg   chest '+chestDeg.toFixed(2)+' deg');
    ok('she stays where she was put', travel<0.05, travel.toFixed(3)+' blocks travelled — a sway is not motion');
    ok('the bones actually move', headDeg>0.05 && pelvisDeg>0.05,
       'head '+headDeg.toFixed(3)+' pelvis '+pelvisDeg.toFixed(3)+' — a pose that never leaves rest is code that never ran');
    ok('and move only a little', headDeg<4 && pelvisDeg<4 && chestDeg<4,
       'head '+headDeg.toFixed(2)+' pelvis '+pelvisDeg.toFixed(2)+' chest '+chestDeg.toFixed(2)+' deg');
    const sig=rows.map(r=>r.head.toFixed(5)+','+r.pelvis.toFixed(5)+','+r.chest.toFixed(5));
    ok('no two samples share a pose', new Set(sig).size===sig.length, (sig.length-new Set(sig).size)+' repeats of '+sig.length);

    // AND IT STOPS DEAD. Killed, her bones must hold still while the ragdoll falls.
    await ev('__hc.foxgirlHurt(50)');
    await sleep(500);
    const d1=await ev('__hc.foxgirlPose()'); await sleep(1000); const d2=await ev('__hc.foxgirlPose()');
    console.log('  dead '+JSON.stringify(d1)+'  then  '+JSON.stringify(d2));
    const still=(!d1.err && !d2.err) ? (Math.abs(d1.head-d2.head)+Math.abs(d1.pelvis-d2.pelvis)+Math.abs(d1.chest-d2.chest)) : null;
    ok('the sway stops when she dies', still!==null && still<1e-6,
       still===null ? 'her body could not be read after death' : 'bones moved '+still.toExponential(2)+' after death');
    ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('');
    console.log('  '+pass+' passed, '+fail+' failed');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} process.exit(fail?1:0); }
})();
