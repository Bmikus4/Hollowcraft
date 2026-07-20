// CHEST LID VISUAL VERIFY — places a chest via __hc.chest (which opens it): the swinging lid must be the
// NEW model's lid (dark slab + strap tops + latch top), the static lid must hide while open (no double
// lid), and closing must restore it. Front + side + closed shots.
//   node bench/tmp-verify-chest.mjs
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

    const spot = await page.evaluate(`(()=>{ const p=__hc.pines(); return __hc.chest(Math.floor(p.px), Math.floor(p.pz)+4); })()`);
    if(spot.err){ console.log(JSON.stringify({pass:false, err:spot.err})); process.exit(1); }
    await sleep(900);   // lid fully open (anim ~0.3s)

    // front (latch side, +z): open lid standing up, static lid hidden underneath
    await page.evaluate(`(()=>{ __hc.tpExact(${spot.bx+0.5}, ${spot.bz+3.4}); __hc.cam({yaw:0, pitch:-0.34}); })()`);
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, 'chest-open-front.png') });
    // side profile: check the hinge line + no double lid
    await page.evaluate(`(()=>{ __hc.tpExact(${spot.bx+3.4}, ${spot.bz+0.5}); __hc.cam({yaw:${Math.PI/2}, pitch:-0.34}); })()`);
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, 'chest-open-side.png') });
    // close → static lid must be back, overlay gone
    await page.evaluate(`__hc.chestClose()`);
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, 'chest-closed.png') });
    console.log(JSON.stringify({pass:errors.length===0, spot, errors:errors.slice(0,5)}));
    await browser.close();
    process.exit(errors.length?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
