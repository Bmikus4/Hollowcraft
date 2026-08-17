// SCOPE EYE RELIEF: the same rifle, the same ADS, at four values of the dial.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const SHOT='C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/scope';
fs.mkdirSync(SHOT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{ const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let b; try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    for(const pull of (process.env.PULLS||'0,0.07,0.14,0.20').split(',')){
      const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
      await p.goto(base+'/index.html?debug=1&scopepull='+pull,{waitUntil:'load',timeout:120000});
      await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
      await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
      await p.evaluate("__hc.lock(true); __hc.setTime(0.30)"); await sleep(1000);
      for(const g of (process.env.GUNS||'marksman_rifle').split(',')){
        await p.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(600);
        await p.evaluate("__hc.aim(true)");
        let s=null; for(let i=0;i<16;i++){ await sleep(200); s=await p.evaluate("__hc.sightLine('"+g+"',true)"); if(s.adsT>0.99) break; }
        await p.evaluate("__hc.aim(true)"); await sleep(900);
        await p.screenshot({path:SHOT+'/'+g+'-pull'+pull+'.png'});
        console.log(g,'pull',pull,'nearPush',s&&s.nearPush,'adsT',s&&s.adsT);
        await p.evaluate("__hc.aim(false)"); await sleep(400);
      }
      await p.close();
    }
  } finally { if(b)await b.close(); server.kill(); } })();
