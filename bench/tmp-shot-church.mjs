// Golgotha verify: find the spot via __hc.church, tp there (builder fires once chunks load), shoot the crosses.
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
    // wait for the spot scan (builder rotation touches it within ~20 frames even unbuilt)
    await page.waitForFunction(`(()=>{try{const g=__hc.church(); return !!(g&&g.x!=null);}catch(e){return false;}})()`,{timeout:60000});
    const g=await page.evaluate(`__hc.church()`);
    console.log('spot:', JSON.stringify(g));
    await page.evaluate(`__hc.tp(${g.x}, ${g.z})`);
    await sleep(6000);   // chunks stream → builder fires
    const g2=await page.evaluate(`__hc.church()`);
    console.log('after tp:', JSON.stringify(g2));
    const pad=await page.evaluate(`__hc.tpExact(${g.x+10}, ${g.z})`);   // learn ground level on the pad outside the arch
    await page.evaluate(`(()=>{ __hc.tpExact(${g.x+5}, ${g.z}, ${'PADY'}); __hc.cam({yaw:Math.PI/2, pitch:0.06}); })()`.replace('PADY', pad.y));   // inside the nave, looking WEST down the aisle to the altar + great window
    await sleep(800);
    await page.screenshot({ path: path.join(OUT,'church.png') });
    await page.evaluate(`(()=>{ __hc.tpExact(${g.x+2}, ${g.z-3}, ${'PADY'}); __hc.cam({yaw:Math.PI*0.25, pitch:0.25}); })()`.replace('PADY', pad.y));   // pew-level look up at a south window arch
    await sleep(700);
    await page.screenshot({ path: path.join(OUT,'church-window.png') });
    console.log('DONE');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
