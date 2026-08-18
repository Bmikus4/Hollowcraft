// A MUST READ 180 ON THE DIAL, from anywhere, and stay there as the player walks.
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
const bad=[]; page.on('response',r=>{ if(r.status()>=400) bad.push(r.status()+' '+r.url().split('/').slice(3).join('/')); });
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,160)));
await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');");
await page.evaluate("__hc.cmdRun('/waypoint island center mass'); __hc.cmdRun('/waypoint shore'); __hc.cmdRun('/waypoint radius');");
const B=await page.evaluate('__hc.islandCentres().mass');
console.log('  walking round B; A must read 180 on the dial every time');
console.log('   walking straight out along one bearing. The spring is 1:1 near A (dev ~ move) and must SLOW');
console.log('   TO A STOP either side: |move| has to level off well below |dev| at both ends.');
console.log('   playerD        r       dev      move   reachAtA  across');
const SW=[];
for(let f=0.06; f<=1.9; f+=0.12) SW.push([Math.cos(0.5)*f*300, Math.sin(0.5)*f*300]);
for(const [ox,oz] of SW){
  await page.evaluate(`__hc.tpAt(${B.x}+${ox}, 140, ${B.z}+${oz});`);
  await sleep(700);
  const D=await page.evaluate('__hc.dialState()');
  if(!D||D.err){ console.log('   ',[ox,oz],'no dial', JSON.stringify(D)); continue; }
  const dev=(D.playerDist-D.r), mv=(D.reachAtA-D.r);
  console.log(`   ${String(D.playerDist).padStart(7)} ${String(D.r).padStart(8)} ${String(dev.toFixed(1)).padStart(9)} ${String(mv.toFixed(1)).padStart(9)} ${String(D.reachAtA).padStart(9)} ${String(D.reachAcross).padStart(9)}  ${'#'.repeat(Math.max(0,Math.round(D.reachAtA/12)))}`);
}
console.log(bad.length?('  HTTP failures: '+[...new Set(bad)].join(' , ')):'  no failed requests');
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
