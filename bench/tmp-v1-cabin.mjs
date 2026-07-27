// v1: is the cabin's OPAQUE geometry rendering? 3 angles + a mesh-level probe.
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
const TAG = process.argv[2] || 'cab';
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,250)));
    const extra = process.argv[3] ? ('&'+process.argv[3]) : '';
    await page.goto(base+'/index.html?debug=1&t=210&noshadow=1'+extra,{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    const st = await page.evaluate(`__hc.st()`); const SX=st.sx, SZ=st.sz;
    const CX=SX+22, CZ=SZ-14;
    await page.evaluate(`__hc.tp(${CX},${CZ}+16)`); await sleep(9000);
    const FY = 50;
    // 3 angles: SE high, SW high, straight down
    const shots=[['se', CX+16, FY+10, CZ+16],['sw', CX-16, FY+10, CZ+16],['top', CX+1, FY+26, CZ+1]];
    for(const [n,x,y,z] of shots){
      await page.evaluate(`__hc.tpAt(${x},${y},${z})`); await sleep(2200);
      await page.evaluate(`__hc.look(${CX}, ${FY}+3, ${CZ})`); await sleep(1500);
      await page.screenshot({ path: path.join(OUT,'v1-'+TAG+'-'+n+'.png') });
      console.log('shot',n);
    }
    console.log('canopydbg', JSON.stringify(await page.evaluate(`__hc.canopydbg()`)).slice(0,300));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
