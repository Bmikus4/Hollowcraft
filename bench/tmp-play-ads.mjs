// Is ADS even reaching the eye? Real RMB, poll the sight state, shoot a picture of several guns.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft';
const SHOT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/shots3';
fs.mkdirSync(SHOT,{recursive:true});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const GUNS=(process.env.GUNS||'ar15,revolver,hunting_rifle,shotgun').split(',');
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let b;
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.setTime(0.30)");
    await sleep(1200);
    for(const g of GUNS){
      await p.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(900);
      await p.screenshot({path:SHOT+'/'+g+'-hip.png'});
      await p.mouse.down({button:'right'});
      let s=null; for(let i=0;i<14;i++){ await sleep(200); s=await p.evaluate("__hc.sight()"); if(s.adsT>0.99) break; }
      console.log(g, JSON.stringify(s));
      await p.screenshot({path:SHOT+'/'+g+'-ads.png'});
      await p.mouse.up({button:'right'}); await sleep(700);
    }
  } finally { if(b)await b.close(); server.kill(); }
})();
