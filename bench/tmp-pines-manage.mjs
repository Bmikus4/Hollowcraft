// Can pines be placed and managed with NO dial up? That gate is what Ben hit.
// Runs every command he would type, from a cold start, and prints exactly what the console would say.
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
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); localStorage.removeItem('hollowcraft_pines_v1');");
console.log('  === cold start, NO dial up ===');
for(const c of ['/pines at 105','/pines at -165','/pines at 60','/pines list','/pines 2 deg -150','/pines list','/pines 2 remove','/pines list']){
  const r=await page.evaluate(`__hc.cmdRun(${JSON.stringify(c)})`);
  console.log('  '+c); (r.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('      '+x)));
}
await sleep(1200);
let S=await page.evaluate('__hc.pinesState()');
console.log('  state:', JSON.stringify(S).slice(0,200));
console.log('  === now bring the dial up ===');
await page.evaluate("__hc.cmdRun('/waypoint island center mass'); __hc.cmdRun('/waypoint shore'); __hc.cmdRun('/waypoint radius');");
await sleep(1400);
S=await page.evaluate('__hc.pinesState()');
for(const f of (S.facing||[])) console.log(`    dial ${String(f.dial).padStart(5)}  at ${JSON.stringify(f.at)}  facing ${f.dotToPlayer}  bow ${f.bow}`);
const R=await page.evaluate("__hc.cmdRun('/pines 2 remove')"); console.log('  /pines 2 remove ->', (R.out||[]).join(' ').split('\n')[0]);
S=await page.evaluate('__hc.pinesState()'); console.log(`  quads now: ${S.n}`);
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
