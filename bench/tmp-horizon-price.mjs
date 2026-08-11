// WHAT THE THIRD HORIZON LAYER COSTS, and what the canopy term costs, at the two sites that are over budget.
//
// The standing debt, from the resume file: the shore site was already at 7.70 ms against a 7.14 ms target before the
// background mountains were added as a third full-screen horizon layer, ON by default, and nothing has been priced
// since. This prices the layer itself rather than the whole build, so the answer is a number a decision can be made on
// instead of "the frame is slow".
//
// SANDWICHED AND REPEATED. Each configuration is measured twice, on/off/on/off, because a single before/after at these
// margins is indistinguishable from the drift between two ten-second windows. The two same-configuration rows are the
// noise floor and nothing smaller than their difference can be claimed.
//
//   node bench/tmp-horizon-price.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { HELPERS } from './perf-census.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const DUR=8000;
const CFGS=[
  ['everything on',   `__hc.mountains({on:true});  __hc.canopy({t:0.97});`],
  ['mountains off',   `__hc.mountains({on:false}); __hc.canopy({t:0.97});`],
  ['everything on',   `__hc.mountains({on:true});  __hc.canopy({t:0.97});`],
  ['mountains off',   `__hc.mountains({on:false}); __hc.canopy({t:0.97});`],
  ['canopy term off', `__hc.mountains({on:true});  __hc.canopy({on:false});`],
  ['canopy term off', `__hc.mountains({on:true});  __hc.canopy({on:false});`],
];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    // arm() + __benchInfo, exactly as perf-census does: renderer.info resets per render() call, so without them
    // draws come back as 1 and live() has nothing to report. fpsPin(240) stops the adaptive quality ladder shedding
    // resolution mid-window, which would otherwise make the second half of a run a cheaper game than the first.
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo = 1;`);
    await page.evaluate(HELPERS);
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cinema(true); try{__hc.fpsPin(240);}catch(e){}`);
    for(const [siteName, go] of [['shore',`H.setTime(0.35); goShore();`], ['forest',`H.setTime(0.35); goForest(); H.cam({yaw:0.7, pitch:-0.02});`]]){
      console.log(`  === ${siteName}`);
      await page.evaluate(`(function(){ ${go} })()`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(4000);
      for(const [label, apply] of CFGS){
        await page.evaluate(apply); await sleep(1200);
        await page.evaluate(`__hcPERF.reset()`);
        await sleep(DUR);
        const r=await page.evaluate(`(()=>{ const f=__hcPERF.live(), p=__hc.frameProf(4000); return { med:f.median, p99:f.p99, over12:f.over12, n:f.n, draw:(p&&p.draw)||null }; })()`);
        console.log(`    ${label.padEnd(16)} med ${String(r.med).padEnd(7)} p99 ${String(r.p99).padEnd(7)} >12ms ${String(r.over12).padEnd(5)} n ${String(r.n).padEnd(5)} draw ${r.draw}`);
      }
      await page.evaluate(`__hc.mountains({on:true}); __hc.canopy({t:0.97});`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
