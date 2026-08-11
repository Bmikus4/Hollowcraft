// THE DOT IN ITS WINDOW *WHILE THINGS MOVE*: across the ADS ramp, while turning, while walking, and on the buck.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));}); });
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function poll(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250);});})();});
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const SAMP=(cfg)=>new Promise(res=>{
  const rows=[]; let i=0;
  const tick=()=>{ if(cfg.turn) __hc.cam({yaw:(__hc.pos().yaw||0)+cfg.turn});
    if(cfg.key && i===0) __hc.key(cfg.key,true);
    const a=__hc.holoAlign(); rows.push([+a.adsT, a.holoVsGlass, a.glassOff, a.holoOff, a.retVisible?1:0]);
    if(++i<cfg.frames) requestAnimationFrame(tick);
    else { if(cfg.key) __hc.key(cfg.key,false);
      res({ n:rows.length, worst:Math.max.apply(null,rows.map(r=>r[1]||0)),
            worstAt:rows.reduce((b,r)=>(r[1]||0)>(b[1]||0)?r:b,[0,0])[0],
            visWorst:Math.max.apply(null,rows.filter(r=>r[4]).map(r=>r[1]||0)),
            head:rows.slice(0,10).map(r=>[+r[0].toFixed(2),r[1]]),
            tail:rows.slice(-3).map(r=>[+r[0].toFixed(2),r[1]]) }); } };
  requestAnimationFrame(tick); });
(async()=>{ const port=await freePort();
 const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
 try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
  page.on('pageerror',e=>console.log('PAGEERROR',String(e.message||e).slice(0,160)));
  await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
  await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
  await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
  await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
  await sleep(2000);
  for(const g of ['ar15_dot','hunting_rifle_dot']){
    await page.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1")`); await sleep(250);
    await page.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(400);
    await page.evaluate('__hc.aim(true)');
    console.log(g,'RAISE  ', JSON.stringify(await page.evaluate(SAMP,{frames:110})));
    await sleep(600);
    console.log(g,'TURN   ', JSON.stringify(await page.evaluate(SAMP,{frames:60,turn:0.03})));
    console.log(g,'WALK   ', JSON.stringify(await page.evaluate(SAMP,{frames:80,key:'KeyW'})));
    await page.evaluate('__hc.aim(false)'); await sleep(500);
  }
  await browser.close();
 } finally { try{server.kill();}catch(e){} } })();
