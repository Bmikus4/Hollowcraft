// Taste, not measurement: the giantess whole, at noon, from far enough back to see all of her — then the
// view from under the foot on the way down. The bench measures her; these two frames are for the one thing
// numbers cannot answer, which is whether she reads as a person.
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
    page.on('pageerror',e=>console.log('PAGEERROR',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.setTime(0.5); __hc.cmdRun('/gamemode creative');`);
    await page.waitForFunction(`(()=>{try{return __hc.girlState().loaded===true;}catch(e){return false;}})()`,null,{timeout:90000});
    // CREATIVE, so she cannot land the stomp that kills the camera before the shutter. She still walks and
    // still stomps — damage() is the only thing that returns early for a creative player.
    const S=await page.evaluate(`(()=>{ const p=__hc.pos(); __hc.cam({yaw:0,pitch:-0.10});
      const r=__hc.girl(30); return {r, p}; })()`);
    console.log('spawned', JSON.stringify(S.r.probe));
    await sleep(300);
    // WHOLE BODY: she walks in, so the shot is taken at the range where 13.5 blocks fits the frame.
    for(let i=0;i<40;i++){ const s=await page.evaluate(`__hc.girlState()`); if(s.dist<19) break; await sleep(200); }
    // lookDir() is (-sin yaw, sin pitch, -cos yaw): the camera yaw that FACES a point is atan2(-dx,-dz), and
    // positive pitch looks UP. The first attempt used the entity's own yaw convention and photographed the sea.
    await page.evaluate(`(()=>{ const s=__hc.girlState(), p=__hc.pos(); __hc.cam({yaw:Math.atan2(-(s.pos[0]-p.x), -(s.pos[2]-p.z)), pitch:0.30}); })()`);
    await sleep(120);
    fs.writeFileSync(path.join(OUT,'giantess-full.png'), await page.screenshot());
    // MID-STOMP, from underneath: wait for the state and shoot before the sole lands.
    for(let i=0;i<200;i++){ const s=await page.evaluate(`__hc.girlState()`); if(s.state==='stomp'&&s.t>0.3&&s.t<0.5) break; await sleep(60); }
    await page.evaluate(`(()=>{ const s=__hc.girlState(), p=__hc.pos(); __hc.cam({yaw:Math.atan2(-(s.pos[0]-p.x), -(s.pos[2]-p.z)), pitch:0.75}); })()`);
    fs.writeFileSync(path.join(OUT,'giantess-stomp.png'), await page.screenshot());
    console.log('state at the stomp shot', JSON.stringify(await page.evaluate(`__hc.girlState()`)));
    // DEAD, from back far enough to see the whole body on the ground.
    await page.evaluate(`__hc.girlOff(); __hc.girl(26); __hc.girlShoot('spine.003',30);`);
    for(let i=0;i<20;i++){ const s=await page.evaluate(`__hc.girlState()`); if(s.state==='dead') break; await sleep(200); }
    await page.evaluate(`(()=>{ const s=__hc.girlState(), p=__hc.pos(); __hc.cam({yaw:Math.atan2(-(s.pos[0]-p.x), -(s.pos[2]-p.z)), pitch:-0.12}); })()`);
    await sleep(150);
    fs.writeFileSync(path.join(OUT,'giantess-dead.png'), await page.screenshot());
    console.log('dead:', JSON.stringify(await page.evaluate(`(()=>{const s=__hc.girlState(); return {state:s.state,pitch:s.pitch,ttl:s.ttl,dist:s.dist};})()`)));
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
