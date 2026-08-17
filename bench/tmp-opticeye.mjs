import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
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
    await p.evaluate("__hc.lock(true)"); await sleep(800);
    for(const g of (process.env.GUNS||'ar15,ak,smg,shotgun_long,marksman_rifle').split(',')){
      for(const a of (process.env.ATTS||'red_dot,holo_sight,optic_scope').split(',')){
        await p.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(350);
        const f=await p.evaluate(`(()=>{__hc.cmdRun('/give ${a} 1'); const r=__hc.attFit('optic',${JSON.stringify(a)});
          if(process_all){ __hc.cmdRun('/give suppressor 1'); __hc.cmdRun('/give foregrip 1'); __hc.cmdRun('/give weapon_light 1'); __hc.cmdRun('/give laser_sight 1');
            __hc.attFit('muzzle','suppressor'); __hc.attFit('grip','foregrip'); __hc.attFit('light','weapon_light'); __hc.attFit('laser','laser_sight'); }
          return !!r.fitted.length;})()`.replace('process_all', ${process.env.ALL?'true':'false'}));
        if(!f){ console.log(g,a,'DOES NOT FIT'); continue; }
        await p.evaluate("__hc.aim(true)");
        let s=null; for(let i=0;i<14;i++){ await sleep(180); s=await p.evaluate("__hc.opticEye()"); if(s.adsT>0.99) break; }
        console.log(g.padEnd(15),a.padEnd(12),JSON.stringify(s));
        await p.evaluate("__hc.aim(false)"); await sleep(400);
      }
    }
  } finally { if(b)await b.close(); server.kill(); } })();
