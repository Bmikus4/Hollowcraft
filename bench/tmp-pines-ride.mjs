// Do the pines RIDE their point on the ring, and do they still face the player?
// Walk toward and away from B and watch each pine's world position move with the ring.
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
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,160)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,160));});
await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');");
await page.evaluate("__hc.cmdRun('/waypoint island center mass'); __hc.cmdRun('/waypoint shore'); __hc.cmdRun('/waypoint radius');");
await page.evaluate("__hc.cmdRun('/pines at 105 -165')");
const B=await page.evaluate('__hc.islandCentres().mass');
console.log('   THE TEST: each pine is placed at a DIAL degree and must still be standing on it from every');
console.log('   position. dialNow is worked back from the world position through the live dial.');
console.log('   playerD  reachAtA   pineA: set/now      world           pineB: set/now      world');
let prev=null;
for(const d of [60,140,220,300,380,460]){
  await page.evaluate(`__hc.tpAt(${B.x}+Math.cos(150*Math.PI/180)*${d}, 130, ${B.z}+Math.sin(150*Math.PI/180)*${d});`);
  await sleep(700);
  const D=await page.evaluate('__hc.dialState()'); const S=await page.evaluate('__hc.pinesState()');
  const f=S.facing;
  const bad=f.filter(q=>q.dialNow!=null && Math.abs(((q.dialNow-q.dial+540)%360)-180)>1.0);
  console.log(`   ${String(d).padStart(7)} ${String(D.reachAtA).padStart(9)}   ${String(f[0].dial+'/'+f[0].dialNow).padEnd(14)} ${String(JSON.stringify(f[0].at)).padEnd(16)} ${String(f[1].dial+'/'+f[1].dialNow).padEnd(14)} ${String(JSON.stringify(f[1].at)).padEnd(16)}${bad.length?'   <-- OFF ITS MARK':''}`);
  if(prev) { const mv=Math.hypot(f[0].at[0]-prev[0], f[0].at[1]-prev[1]); if(mv<0.01) console.log('      ^ pineA did not move at all'); }
  prev=f[0].at;
}
// AND THE BOW MUST SURVIVE THE FLIPS, which is the part of the request a screenshot would not settle.
for(const fl of ['flip h','flip v','flip none']){
  await page.evaluate(`__hc.cmdRun('/pines ${fl}')`); await sleep(500);
  const S=await page.evaluate('__hc.pinesState()');
  console.log(`   after /pines ${fl.padEnd(9)} bow ${S.facing.map(q=>q.bow).join(', ')}   facing ${S.facing.map(q=>q.dotToPlayer).join(', ')}`);
}
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
