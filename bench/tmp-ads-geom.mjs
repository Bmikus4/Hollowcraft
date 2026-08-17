// WHERE IS THE GUN, IN CAMERA SPACE, AT FULL ADS. A picture says "slab"; this says how close and how high.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
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
    await p.evaluate("__hc.lock(true); __hc.setTime(0.30)"); await sleep(1000);
    for(const g of ['ar15','revolver','hunting_rifle','shotgun','smg']){
      await p.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(500);
      const hip=await p.evaluate(`__hc.heldBox(${JSON.stringify(g)})`);
      await p.evaluate("__hc.aim(true)");
      for(let i=0;i<14;i++){ await sleep(200); const s=await p.evaluate("__hc.sight()"); if(s.adsT>0.99) break; }
      const st=await p.evaluate("__hc.sight()");
      const ads=await p.evaluate(`__hc.heldBox(${JSON.stringify(g)})`);
      console.log(g,'adsT',st.adsT,'hip',JSON.stringify(hip.view||hip),'ads',JSON.stringify(ads.view||ads));
      await p.evaluate("__hc.aim(false)"); await sleep(600);
    }
  } finally { if(b)await b.close(); server.kill(); }
})();
