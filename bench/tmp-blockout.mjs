// #62: does the gun clear a block, and does the click fire ONCE rather than chattering?
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
    const page=await (await browser.newContext({viewport:{width:900,height:640}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    await page.evaluate('__hc.cmdRun("/clearinv"); __hc.cmdRun("/give hunting_rifle 1")'); await sleep(400);
    await page.evaluate('__hc.hold("hunting_rifle")'); await sleep(500);
    await page.evaluate('__hc.cam({yaw:0,pitch:0})'); await sleep(400);
    // build a wall 1 block ahead across the facing, 3 high
    await page.evaluate(`(()=>{ for(let dy=0;dy<3;dy++) for(let dx=-2;dx<=2;dx++) __hc.setBlock(dx,dy,-1,'stone'); })()`).catch(e=>console.log('setBlock form?',String(e).slice(0,90)));
    await sleep(1500);
    await page.evaluate('__hc.blockOutReset()');
    console.log('AT THE WALL  ', JSON.stringify(await page.evaluate('__hc.blockOut()')));
    const clicksAtWall=(await page.evaluate('__hc.blockOut()')).clicks;
    // hold there for 2s: a per-frame click would run into the dozens
    await sleep(2000);
    const after=await page.evaluate('__hc.blockOut()');
    console.log('AFTER 2s HELD', JSON.stringify(after), ' -> clicks went', clicksAtWall, '->', after.clicks);
    console.log('near clearance still ok:', JSON.stringify(await page.evaluate('__hc.adsClearance()')));
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(String(e.message||e)); process.exit(1); });
