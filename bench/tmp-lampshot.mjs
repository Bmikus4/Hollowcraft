// Taste, not measurement: the lamp from underneath at night, and from the side while it swings.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft';
const OUT='D:/code/Minecraft/bench/results';
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
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync']});
    const page=await (await browser.newContext({viewport:{width:1100,height:760}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    const pr=await page.evaluate(`__hc.probe()`);
    await page.evaluate(`(()=>{ __hc.lock(true); __hc.setTime(0.0); __hc.tp(${pr.spawnX}, ${pr.spawnZ}); })()`);
    await sleep(2500);
    const at=await page.evaluate(`(()=>{ const p=__hc.st(); const x=Math.floor(p.px), z=Math.floor(p.pz), y=Math.floor(p.py)+3;
      __hc.lampPlace(x,y,z); return {x,y,z}; })()`);
    await sleep(2500);
    // LOOKING UP AT IT from just under and slightly to the side — the angle the fault lived at
    await page.evaluate(`(()=>{ __hc.tpExact(${at.x}+0.5+0.9, ${at.z}+0.5, ${at.y}-2.4); __hc.cam({yaw:Math.atan2(-(-0.9),-(0)), pitch:0.85}); })()`);
    await sleep(1800);
    fs.writeFileSync(path.join(OUT,'lamp-below.png'), await page.screenshot());
    // SWINGING, side on
    await page.evaluate(`(()=>{ __hc.tpExact(${at.x}+0.5+2.2, ${at.z}+0.5, ${at.y}-1.2); __hc.cam({yaw:Math.PI/2, pitch:0.25}); __hc.lampShove(${at.x},${at.y},${at.z}); })()`);
    await sleep(400);
    fs.writeFileSync(path.join(OUT,'lamp-swing.png'), await page.screenshot());
    console.log('shots written', JSON.stringify(at));
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
