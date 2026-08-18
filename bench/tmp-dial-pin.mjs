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
console.log('   the ring is elastic on the A axis: reachAtA should follow the PLAYER, reachAcross should stay r');
console.log('   player offset     dialOfA        r   playerDist   reachAtA   reachAcross');
for(const [ox,oz] of [[120,60],[-200,140],[40,-260],[260,-40],[-90,-90],[60,30]]){
  await page.evaluate(`__hc.tpAt(${B.x}+${ox}, 140, ${B.z}+${oz});`);
  await sleep(700);
  const D=await page.evaluate('__hc.dialState()');
  if(!D||D.err){ console.log('   ',[ox,oz],'no dial', JSON.stringify(D)); continue; }
  console.log(`   ${String(JSON.stringify([ox,oz])).padEnd(14)} ${String(D.dialOfA).padStart(7)} ${String(D.r).padStart(8)} ${String(D.playerDist).padStart(12)} ${String(D.reachAtA).padStart(10)} ${String(D.reachAcross).padStart(13)}`);
}
console.log(bad.length?('  HTTP failures: '+[...new Set(bad)].join(' , ')):'  no failed requests');
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
