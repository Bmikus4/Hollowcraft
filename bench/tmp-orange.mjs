// BEN'S FRAME: night, under trees, looking up. Are the amber dots the motes, or something else?
import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const SHOT='C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/orange';
fs.mkdirSync(SHOT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{ const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let b; try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    // his frame: midnight, in the wood, looking up into the canopy
    await p.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freezeT(12.0); __hc.setTime(0.75);");
    await sleep(1500);
    console.log('motes', JSON.stringify(await p.evaluate("__hc.motes()")));
    await p.evaluate("__hc.tp(276.5, 46, 60, 0.6, 0.55)");   // up into the trees
    await sleep(4000);
    await p.screenshot({path:SHOT+'/a-motes-on.png'});
    console.log('volLights', JSON.stringify(await p.evaluate("__hc.volLights()")).slice(0,600));
    await p.evaluate("__hc.motes(false)"); await sleep(2500);
    await p.screenshot({path:SHOT+'/b-motes-off.png'});
    await p.evaluate("__hc.motes(true)"); await sleep(2500);
    await p.screenshot({path:SHOT+'/c-motes-on-again.png'});
    console.log('done');
  } finally { if(b)await b.close(); server.kill(); } })();
