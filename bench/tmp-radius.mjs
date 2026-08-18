// /waypoint radius — A on the shoreline, B the waypoint, r = |AB|, circle centred on B.
// The check that matters most is the one the last attempt failed: the SHORELINE MUST STILL BE VISIBLE.
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
for(const c of ['/waypoint island center mass','/waypoint shore','/waypoint radius']){
  const r=await page.evaluate(`__hc.cmdRun(${JSON.stringify(c)})`);
  console.log(c); (r.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('   '+x)));
}
const S=await page.evaluate('__hc.wpState()');
console.log(`  SHORELINE still drawn: ${S.shoreVisible}  (${S.shorePoints} points)   circle drawn: ${S.ringVisible}   labels ${S.ringLabels}`);
// A must lie on the loop and exactly r from B, from several positions.
const V=await page.evaluate(`(()=>{ const out=[]; const B=__hc.islandCentres().mass; const P=__hc.islandOutline().pts;
  const segDist=(x,z)=>{ let best=1e9;
    for(let i=0,j=P.length-1;i<P.length;j=i++){ const ax=P[j][0],az=P[j][1],bx=P[i][0],bz=P[i][1];
      const ex=bx-ax, ez=bz-az, L2=ex*ex+ez*ez||1;
      let t=((x-ax)*ex+(z-az)*ez)/L2; t=Math.max(0,Math.min(1,t));
      const d=Math.hypot(x-(ax+ex*t), z-(az+ez*t)); if(d<best) best=d; }
    return best; };
  for(const [ox,oz] of [[120,60],[-200,140],[40,-260],[260,-40]]){
    const L=Math.hypot(ox,oz), A=__hc.shoreHit(B.x,B.z,ox/L,oz/L);
    if(!A){ out.push({from:[ox,oz],miss:true}); continue; }
    out.push({ from:[ox,oz], r:+A.r.toFixed(1), AB:+Math.hypot(A.x-B.x,A.z-B.z).toFixed(2),
               AoffLoop:+segDist(A.x,A.z).toFixed(2) }); }
  return out; })()`);
console.log('  player offset        r      |AB|     A off the shoreline');
for(const v of V) console.log(`  ${String(JSON.stringify(v.from)).padEnd(14)} ${String(v.r).padStart(7)} ${String(v.AB).padStart(9)} ${String(v.AoffLoop).padStart(9)}`);
console.log(errs.length?('ERRORS: '+errs.slice(0,4).join(' | ')):'no errors');
await browser.close(); server.kill();
