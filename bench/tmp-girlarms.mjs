// Which way is "arms down"? One probe run, four pokes, printed. Used to settle the ARM constant in
// src/entity/giantess/index.js — she walked in with her arms spread in the file's A-pose, which reads as
// gliding rather than walking.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative');`);
    await page.waitForFunction(`(()=>{try{return __hc.girlState().loaded===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`__hc.girl(30)`); await sleep(200);
    for (const [bone, read] of [['upper_arm.L','hand.L'], ['upper_arm.R','hand.R']])
      for (const ax of ['x','y','z'])
        for (const amt of [0.7, -0.7])
          console.log(bone, ax, amt, JSON.stringify(await page.evaluate(`__hc.girlPoke('${bone}','${ax}',${amt},'${read}')`)));
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
