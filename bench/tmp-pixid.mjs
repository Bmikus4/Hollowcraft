// PIXEL IDENTITY: the same frozen frame, at the same time, from the same vantage. A byte-identical PNG is a
// byte-identical picture, so a refactor that claims to change nothing can be held to it.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs'; import crypto from 'node:crypto';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const SHOT=process.env.OUT||'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/pixid';
fs.mkdirSync(SHOT,{recursive:true});
const TAG=process.env.TAG||'x';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{ const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let b; try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:960,height:540}})).newPage();
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    // frozen and pinned: same clock, same scene, no wind, no creature, no grain drift
    // THE VANTAGE HAS TO BE PINNED TOO. Frozen and pinned alone left the camera wherever the spawn drop put it, and
    // two identical runs then differed by a mean of 4.7/255 with 62% of pixels apart — a noise floor big enough to
    // hide any change worth making. tp with an explicit yaw/pitch is the form the verification shots use.
    await p.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freeze(true,false); __hc.tp(276.5, 46, 44, 1.2, -0.15); __hc.freezeT(12.0);");
    await sleep(1500);
    for(const [t,name] of [[0.30,'day'],[0.95,'night']]){
      await p.evaluate(`__hc.setTime(${t})`); await sleep(4000);
      const b1=await p.screenshot({path:SHOT+'/'+name+'-'+TAG+'.png'});
      await sleep(900);
      const b2=await p.screenshot({path:SHOT+'/'+name+'-'+TAG+'b.png'});
      console.log(name, crypto.createHash('md5').update(b1).digest('hex'), crypto.createHash('md5').update(b2).digest('hex'), b1.equals(b2)?'SAME FRAME':'frames differ within one run');
    }
  } finally { if(b)await b.close(); server.kill(); } })();
