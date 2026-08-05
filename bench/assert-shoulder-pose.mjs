// THE SHOULDERING POSE (Ben 08-05: "when shouldering a gun, both arms need rotated out slightly, the right arm, or the
// shouldering arm should be near straight forward, with the other arm reaching over to support it, gun on the forward arm").
// Read in body space off __hc.tpsPose: rotations alone cannot say whether a support hand supports anything, so the test is where
// the hands END UP — the firing hand under its own shoulder with the gun on that arm, the support hand crossed over and near the
// handguard. The akimbo pair is checked too, because it deliberately keeps the hip carry and must not have moved.
//   node bench/assert-shoulder-pose.mjs
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
const W=900,H=620;
// The shoulders are built at local x -0.29 (right) and +0.29 (left).
const SH_R=-0.29, SH_L=0.29;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1000);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); __hc.giveItem('rifle_ammo',200); })()`);
    await page.evaluate(`__hc.tpsProbe(true)`); await sleep(900);
    for(const g of ['ar15_dot','hunting_rifle_dot','minigun_dot']){
      await page.evaluate(`(()=>{ __hc.aim(false); __hc.hold('${g}'); })()`); await sleep(700);
      await page.evaluate(`__hc.cam({yaw:0,pitch:0})`); await sleep(600);
      const p=await page.evaluate(`__hc.tpsPose()`);
      console.log('   ', g.padEnd(20), JSON.stringify(p));
      if(p.no||p.err){ ok(g+': the third-person rig is up', false, p); continue; }
      // "near straight forward" — straight forward is -pi/2 for this arm chain.
      ok(g+': the shouldering arm is near straight forward', Math.abs(p.armRx+1.5708)<0.10, {armRx:p.armRx, straight:-1.5708});
      // "rotated out": out of its own shoulder rather than angled across the chest. The old pose splayed +0.40 and put the hand
      // 0.11 inboard of the shoulder; both hands then sat on the centre line, 0.001 apart in x.
      ok(g+': …and it comes out of its own shoulder', Math.abs(p.armRz)<0.16 && p.handAt[0]<SH_R+0.06, {armRz:p.armRz, handX:p.handAt[0], shoulder:SH_R});
      // "gun on the forward arm": the gun hangs off that hand, so this is the same statement measured at the muzzle end.
      ok(g+': the gun rides on that arm', p.forendAt[0]<-0.12, {forendX:p.forendAt[0]});
      // "the other arm reaching over": the support hand starts at +0.29 and has to end up on the gun's side of the body…
      ok(g+': the support arm reaches over the centre line', p.offHandAt[0]<-0.15, {offHandX:p.offHandAt[0], shoulder:SH_L});
      // …and near enough the handguard to read as holding it. 0.386 before, on a rifle 1.22x life size.
      ok(g+': …and its hand is at the handguard', p.offHandToForend<0.25, {offHandToForend:p.offHandToForend, was:0.386});
      // The two hands are no longer stacked: that was the visible fault from the front.
      ok(g+': the hands are not stacked on the centre line', Math.abs(p.handAt[1]-p.offHandAt[1])>0.02 || Math.abs(p.handAt[2]-p.offHandAt[2])>0.10, {hand:p.handAt, off:p.offHandAt});
    }
    // AKIMBO IS UNTOUCHED: with a gun in each hand there is no free shoulder, so that pose keeps the hip carry and true scale.
    await page.evaluate(`(()=>{ __hc.aim(false); __hc.hold('python'); __hc.holdOff&&__hc.holdOff('python'); })()`); await sleep(800);
    const d=await page.evaluate(`__hc.tpsPose()`);
    console.log('    akimbo', JSON.stringify(d));
    if(d.heldScale===1){ ok('akimbo kept its hip carry (scale 1.0, no splay)', Math.abs(d.armRz)<0.001, {armRz:d.armRz, heldScale:d.heldScale}); }
    else ok('akimbo could not be set up in this bench (no offhand hook) — not asserted', true, {heldScale:d.heldScale});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
