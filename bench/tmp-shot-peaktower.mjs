// Peak tower verify: find spots via __hc.peaks, tp to the tallest, shoot the tower from outside + the cabin inside.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
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
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,250)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    const pk=await page.evaluate(`__hc.peaks()`);
    console.log('peaks:', JSON.stringify(pk));
    if(!pk.spots||!pk.spots.length){ console.log('NO PEAKS'); process.exit(1); }
    const p0=pk.spots[0];
    await page.evaluate(`__hc.tp(${p0.x}, ${p0.z})`); await sleep(7000);
    console.log('after tp:', JSON.stringify(await page.evaluate(`__hc.peaks()`)));
    const crownY=Math.min(p0.h, 128-33);   // the builder carves the crown to this level
    await page.evaluate(`__hc.tpExact(${p0.x}, ${p0.z+20}, ${crownY-2})`);   // on the slope south of it, looking NORTH up at the tower
    await page.evaluate(`__hc.cam({yaw:0, pitch:0.30})`); await sleep(900);
    await page.screenshot({ path: path.join(OUT,'peaktower.png') });
    await page.evaluate(`(()=>{ __hc.tpExact(${p0.x+1.5}, ${p0.z}, ${crownY+24.2}); __hc.cam({yaw:Math.PI/2, pitch:0}); })()`);   // inside the cabin on the observation floor
    await sleep(800);
    await page.screenshot({ path: path.join(OUT,'peaktower-cabin.png') });
    console.log('DONE');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
