// CORRECTNESS VERIFIER — not a benchmark. Loads the game, screenshots the streamed world
// (for human inspection of mesh integrity), then exercises the torch place/break relight
// path and reports page errors, edit-queue drain, and per-op frame cost.
//   node bench/verify.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'bench', 'results');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('no server')); else setTimeout(poll,250); }); })(); }); }

(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd: ROOT, env: {...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message||e).slice(0,300)));
    page.on('console', m => { if(m.type()==='error') errors.push('console: '+m.text().slice(0,300)); });

    // ---- day view of the streamed world (mesh integrity shot)
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=252', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(20000);   // let the ring fill
    await page.evaluate(`__hc.cam({ yaw: 0.6, pitch: -0.15 })`);
    await sleep(400);
    await page.screenshot({ path: path.join(OUT,'verify-day-world.png') });

    // ---- torch relight cycle at night: place/break a torch repeatedly, watch queues + errors + frame cost
    await page.evaluate(`__hc.set({}); worldTime !== undefined`).catch(()=>{});   // no-op; module scope not reachable, use the t= param instead
    const cycle = await page.evaluate(`(async () => {
      const res = { ops: [], maxRemeshQueued: 0, maxRelightQueued: 0 };
      const frame = () => new Promise(r => requestAnimationFrame(r));
      for (let i = 0; i < 6; i++) {
        const t0 = performance.now();
        const put = __hc.setBlock(2, 1, 2, 'torch');
        res.maxRemeshQueued = Math.max(res.maxRemeshQueued, put.queued.remesh);
        res.maxRelightQueued = Math.max(res.maxRelightQueued, put.queued.relight);
        let frames = 0;
        while (frames < 240) { await frame(); frames++; const q = __hc.editQ(); if (q.remesh === 0 && q.relight === 0) break; }
        const placeMs = +(performance.now() - t0).toFixed(1);
        const t1 = performance.now();
        __hc.setBlock(2, 1, 2, null);
        frames = 0;
        while (frames < 240) { await frame(); frames++; const q = __hc.editQ(); if (q.remesh === 0 && q.relight === 0) break; }
        res.ops.push({ placeMs, breakMs: +(performance.now() - t1).toFixed(1) });
      }
      return res;
    })()`);

    // ---- night shot with a torch placed (visual: warm pool + no shattered geometry)
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=630', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(15000);
    await page.evaluate(`(async () => { __hc.setBlock(3, 1, 3, 'torch'); __hc.setBlock(-3, 1, 2, 'lantern'); __hc.cam({ yaw: 2.4, pitch: -0.2 }); })()`);
    await sleep(2500);   // queues drain + relight lands
    await page.screenshot({ path: path.join(OUT,'verify-night-torch.png') });
    const st = await page.evaluate(`__hc.st()`);
    const perf = await page.evaluate(`__hc.perf()`);

    console.log(JSON.stringify({ cycle, st, perf, errors: errors.slice(0,10) }, null, 1));
    await browser.close();
  } finally { try { server.kill(); } catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
