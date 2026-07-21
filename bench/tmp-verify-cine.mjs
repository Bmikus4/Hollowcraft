import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await page.evaluate(`__hc.aim(false)`);   // lock
    console.log('hud off:', JSON.stringify(await page.evaluate(`__hc.hud(false)`)));
    console.log('hud on:', JSON.stringify(await page.evaluate(`__hc.hud(true)`)));
    console.log('cine on:', JSON.stringify(await page.evaluate(`__hc.cinematic(true)`)));
    await page.evaluate(`__hc.tp(500,0); __hc.cam({yaw:0,pitch:0})`); await sleep(500);
    const b=await page.evaluate(`__hc.cineDrive()`);
    await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
    await sleep(900);   // coast — inertia should keep drifting after release
    const a=await page.evaluate(`__hc.cineDrive()`);
    const moved=Math.hypot(a.x-b.x,a.z-b.z);
    console.log('before:',JSON.stringify(b)); console.log('after:',JSON.stringify(a));
    console.log(JSON.stringify({pass:moved>10 && errs.length===0, moved:+moved.toFixed(1), coastVel:+Math.hypot(a.vx,a.vz).toFixed(2), errs:errs.slice(0,3)}));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
