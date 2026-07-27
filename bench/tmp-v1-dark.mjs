// v1: chase the "whole forest renders BLACK in daylight" regression + get a clean cabin ground shot.
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
const MODE = process.argv[2] || '';
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,250)));
    const q = '?debug=1&t=210' + (MODE?('&dbg='+MODE):'');
    await page.goto(base+'/index.html'+q,{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    const st = await page.evaluate(`__hc.st()`); const SX=st.sx, SZ=st.sz;
    console.log('spawn', SX, SZ, 'day', st.day, 'mode', MODE||'(normal)');

    // stand in the yard south of the cabin, look at the cabin
    const CX=SX+22, CZ=SZ-14;
    await page.evaluate(`__hc.tp(${CX},${CZ}+14)`); await sleep(7000);
    const gy = await page.evaluate(`(()=>{ let g=0; for(let y=4;y<200;y++){ const b=__hc.blockAt(${CX},y,${CZ}); }
      for(let y=200;y>0;y--){ if(__hc.blockAt(${CX}-6,y,${CZ})!==0){ g=y; break; } } return g; })()`);
    await page.evaluate(`__hc.tpAt(${CX}, ${gy}+3.6, ${CZ}+14)`); await sleep(1500);
    await page.evaluate(`__hc.look(${CX}, ${gy}+3, ${CZ})`); await sleep(1200);
    await page.screenshot({ path: path.join(OUT,'v1-cabinyard'+(MODE?'-'+MODE:'')+'.png') });
    console.log('shot cabinyard gy(edge)=', gy);

    // treeCol sweep: find columns whose stored htop is inflated far above the true ground
    const sweep = await page.evaluate(`(()=>{ const bad=[], ok=[];
      for(let dx=-16;dx<=16;dx+=2)for(let dz=-16;dz<=16;dz+=2){
        const r=__hc.treeCol(${CX}+dx,${CZ}+dz); if(!r||r.err)continue;
        if(r.storedTop-r.groundTop>1) bad.push([dx,dz,r.storedTop,r.groundTop,r.fullTop,r.hasCanopyCore?1:0]);
        else ok.push(1); }
      return {badN:bad.length, okN:ok.length, sample:bad.slice(0,14)}; })()`);
    console.log('treeColSweep', JSON.stringify(sweep));
    const cd = await page.evaluate(`__hc.canopydbg()`);
    console.log('canopydbg', JSON.stringify(cd).slice(0,600));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
