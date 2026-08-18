// THE BEARING DIAL: R is where the axis leaves the shoreline, and the crossing must land ON the rim.
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
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');");
for(const c of ['/waypoint island center mass','/waypoint shore','/waypoint circle']){
  const r=await page.evaluate(`__hc.cmdRun(${JSON.stringify(c)})`);
  console.log(c); (r.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('   '+x)));
}
// THE CHECKS THAT MATTER, from four different player positions:
//  1. the crossing is exactly R from the centre (it is on the rim by construction, so this catches a wrong R)
//  2. the crossing lies ON the shoreline loop (distance to the nearest loop segment ~ 0)
//  3. R changes as the player moves, because the axis direction does
const V=await page.evaluate(`(()=>{ const out=[]; const C=__hc.islandCentres().mass;
  const P=__hc.islandOutline().pts;
  const segDist=(x,z)=>{ let best=1e9;
    for(let i=0,j=P.length-1;i<P.length;j=i++){ const ax=P[j][0],az=P[j][1],bx=P[i][0],bz=P[i][1];
      const ex=bx-ax, ez=bz-az, L2=ex*ex+ez*ez||1;
      let t=((x-ax)*ex+(z-az)*ez)/L2; t=Math.max(0,Math.min(1,t));
      const d=Math.hypot(x-(ax+ex*t), z-(az+ez*t)); if(d<best) best=d; }
    return best; };
  for(const [ox,oz] of [[120,60],[-200,140],[40,-260],[260,-40]]){
    __hc.tpAt(C.x+ox, 120, C.z+oz);
    const dx=(C.x+ox)-C.x, dz=(C.z+oz)-C.z, L=Math.hypot(dx,dz);
    const H=__hc.shoreHit(C.x,C.z,dx/L,dz/L);
    if(!H){ out.push({from:[ox,oz], miss:true}); continue; }
    out.push({ from:[ox,oz], R:+H.r.toFixed(1), crossings:H.crossings,
               distFromCentre:+Math.hypot(H.x-C.x,H.z-C.z).toFixed(2),
               offLoop:+segDist(H.x,H.z).toFixed(2),
               bearing:+(Math.atan2(dz,dx)*180/Math.PI).toFixed(1) }); }
  return out; })()`);
console.log('  player offset      R      crossing dist from centre   off the loop   bearing');
for(const v of V) console.log(v.miss?`  ${JSON.stringify(v.from)}  NO CROSSING`
  :`  ${String(JSON.stringify(v.from)).padEnd(14)} ${String(v.R).padStart(7)} ${String(v.distFromCentre).padStart(20)} ${String(v.offLoop).padStart(14)} ${String(v.bearing).padStart(9)}`);
console.log(errs.length?('ERRORS: '+errs.slice(0,4).join(' | ')):'no errors');
await browser.close(); server.kill();
