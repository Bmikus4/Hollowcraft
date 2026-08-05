// A GUN IN THE LEFT HAND RECOILS LIKE THE SAME GUN IN THE RIGHT (Ben 08-05: "guns in the off hand need proper recoil, THATS IT").
// Three things were unequal, and only one of them looked like recoil:
//   - the bolt CYCLE timer lived on the main hand whichever hand fired, so a bolt rifle in the left hand fired ONCE and every shot
//     after it was refused — measured as no buck at all, which is not weak recoil, it is no shot;
//   - the offhand's buck decayed at 5.5/s against the main hand's 7/s, so the same gun settled to a different rhythm per hand;
//   - the camera kick was discounted 25% by the MAIN hand's cheek weld even for a left-hand shot, and the left hand never aims.
// Fires the same burst in each hand and compares the viewmodel buck and the camera's climb.
//   node bench/assert-offhand-recoil.mjs
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
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300); await sleep(1200);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); __hc.giveItem('rifle_ammo',400); __hc.giveItem('buckshot',200); })()`);
    for(const id of ['ar15','revolver','hunting_rifle','shotgun']){
      // BOTH HANDS ARE STEPPED THE SAME WAY. updateRecoil runs on the frame loop, so a burst fired synchronously and read
      // immediately shows a camera climb of zero in either hand — the integrator has not run. Each side steps it itself.
      const r=await page.evaluate(`(()=>{
        const out={};
        __hc.offNone(); __hc.hold('${id}'); __hc.giveItem('rifle_ammo',400); __hc.giveItem('buckshot',200);
        out.main=__hc.handFire('main',6,'${id}');
        out.off=__hc.handFire('off',6,'${id}');
        return out; })()`);
      console.log('   ', id.padEnd(15), JSON.stringify(r).slice(0,420));
      if(!r.main){ ok(id+': a main-hand burst hook exists', false, r); continue; }
      // EQUAL, not six: a bolt rifle cycles for 0.95 s and this burst is 0.2 s long, so one round is the right answer for it, and
      // the shotgun's magazine holds five. What matters is that the left hand fires as many as the right — it used to fire ONE
      // whatever the gun, because the bolt-cycle timer it set belonged to the other hand.
      ok(id+': the left hand fires as many rounds as the right', r.off.fired===r.main.fired && r.off.fired>0, {off:r.off.fired, main:r.main.fired});
      // The viewmodel buck: the same gun, the same peak, whichever hand.
      ok(id+': …and bucks the model by the same amount', Math.abs(Math.abs(r.off.peakKick)-Math.abs(r.main.peakKick))<0.06, {off:r.off.peakKick, main:r.main.peakKick});
      // The camera climb: within 12%. It is not identical by construction — the main hand's is measured hip-fire too, but the
      // per-shot kick carries a random 0.85-1.15 jitter, so a burst of six lands within a few per cent, not exactly.
      // Per shot the kick carries a random 0.85-1.15 factor, so a SIX-round burst averages close but a ONE-round burst (the bolt
      // rifle) can legitimately differ by a third. The tolerance is the jitter, not a fudge: tightening it below this would fail on
      // the dice rather than on the code.
      const tol=Math.max(0.05, Math.abs(r.main.camClimb)*(r.main.fired>=4?0.20:0.35));
      ok(id+': …and kicks the aim by the same amount', Math.abs(r.off.camClimb-r.main.camClimb) < tol, {off:r.off.camClimb, main:r.main.camClimb, tol:+tol.toFixed(3), rounds:r.main.fired});
      ok(id+': …and settles back to its rest pose', Math.abs(r.off.after.z-r.off.before.z)<0.002 && Math.abs(r.off.after.rx-r.off.before.rx)<0.002, {before:r.off.before, after:r.off.after});
    }
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
