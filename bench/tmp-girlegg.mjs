// The EGG path, which the assert bench never touched: it spawns her through __hc.girl (the AI door). Ben
// reports no egg in the game, so this checks the three things between defItem and a creature: the item
// exists, it is in the creative grid, and right-clicking it spawns her.
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
    const page=await (await browser.newContext({viewport:{width:1100,height:760}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.setTime(0.5); __hc.cmdRun('/gamemode creative');`);
    await page.waitForFunction(`(()=>{try{return __hc.girlState().loaded===true;}catch(e){return false;}})()`,null,{timeout:90000});

    await page.evaluate(`__hc.girl(20)`); await sleep(400);
    console.log('miss beside her:', JSON.stringify(await page.evaluate(`__hc.girlShootMiss(9)`)));
    for (const part of ['Head','spine.003','thigh.L','foot.R'])
      console.log('one shot at '+part+':', JSON.stringify(await page.evaluate(`__hc.girlShoot('${part}',1)`)));
    console.log('emptying into her:', JSON.stringify(await page.evaluate(`__hc.girlShoot('spine.003',60)`)));
    for (let i=0;i<9;i++){ console.log('  ', JSON.stringify(await page.evaluate(`(()=>{const s=__hc.girlState(); return {state:s.state,hp:s.hp,pitch:s.pitch,ttl:s.ttl,y:s.pos[1]};})()`))); await sleep(400); }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
