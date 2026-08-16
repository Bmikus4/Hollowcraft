import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
async function boot(tag){ const p=await (await b.newContext({viewport:{width:700,height:400}})).newPage();
  p.on('pageerror',e=>console.log(tag,'ERR',String(e.message).slice(0,120)));
  await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
  await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
  await p.waitForFunction("(()=>{try{return __hc.girlState().loaded===true;}catch(e){return false;}})()",null,{timeout:180000});
  return p; }
const A=await boot('A'), B=await boot('B');
// count what each side sends and receives, by wrapping the socket hooks the game already uses
const ws='ws://127.0.0.1:'+port;
await A.evaluate(u=>__hc.mpConnect(u), ws); await sleep(1500);
await B.evaluate(u=>__hc.mpConnect(u), ws); await sleep(3000);
console.log('A net', JSON.stringify(await A.evaluate("__hc.mpPeers()")));
console.log('B net', JSON.stringify(await B.evaluate("__hc.mpPeers()")));
await A.evaluate("__hc.girl(16)"); await sleep(2000);
console.log('A girl', JSON.stringify(await A.evaluate("__hc.girlNet?__hc.girlNet():__hc.girlState().active")));
console.log('B girl', JSON.stringify(await B.evaluate("__hc.girlNet?__hc.girlNet():__hc.girlState().active")));
await b.close(); server.kill();
