// The shotgun in ADS, in DAYLIGHT, with the muzzle flash pinned on: can you see inside the stock, and can you see the flash?
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync']});
    const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    await page.evaluate('__hc.cam({yaw:0,pitch:-0.15})');
    await page.evaluate('__hc.cmdRun("/clearinv"); __hc.cmdRun("/give shotgun 1")'); await sleep(400);
    await page.evaluate('__hc.hold("shotgun")'); await sleep(500);
    await page.evaluate('__hc.aim(true)');
    for(let i=0;i<30;i++){ if((await page.evaluate('__hc.adsClearance()')).adsT>=0.999) break; await sleep(150); }
    console.log('clearance:', JSON.stringify(await page.evaluate('__hc.adsClearance()')));
    fs.writeFileSync(ROOT+'/bench/results/shotgun-ads-noflash.png', await page.screenshot());
    await page.evaluate('__hc.flashHold(true)'); await sleep(400);
    console.log('flash:', JSON.stringify(await page.evaluate('__hc.flashProbe()')));
    fs.writeFileSync(ROOT+'/bench/results/shotgun-ads-flash.png', await page.screenshot());
    console.log('shots written');
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(String(e.message||e)); process.exit(1); });
