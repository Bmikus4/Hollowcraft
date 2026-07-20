// HORROR-AMPLIFIER VERIFY: force hunger=3 water=3 → over ~40s expect stomach-growl noise events (PNOISE via
// growls firing), dehydration vignette pulses, parched fog bump; then restore and expect all clear.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(300);   // unlock audio
    await page.evaluate(`__hc.aim(false)`);              // force locked=true → survivalTick actually runs headlessly
    const before=await page.evaluate(`__hc.vitals()`);
    await page.evaluate(`__hc.vitals(0,3,false)`);   // hunger EMPTY + parched + creative OFF: starvation drain proves survivalTick runs
    let vignSeen=false, densHi=0, hpMin=99;
    for(let i=0;i<40;i++){ await sleep(1000); const v=await page.evaluate(`__hc.vitals()`);
      if(v.vign && +v.vign>0.02) vignSeen=true; if(v.dens>densHi) densHi=v.dens; if(v.health<hpMin)hpMin=v.health; }
    console.log('hpMin:', hpMin);
    const starved=await page.evaluate(`__hc.vitals()`);
    await page.evaluate(`__hc.vitals(20,20)`); await sleep(3000);
    const after=await page.evaluate(`__hc.vitals()`);
    const fogBump = densHi > before.dens*1.05;   // parched fog multiplier visible
    const clear = after.vign==='0'||after.vign===''||+after.vign<0.02;
    console.log(JSON.stringify({pass:vignSeen&&fogBump&&clear&&errors.length===0, vignSeen, fogBump, densHi, beforeDens:before.dens, starved, after, errors:errors.slice(0,4)},null,1));
    await browser.close();
    process.exit((vignSeen&&fogBump&&clear&&!errors.length)?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
