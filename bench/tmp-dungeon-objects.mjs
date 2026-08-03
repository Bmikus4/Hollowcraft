// WHAT is the dungeon drawing? halfObj measured -2.54 ms for half the drawables and the GPU has headroom, so
// the hall's median is per-object CPU submission. This says which objects, how far away, and how many are
// beyond the fog — i.e. how much of it is invisible work.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { HELPERS } from './perf-census.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
import fs from 'node:fs';
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`);
    await page.evaluate(HELPERS);
    for(const where of ['hall','lab']){
      await page.evaluate(`goDungeon(${JSON.stringify(where)}); H.cam({yaw:0.7,pitch:0});`);
      for(let i=0;i<60;i++){ const ok=await page.evaluate(`(()=>{const f=__hc.fill(); return f.meshed>=f.want;})()`); if(ok) break; await sleep(500); }
      await sleep(3000);
      const d = await page.evaluate(`__hcPERF.drawCensus()`);
      const c = await page.evaluate(`__hcPERF.census()`);
      const f = await page.evaluate(`__hc.fogInfo?__hc.fogInfo():null`);
      console.log(`\n=== dungeon ${where} ===  drawables ${d.drawables}   fogReach ${d.fogReach} m   camFar ${d.camFar} m`);
      console.log(`  bands: within fog ${d.bands.in_reach}   past fog ${d.bands.past_reach}   past far plane ${d.bands.past_far}`);
      console.log(`  frustumCulled=false: ${d.frustumCullOff} (${d.frustumCullOffPastReach} of them past the fog)`);
      console.log(`  byOwner: ${JSON.stringify(c.byOwner)}`);
      console.log('  biggest groups of drawables:');
      for(const t of d.top.slice(0,14)) console.log(`    ${String(t.n).padStart(5)} x ${t.label.slice(0,44).padEnd(44)} ${t.minD}-${t.maxD} m   ${t.pastReach} past fog`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
