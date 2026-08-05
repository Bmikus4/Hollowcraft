// Atomic-tree verification: aerial canopy shots (chunk-seam bites should be gone) + streaming fps while teleporting.
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
const TAG = process.argv[2] || 'f';
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&t=210&noshadow=1',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    const st = await page.evaluate(`__hc.st()`); const SX=st.sx, SZ=st.sz;
    // aerial over deep forest — look straight down at the canopy: seam bites read as straight-edged gaps
    const fps=[];
    for(const [n,x,z] of [['a',SX-60,SZ+50],['b',SX+40,SZ+60],['c',SX-30,SZ-60]]){
      await page.evaluate(`__hc.tp(${x},${z})`); await sleep(6500);
      const p=await page.evaluate(`__hc.pos()`);
      await page.evaluate(`__hc.tpAt(${x}, ${Math.round(p.y)+34}, ${z})`); await sleep(3000);
      await page.evaluate(`__hc.look(${x}, ${Math.round(p.y)}, ${z+1})`); await sleep(1400);
      await page.screenshot({ path: path.join(OUT,'v1-'+TAG+'-canopy-'+n+'.png') });
      fps.push((await page.evaluate(`__hc.st()`)).fps);
      console.log('shot',n);
    }
    // streaming stress: hop far, sample fps as chunks generate (the widened decorate sweep is the cost to watch)
    const sfps=[];
    for(let i=0;i<5;i++){ await page.evaluate(`__hc.tp(${SX}+${120+i*90}, ${SZ}+${60+i*70})`);
      for(let k=0;k<4;k++){ await sleep(800); sfps.push((await page.evaluate(`__hc.st()`)).fps); } }
    console.log('idleFps', JSON.stringify(fps));
    console.log('streamFps', JSON.stringify(sfps), 'min', Math.min(...sfps));
    console.log('errs', errs.length, errs.slice(0,3).join(' | '));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
