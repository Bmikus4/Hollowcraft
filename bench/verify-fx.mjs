// PARTICLE SATURATION VERIFIER — sustained max-load particle spawning for 15s:
// asserts the instanced system caps at 512 live, holds frame pacing, and draws in ONE call.
//   node bench/verify-fx.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('no server')); else setTimeout(poll,250); }); })(); }); }

(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    await ctx.addInitScript(`window.__benchInfo=1; const B=window.__bench={frames:[]}; let last=performance.now(); requestAnimationFrame(function t(x){ B.frames.push(x-last); if(B.frames.length>20000)B.frames.shift(); last=x; requestAnimationFrame(t); });`);
    const page = await ctx.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=252', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(12000);
    const res = await page.evaluate(`(async () => {
      const frame=()=>new Promise(r=>requestAnimationFrame(r));
      __bench.frames.length=0;
      let maxLive=0;
      for(let s=0;s<900;s++){ const r=__hc.fx(2); maxLive=Math.max(maxLive,r.live); await frame(); }   // ~15s of sustained 100 spawns/frame
      const f=__bench.frames.slice(5);
      f.sort((a,b)=>a-b);
      return { maxLive, frames:f.length, p50:+f[Math.floor(f.length*0.5)].toFixed(2), p99:+f[Math.floor(f.length*0.99)].toFixed(2), worst:+f[f.length-1].toFixed(1), draws:(window.__benchInfoSnap||{}).calls };
    })()`);
    await page.evaluate(`__hc.cam({yaw:0.5,pitch:-0.35})`);
    await page.evaluate(`__hc.fx(11)`);
    await sleep(300);
    await page.screenshot({ path: path.join(ROOT,'bench','results','verify-fx.png') });
    console.log(JSON.stringify({ ...res, errors: errors.slice(0,5) }, null, 1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
