// WHAT KEEPS BEING ADDED WHILE YOU STAND AT THE VOID DOOR. The fragment/submission split at this site came back void:
// fill() is overwritten by the adaptive shed, draws swing 703..1226 between identical arms, and drawables climbed
// 1345 -> 1459 over thirty seconds. A site that grows is not a site you can A/B, so the growth is the finding.
// Counters only, through census().byOwner - it attributes every drawable to BR.env, chunkRoot or the scene root.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = process.env.HC_ROOT;
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u,t=20000)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:180000});
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`);
    await sleep(2500);
    const snap = () => page.evaluate(`(()=>{ const c=__hcPERF.census(), f=__hcPERF.live();
      return { drawables:c.drawables, tris:c.tris, mats:c.materials, byOwner:c.byOwner, med:f.median,
               brLoaded:c.brLoaded, brCache:c.brEnvCache, heap:(performance.memory? Math.round(performance.memory.usedJSHeapSize/1048576):null) }; })()`);
    const show=(t,s)=>console.log(String(t).padStart(5)+'s  drawables '+String(s.drawables).padStart(5)+
      '  tris '+String(Math.round(s.tris/1000)).padStart(4)+'k  mats '+String(s.mats).padStart(3)+
      '  med '+String(s.med).padStart(7)+'  brLoaded '+s.brLoaded+'  brCache '+s.brCache+
      '  heap '+s.heap+'MB  '+JSON.stringify(s.byOwner));
    console.log('--- at spawn, before the door exists');
    show(0, await snap());
    const d=await page.evaluate(`(()=>{ const d=__hcPERF.spawnDoor(); if(!d||d.err) return d;
      __hc.tpAt(d.x+4, d.y+1.7, d.z+0.2); __hc.cam({yaw:Math.atan2(4,0.2), pitch:0});
      __hc.cam({yaw:__hc.yawNow()+Math.PI, pitch:0}); return d; })()`);
    console.log('--- 4 m from the Void Door, back turned: '+JSON.stringify(d));
    for(let i=1;i<=8;i++){ await sleep(6000); show(i*6, await snap()); }
    console.log('--- walk 60 blocks away and back, to see whether it unwinds');
    await page.evaluate(`__hc.tp(${Math.round(d.x)+60}, ${Math.round(d.z)+60})`); await sleep(6000);
    show('away', await snap());
    await page.evaluate(`__hc.tpAt(${d.x+4}, ${d.y+1.7}, ${d.z+0.2})`); await sleep(6000);
    show('back', await snap());
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
