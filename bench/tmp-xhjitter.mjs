// HOW FAR THE RETICLE MOVES BETWEEN ONE FRAME AND THE NEXT while you pan across a scene full of edges.
// Jitter is not a look, it is a number: the frame-to-frame step of offX/offY. A smooth reticle glides (small steps, no spikes);
// a jittery one snaps (isolated steps of tens of px) as the range raycast crosses a silhouette.
//   HC_PAGE=index.qa.html HC_TAG=head node bench/tmp-xhjitter.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const PAGE=process.env.HC_PAGE||'index.html', TAG=process.env.HC_TAG||'now';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0,checks=0; const ok=(n,c,d)=>{ checks++; if(!c)fails++; console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+JSON.stringify(d)):'')); };
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
const errs=[]; page.on('pageerror',e=>{errs.push(String(e.message||e));console.log('  PAGEERROR:',String(e.message||e).slice(0,200));});
await page.goto(base+'/'+PAGE+'?debug=1',{waitUntil:'load',timeout:120000});
await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
const ev=js=>page.evaluate(js);
await ev('(()=>{ __hc.lock(true); __hc.setTime(0.42); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
await sleep(2500);

// A PAN IN THE ENGINE'S OWN FRAMES, not one evaluate per step: sampling from inside a rAF loop is the only way to see a
// frame-to-frame step at all. Yaw sweeps a full turn so the ray crosses every silhouette in the loaded world.
const pan=async(label)=>{
  const r=await ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
    const N=240, out=[];
    for(let i=0;i<N;i++){ __hc.cam({yaw:(i/N)*Math.PI*2, pitch:-0.05}); await f();
      const p=__hc.xhProbe(); out.push([p.offX,p.offY,p.applied,p.easedDist==null?-1:p.easedDist]); }
    let maxStep=0, sum=0, spikes=0, n=0;
    for(let i=1;i<out.length;i++){ const dx=out[i][0]-out[i-1][0], dy=out[i][1]-out[i-1][1];
      const s=Math.hypot(dx,dy); if(s>maxStep)maxStep=s; sum+=s; n++; if(s>12)spikes++; }
    return { maxStep:+maxStep.toFixed(1), meanStep:+(sum/n).toFixed(2), spikes, applied:out[out.length-1][2], samples:out.length }; })()`);
  console.log('  '+TAG+' '+label.padEnd(30)+JSON.stringify(r));
  return r;
};
await ev('__hc.tpsProbe(true)'); await sleep(600);
await ev('__hc.offNone(); __hc.cmdRun("/clearinv"); __hc.cmdRun("/give ar15 1")'); await ev('__hc.hold("ar15")'); await sleep(800);
const tpsHip=await pan('TPS mainhand hip');
await ev('__hc.aim(true)'); await sleep(900);
const tpsAds=await pan('TPS mainhand aimed');
await ev('__hc.aim(false)'); await sleep(400);
// AIMED IN THIRD PERSON, MOVING: the ring must still open. Compared against the same aim standing still.
const still=await ev('__hc.xhProbe()');
await ev('__hc.aim(true)'); await sleep(900);
const aimStill=await ev('__hc.xhProbe()');
// AIRBORNE FOR REAL. There is no __hc.jump, and `__hc.jump && __hc.jump()` silently did nothing — the first version of this
// check passed the player standing still and called it a jump. Lifting them and sampling on the way down is airborne by physics.
const aimAir=await ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  const p=__hc.pos(); __hc.tpAt(p.x, p.y+4.5, p.z);
  let best=null; for(let i=0;i<40;i++){ await f(); const q=__hc.xhProbe(); if(q.airborne && (!best||q.applied>best.applied)) best=q; }
  return best; })()`).catch(()=>null);
console.log('  aimed still: applied '+aimStill.applied+'   aimed after a jump: applied '+(aimAir?aimAir.applied:'n/a'));
await ev('__hc.aim(false)'); await sleep(300);
// THE OFFHAND, both cameras. A gun in the left hand alone must still get a gun ring that rides its barrel.
await ev('__hc.holdNone(); __hc.offhandSet("ar15",1)'); await sleep(900);
const offTps=await ev('__hc.xhProbe()');
console.log('  offhand-only TPS: '+JSON.stringify({mainGun:offTps.mainGun,offGun:offTps.offGun,applied:offTps.applied,spreadPx:offTps.spreadPx,offX:offTps.offX}));
await ev('__hc.tpsProbe(false)'); await sleep(700);
const offFp=await ev('__hc.xhProbe()');
console.log('  offhand-only 1st: '+JSON.stringify({mainGun:offFp.mainGun,offGun:offFp.offGun,applied:offFp.applied,spreadPx:offFp.spreadPx,offX:offFp.offX,offY:offFp.offY}));
const fpJit=await pan('1st person offhand-only');

console.log('');
ok('TPS hip: no frame-to-frame spike over 12px', tpsHip.spikes===0, tpsHip);
ok('TPS aimed: no frame-to-frame spike over 12px', tpsAds.spikes===0, tpsAds);
ok('1st person: no frame-to-frame spike over 12px', fpJit.spikes===0, fpJit);
ok('aiming in TPS while airborne still opens the ring', !!(aimAir && aimAir.applied>aimStill.applied+1),
   {still:aimStill.applied, air:aimAir&&aimAir.applied, wasAirborne:aimAir&&aimAir.airborne});
ok('an offhand-only gun gets a gun ring in TPS', offTps.offGun===true && offTps.mainGun===false && offTps.spreadPx>0, {spreadPx:offTps.spreadPx});
// The offhand hip pose carries no yaw or pitch, so its axis IS the screen centre and an offset of 0 is the correct answer.
// What must be true is that the ring is riding THAT hand's axis, which is what `axis` reports.
ok('and in first person the ring rides the OFFHAND axis', offFp.offGun===true && offFp.axis==='off', {axis:offFp.axis, offX:offFp.offX});
ok('no page errors', errs.length===0, errs.slice(0,2));
console.log(`\n${checks-fails}/${checks} checks pass`);
await browser.close(); server.kill(); process.exit(fails?1:0);
