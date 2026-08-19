// The sea's curve: is it in the geometry, and is any of it INSIDE the far plane where it can be seen?
// The previous attempt at a planetary bow put the whole bend past camera.far and measured a drop of 0.00.
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
const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,160)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,160));});
await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.setTime(0.25); localStorage.removeItem('hollowcraft_pines_v1');");
const r=await page.evaluate("__hc.cmdRun('/sea')");
(r.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('  '+x)));
// Out to sea, low, looking at the horizon — the only place a bow in the water is visible.
const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
const shore=await page.evaluate(`(()=>{ for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){ const x=Math.round(${IC.x}-d), z=${IC.z};
  if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z)}; } return null; })()`);
await page.evaluate(`__hc.tpAt(${shore.x}-40, ${SEA}+6, ${shore.z}); __hc.cam({yaw:0,pitch:0});`);
for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
await sleep(3000);
for(const d of [0, 14, 40]){
  await page.evaluate(`__hc.cmdRun('/sea curve ${d}')`); await sleep(900);
  const S=await page.evaluate('__hc.seaBow()');
  await page.screenshot({path:path.join(ROOT,'bench','results',`sea-curve-${d}.png`)});
  console.log(`  drop ${String(d).padStart(3)}  rim ${S.dropAtRim}  inside far ${S.dropAtFar}  -> sea-curve-${d}.png`);
}
await page.evaluate("__hc.cmdRun('/sea curve 14')");
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
