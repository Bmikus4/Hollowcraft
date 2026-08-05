// Sweeps the four angles of the third-person shouldering pose and reports, for each, where the two hands land in body space and
// how far the support hand is from the handguard it is supposed to be gripping. The pose is picked from this table, not guessed.
// node bench/tmp-shoulder-sweep.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
const W=900,H=620;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    page.on('pageerror',e=>console.log('  pageerror', String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1000);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); __hc.giveItem('rifle_ammo',200); __hc.hold('ar15_dot'); })()`);
    await page.evaluate(`__hc.tpsProbe(true)`); await sleep(900);
    await page.evaluate(`__hc.cam({yaw:0,pitch:0})`); await sleep(500);
    // One evaluate for the whole sweep: each combination is applied, one frame is stepped, and the pose is read back. No
    // screenshots, so this costs milliseconds per row instead of a second.
    const rows = await page.evaluate(async ()=>{
      const out=[];
      // Second pass, around what the first found: the right arm near straight forward (-1.5708), the gun off the centre line and
      // over that arm, the left arm straight forward and crossing over to it.
      const RX=[-1.58,-1.54,-1.50,-1.46], RZ=[0,0.08,0.16];
      const LX=[-1.74,-1.66,-1.62,-1.56], LZ=[-1.00,-0.92,-0.84,-0.76];
      const HZ=[0.20,0.26];
      for(const rx of RX) for(const rz of RZ) for(const lx of LX) for(const lz of LZ) for(const hz of HZ){
        __hc.tpsArms({rx,rz,lx,lz,hz});
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const p=__hc.tpsPose();
        out.push({rx,rz,lx,lz,hz, d:p.offHandToForend, hand:p.handAt, off:p.offHandAt, fore:p.forendAt});
      }
      __hc.tpsArms(null);
      return out;
    });
    rows.sort((a,b)=>a.d-b.d);
    console.log('  closest support hand to the handguard:');
    for(const r of rows.slice(0,14)) console.log('   ', JSON.stringify(r));
    console.log('  current shipped pose for comparison:');
    console.log('   ', JSON.stringify(rows.find(r=>r.rx===-1.34&&r.rz===0.40&&r.lx===-1.26&&r.lz===-0.62&&r.hz===0.20)||'not in grid'));
    await b.close();
  } finally { server.kill(); }
})();
