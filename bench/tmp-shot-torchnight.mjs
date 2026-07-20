// Night torch lighting repro: place torches at night, screenshot, and MEASURE lit-pixel brightness around them.
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
    await page.goto(base+'/index.html?debug=1&t=650',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    const p=await page.evaluate(`__hc.pines()`);
    const px=Math.floor(p.px), pz=Math.floor(p.pz);
    // a torch 4 blocks ahead (north) of the player + one on each side
    console.log(await page.evaluate(`__hc.place2(${px}, ${pz-4}, 'torch')`));
    console.log(await page.evaluate(`__hc.place2(${px-3}, ${pz-5}, 'torch')`));
    await sleep(3500);   // relight + remesh
    await page.evaluate(`(()=>{ __hc.tpExact(${px+0.5}, ${pz+1.5}); __hc.cam({yaw:0, pitch:-0.12}); })()`);
    await sleep(800);
    await page.screenshot({ path: path.join(OUT,'torch-night.png') });
    // brightness metric: read center region pixels from the canvas
    const lum=await page.evaluate(`(()=>{ try{ const c=document.querySelector('canvas'); const t=document.createElement('canvas'); t.width=160; t.height=120;
      const g=t.getContext('2d'); g.drawImage(c, c.width*0.3, c.height*0.3, c.width*0.4, c.height*0.4, 0,0,160,120);
      const d=g.getImageData(0,0,160,120).data; let mx=0,avg=0; for(let i=0;i<d.length;i+=4){ const l=0.30*d[i]+0.55*d[i+1]+0.15*d[i+2]; if(l>mx)mx=l; avg+=l; }
      return {max:+mx.toFixed(1), avg:+(avg/(d.length/4)).toFixed(1)}; }catch(e){ return {err:String(e)}; } })()`);
    console.log('center luminance:', JSON.stringify(lum));
    // THE REAL TEST — a fully enclosed space (zero skylight): the cabin basement's own torch
    const pad=await page.evaluate(`__hc.tpExact(${px+22}, ${pz-14})`);   // cabin center, ground level
    await page.evaluate(`(()=>{ __hc.tpExact(${px+22-1.5}, ${pz-14+1.5}, ${'PY'}); __hc.cam({yaw:-Math.PI*0.25, pitch:0.05}); })()`.replace('PY', pad.y-7));   // in the basement, looking at its torch
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT,'torch-basement.png') });
    console.log('basement shot');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
