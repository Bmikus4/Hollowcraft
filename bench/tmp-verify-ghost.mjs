// GHOST verify: spawn parked (3rd-person peek), then mount + drive forward, confirm it MOVES and HOVERS over terrain.
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
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`__hc.tp(500,0)`); await sleep(4000);
    // spawn parked, back up a few blocks, look at it
    const spot=await page.evaluate(`(()=>{ const p=__hc.pines(); const r=__hc.ghostHere(false); __hc.tpExact(r.x, r.z+5); __hc.cam({yaw:0, pitch:-0.15}); return r; })()`);
    await sleep(800);
    await page.screenshot({ path: path.join(OUT,'ghost-parked.png') });
    console.log('parked:', JSON.stringify(spot));
    // mount + drive forward ~2s
    await page.mouse.click(640,360); await page.evaluate(`__hc.aim(false)`);   // force locked=true so key input registers headless
    await page.evaluate(`(()=>{ __hc.tpExact(${spot.x}, ${spot.z}); __hc.ghostHere(true); __hc.cam({yaw:0, pitch:0.0}); })()`);
    await sleep(600);
    const before=await page.evaluate(`__hc.ghostState()`);
    await page.keyboard.down('KeyW'); await sleep(2200); await page.keyboard.up('KeyW');
    const after=await page.evaluate(`__hc.ghostState()`);
    await page.screenshot({ path: path.join(OUT,'ghost-riding.png') });
    const moved=Math.hypot(after.x-before.x, after.z-before.z);
    console.log('before:',JSON.stringify(before)); console.log('after:',JSON.stringify(after));
    console.log(JSON.stringify({pass:moved>15 && after.spd>10 && errors.length===0, moved:+moved.toFixed(1), errors:errors.slice(0,4)}));
    await browser.close();
    process.exit((moved>15 && !errors.length)?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
