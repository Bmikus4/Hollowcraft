// "foliage is still not affected by fog always, and shadows/fog dissapears completely when at certain angles/blocks"
// Sweep the yaw at a fixed spot and time and report, per angle: the fog density, how many chunk groups are actually visible,
// how many of them have their foliage/leaf layers on, and whether the sun shadow is enabled. If any of those swing with the
// angle, that is the bug; if none do, the fault is somewhere the camera is not.
//   node bench/tmp-fog-sweep.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ const c=['C:'+String.fromCharCode(92)+'Program Files'+String.fromCharCode(92)+'Google'+String.fromCharCode(92)+'Chrome'+String.fromCharCode(92)+'Application'+String.fromCharCode(92)+'chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360);
    // Let the world FINISH streaming before sweeping: the first pass measured chunks appearing, not angles.
    await sleep(12000);
    const rows=[];
    for(let i=0;i<24;i++){
      const yaw=+((i%12)/12*Math.PI*2).toFixed(3);   // two full revolutions: a value that only moves on the first pass is streaming, not angle
      await page.evaluate(`__hc.cam({yaw:${yaw},pitch:0})`);
      await sleep(260);
      rows.push(await page.evaluate(`__hc.fogSweep(${yaw})`));
    }
    console.log(JSON.stringify(rows,null,1));
    // the two extremes, photographed
    let lo=rows[0], hi=rows[0];
    for(const r of rows){ if(r.visChunks<lo.visChunks) lo=r; if(r.visChunks>hi.visChunks) hi=r; }
    for(const [nm,r] of [['min',lo],['max',hi]]){
      await page.evaluate(`__hc.cam({yaw:${r.yaw},pitch:0})`); await sleep(500);
      await page.screenshot({path:path.join(ROOT,'bench','results','fog-'+nm+'.png')});
    }
    console.log('min', JSON.stringify(lo), '\nmax', JSON.stringify(hi));
    await browser.close();
  } finally { server.kill(); }
})();
