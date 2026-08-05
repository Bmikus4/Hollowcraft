// THE HOLOSIGHT WHILE WALKING (Ben 08-05: "HOLOSIGHTS STILL ARENT LINED UP BOI", after the minigun's bore and the reticle's
// sampling were both fixed). Every earlier measurement was taken parked and frozen; this one walks. The reticle hangs on the bore and
// the glass is driven onto the camera axis by a correction measured per frame, and the walk bob, the strafe lean and the buck each
// move one of those - so the number that matters is the WORST frame of a run, not the one at rest.
//   node bench/assert-holo-walk.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^[/]([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
const GUNS=['ar15_dot','ar15_suppressed_dot','minigun_dot','minigun_suppressed_dot','hunting_rifle_dot','hunting_rifle_suppressed_dot'];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(640,360); await sleep(1200);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); __hc.giveItem('rifle_ammo',400); })()`); await sleep(600);
    for(const id of GUNS){
      const r=await page.evaluate(`__hc.holoWalk({id:'${id}', frames:200, fwd:4.2, lat:2.0})`);
      console.log('   ', id.padEnd(30), JSON.stringify({maxOffAxis:r.maxOffAxis, maxOffAim:r.maxOffAim, room:r.room, fits:r.fitsWorst}));
      if(r.worst) console.log('        worst frame', JSON.stringify(r.worst));
      if(r.err){ ok(id+': could be walked', false, r); continue; }
      ok(id+': the glass stays on the camera axis while walking', r.maxOffAxis < r.room, {maxOffAxis:r.maxOffAxis, room:r.room});
      ok(id+': the reticle stays inside the glass while walking', r.fitsWorst===true, {maxOffAim:r.maxOffAim, room:r.room, ring:0.0099});
    }
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`
${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
