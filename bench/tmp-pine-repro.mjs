// PINE DISAPPEARANCE REPRO — sweep render distances and spots, dump the mask stats + screenshots.
//   node bench/tmp-pine-repro.mjs
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
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base = 'http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser = await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    const page = await ctx.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, { timeout:90000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`, { timeout:90000 });

    const report=[];
    for(const rd of [6,10,12]){
      for(const [label,x,z] of [['spawn',433,23],['mid',500,0],['inland',560,120]]){
        await page.evaluate(`(()=>{ __hc.rd(${rd}); __hc.tpExact(${x},${z}); })()`);
        await sleep(rd>=10?7000:4000);
        const r = await page.evaluate(`(()=>{ const p=__hc.pines(); if(p.err) return p;
          const lit=p.mask.filter(v=>v>=51).length, landArcs=p.truth.filter(t=>t>=6).length;
          let landLit=0; for(let i=0;i<128;i++) if(p.truth[i]>=6 && p.mask[i]>=51) landLit++;
          return {rd:${rd}, spot:'${label}', px:p.px, pz:p.pz, visD:p.visD, lit, landArcs, landLit}; })()`);
        report.push(r);
        if(rd===12 && label==='mid'){ await page.evaluate(`__hc.cam({yaw:0,pitch:0.04})`); await sleep(500);
          await page.screenshot({ path: path.join(OUT,'pine-repro-rd12-mid.png') }); }
        if(rd===10 && label==='spawn'){ await page.evaluate(`__hc.cam({yaw:${Math.PI},pitch:0.04})`); await sleep(500);
          await page.screenshot({ path: path.join(OUT,'pine-repro-rd10-spawn.png') }); }
      }
    }
    console.log(JSON.stringify({report, errors:errors.slice(0,5)}, null, 1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
