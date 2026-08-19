// Do the pines settings survive a reload? Saving without restoring is the same as not saving, and that is
// exactly how this failed the first time it was attempted.
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
const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,160)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,160));});
const boot=async()=>{ await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
  await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
  await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
  await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative');"); };
await boot();
await page.evaluate("localStorage.removeItem('hollowcraft_pines_v2'); __hc.cmdRun('/pines clear');");
for(const c of ['/pines at 105','/pines at -165','/pines at 60','/pines 2 flip h','/pines 3 size 40','/pines drop 12','/pines curve 0.16']){
  await page.evaluate(`__hc.cmdRun(${JSON.stringify(c)})`);
}
await sleep(900);
console.log('  before reload:', (await page.evaluate("__hc.cmdRun('/pines list')")).out.join(' ').replace(/\s+/g,' ').slice(0,200));
console.log('  stored       :', (await page.evaluate("localStorage.getItem('hollowcraft_pines_v2')||''")).slice(0,190));
await boot();
await sleep(2000);
console.log('  after reload :', (await page.evaluate("__hc.cmdRun('/pines list')")).out.join(' ').replace(/\s+/g,' ').slice(0,200));
const S=await page.evaluate('__hc.pinesState()');
console.log('  quads rebuilt:', S.n, ' uvs:', JSON.stringify(await page.evaluate('__hc.pinesMeshUV()')));
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
