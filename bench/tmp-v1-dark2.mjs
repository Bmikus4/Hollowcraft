// "black pixels everywhere" repro: forest ground shots across the day, with a light-state readout,
// so we can see whether the black is shadow, skylight, or the fog colour.
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
const TAG = process.argv[2] || 'now';
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    const st = await page.evaluate(`__hc.st()`); const SX=st.sx, SZ=st.sz;
    // deep forest, eye level, looking level into the trees
    await page.evaluate(`__hc.tp(${SX}-58,${SZ}+46)`); await sleep(8000);
    const hasTime = await page.evaluate(`typeof __hc.time==='function'`);
    for(const [n,tt] of (hasTime?[['noon',210],['dusk',330],['night',480]]:[['noon',210]])){
      if(hasTime) await page.evaluate(`__hc.time(${tt})`); await sleep(2500);
      await page.evaluate(`__hc.cam({yaw:0.8,pitch:-0.06})`); await sleep(1600);
      await page.screenshot({ path: path.join(OUT,'v1-'+TAG+'-dark-'+n+'.png') });
      const hz=await page.evaluate(`__hc.horizonDbg()`);
      console.log(n, 'fog', hz.fogCol, 'dens', hz.dens, 'day', (await page.evaluate(`__hc.st()`)).day);
    }
    console.log('errs', errs.length, errs.slice(0,2).join(' | '));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
