// THE TRACED SHORELINE: does the loop actually wrap the island?
// Checked against the terrain itself, not by eye — every traced point must sit within a block or two of the
// waterline, and the loop must enclose the inscribed centre.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,200));});
await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative');");
const t0=Date.now();
const r=await page.evaluate("__hc.cmdRun('/waypoint shore')");
console.log('/waypoint shore  ('+(Date.now()-t0)+'ms)');
(r.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('   '+x)));
// VERIFY AGAINST THE TERRAIN. Every point should straddle the waterline: land within a couple of blocks
// inward, water within a couple outward. And the centre must be inside the loop (even-odd crossing count).
const V=await page.evaluate(`(()=>{ const O=__hc.islandOutline(), C=__hc.islandCentres().inscribed, sea=__hc.island().sea;
  const P=O.pts; let onEdge=0, land=0, water=0;
  // centroid of the loop, to push each sample inward/outward along the local normal
  let mx=0,mz=0; for(const q of P){ mx+=q[0]; mz+=q[1]; } mx/=P.length; mz/=P.length;
  for(const q of P){ let ux=q[0]-mx, uz=q[1]-mz; const L=Math.hypot(ux,uz)||1; ux/=L; uz/=L;
    const hin=__hc.groundY(Math.round(q[0]-ux*3), Math.round(q[1]-uz*3));
    const hout=__hc.groundY(Math.round(q[0]+ux*3), Math.round(q[1]+uz*3));
    if(hin>sea) land++;
    if(hout<=sea) water++;
    if(hin>sea && hout<=sea) onEdge++; }
  // is the inscribed centre inside the polygon?
  let inside=false;
  for(let i=0,j=P.length-1;i<P.length;j=i++){
    const a=P[i], b=P[j];
    if(((a[1]>C.z)!==(b[1]>C.z)) && (C.x < (b[0]-a[0])*(C.z-a[1])/(b[1]-a[1])+a[0])) inside=!inside; }
  return { n:P.length, onEdgePct:+(100*onEdge/P.length).toFixed(1), landInPct:+(100*land/P.length).toFixed(1),
           waterOutPct:+(100*water/P.length).toFixed(1), centreInside:inside }; })()`);
console.log(`  points ${V.n}   land 3 blocks inward ${V.landInPct}%   water 3 blocks outward ${V.waterOutPct}%   straddling the waterline ${V.onEdgePct}%`);
console.log(`  inscribed centre inside the loop: ${V.centreInside}`);
// THE INSET, MEASURED. Every finished point should sit about 15 blocks INSIDE the water, so the ground under
// it is land and the ground 15 blocks further out along its own normal is not. Roughness is the mean turn
// angle between consecutive segments -- a jagged loop has a big one, a smooth loop a small one.
const D=await page.evaluate(`(()=>{ const O=__hc.islandOutline(), P=O.pts, sea=__hc.island().sea;
  let onLand=0, turn=0;
  for(let i=0;i<P.length;i++){
    if(__hc.groundY(Math.round(P[i][0]), Math.round(P[i][1]))>sea) onLand++;
    const a=P[(i-1+P.length)%P.length], b=P[i], c=P[(i+1)%P.length];
    const t1=Math.atan2(b[1]-a[1], b[0]-a[0]), t2=Math.atan2(c[1]-b[1], c[0]-b[0]);
    let d=Math.abs(t2-t1); if(d>Math.PI) d=2*Math.PI-d; turn+=d; }
  return { onLandPct:+(100*onLand/P.length).toFixed(1), meanTurnDeg:+(turn/P.length*180/Math.PI).toFixed(2),
           dials:{close:O.closeR, smooth:O.smooth, passes:O.passes, inset:O.inset}, raw:O.raw, n:P.length }; })()`);
console.log(`  dials ${JSON.stringify(D.dials)}   traced ${D.raw} raw -> ${D.n} points`);
console.log(`  points standing on LAND after the 15-block inset: ${D.onLandPct}%   mean turn between segments ${D.meanTurnDeg} deg`);
console.log(errs.length?('ERRORS: '+errs.slice(0,4).join(' | ')):'no errors');
await browser.close(); server.kill();
