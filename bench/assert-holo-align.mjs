// EVERY HOLOSIGHT LANDS ON THE AIM AXIS AT FULL ADS (Ben 08-04: "not all holosights are lined up in the centerpoints for guns
// when ADS, the rifle is one example" / "the top of holosights are still cut off").
//   node bench/assert-holo-align.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(1000);
    await page.evaluate(`(()=>{ const pr=__hc.probe(); __hc.tp(pr.x, pr.gyHere+2, pr.z); __hc.giveItem('rifle_ammo',200); __hc.freeze(true,false); })()`);
    await sleep(600);
    for(const g of GUNS){
      await page.evaluate(`(()=>{ __hc.aim(false); __hc.hold('${g}'); })()`); await sleep(500);
      await page.evaluate(`__hc.aim(true)`); await sleep(1500);
      await page.evaluate(`__hc.cam({yaw:0,pitch:0})`); await sleep(900);
      const d = await page.evaluate(`__hc.holoDbg()`);
      // AND WHILE TURNING, which is when it actually clipped: the pose correction used to be a frame stale, so the faster you
      // swung the further the glass slid off the reticle. Measured in the same evaluate as the turn, not after it settles.
      const turning = await page.evaluate(`(()=>{ const a=__hc.cam(); __hc.cam({yaw:a.yaw+0.10, pitch:a.pitch+0.05}); return __hc.holoDbg(); })()`);
      console.log('   ', g.padEnd(30), JSON.stringify(d).slice(0,190));
      if(d && d.no){ ok(g+': has a sight window to line up', false, d); continue; }
      ok(g+': the sight is at full ADS', d.adsT>0.95, {adsT:d.adsT});
      // The reticle is a 0.0099 rad ring about the aim axis, clipped to the window. For the WHOLE ring to be inside the glass
      // the window's centre has to be within (its own half-angle - the ring's radius) of the axis; anything more clips an arc
      // off it, which is the "top cut off" he reported.
      const room = d.apHalfAngle - d.ringHalfAngle;
      ok(g+': the whole reticle fits inside the glass', d.offAxisAngle < room, {off:d.offAxisAngle, room:+room.toFixed(5)});
      ok(g+': …and it still fits mid-turn', turning.offAxisAngle < (turning.apHalfAngle-turning.ringHalfAngle), {off:turning.offAxisAngle, room:+(turning.apHalfAngle-turning.ringHalfAngle).toFixed(5)});
      await page.evaluate(`__hc.aim(false)`); await sleep(350);
    }
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
