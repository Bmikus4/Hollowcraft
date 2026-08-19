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
page.on('pageerror',e=>console.log('THROW:', String(e.message||e).slice(0,300)));
page.on('console',m=>{ const t=m.text(); if(/error|exception|not defined|undefined|Cannot/i.test(t)) console.log('CONSOLE:', t.slice(0,300)); });
await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
await sleep(25000);
console.log('started:', await page.evaluate("(()=>{try{return !!(window.__hc&&__hc.st().started)}catch(e){return 'no __hc: '+e.message}})()"));
console.log('load overlay display:', await page.evaluate("(document.getElementById('load')||{style:{}}).style.display"));
await browser.close(); server.kill();
