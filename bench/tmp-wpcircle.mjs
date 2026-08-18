// /waypoint circle — the shoreline radius from the centre of mass, and the circle drawn from it.
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
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,200));});
await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.setTime(0.25);");
for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
await sleep(2000);
for(const c of ['/waypoint island center','/waypoint circle','/waypoint circle mass max','/waypoint circle inscribed']){
  const r=await page.evaluate(`__hc.cmdRun(${JSON.stringify(c)})`);
  console.log(c);
  (r.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('    '+x)));
}
// From the air, straight down, so the circle can be seen against the coast it was measured from.
const C=await page.evaluate('__hc.islandCentres()');
await page.evaluate(`__hc.cmdRun('/waypoint circle mass mean'); __hc.tpAt(${C.mass.x}, 520, ${C.mass.z}); __hc.cam({yaw:0,pitch:-1.5});`);
for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
await sleep(4000);
await page.screenshot({path:path.join(ROOT,'bench','results','wpcircle-top.png')});
console.log(errs.length?('ERRORS: '+errs.slice(0,4).join(' | ')):'no errors');
await browser.close(); server.kill();
