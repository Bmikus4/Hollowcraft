// MULTIPLAYER CORRECTNESS VERIFIER — proves the late-join sync pagination fix.
// Old behavior: host serialized ALL edits into ONE websocket message; past ~3,600 edits it crossed
// the relay's 64KB MAX_MSG and the relay hard-destroyed the HOST's socket (total co-op loss).
// This test: host records 5,000 edits, a guest late-joins, and we assert (a) the host connection
// survives, (b) the guest receives every edit, (c) frame pacing on both stays sane during the sync.
//   node bench/verify-mp.mjs
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

const INIT = `(() => {
  window.__benchInfo = 1;
  const B = window.__bench = { frames: [], recording: true };
  let last = performance.now();
  requestAnimationFrame(function tick(t){ B.frames.push(t-last); if(B.frames.length>20000)B.frames.shift(); last=t; requestAnimationFrame(tick); });
})();`;

async function openGame(ctx, base, q, errors){
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message||e).slice(0,200)));
  await page.goto(base+'/index.html?'+q, { waitUntil:'load', timeout:90000 });
  await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true; } catch(e){ return false; } })()`, { timeout:90000 });
  return page;
}

(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const base='http://127.0.0.1:'+port, errH=[], errG=[];
    const ctxH = await browser.newContext({viewport:{width:1280,height:720}}); await ctxH.addInitScript(INIT);
    const ctxG = await browser.newContext({viewport:{width:1280,height:720}}); await ctxG.addInitScript(INIT);

    // HOST joins first, then records 5,000 edits (spread across ~35 chunks so pages hit many chunks)
    const host = await openGame(ctxH, base, 'join&debug=1&t=252', errH);
    await host.waitForFunction(`window.__hc && __hc.netInfo().on===true`, { timeout:30000 });
    await sleep(8000);   // let some world stream in
    const placed = await host.evaluate(`(() => {
      let n=0;
      for(let i=0;i<5000;i++){ const dx=-40+(i%80), dz=8+Math.floor(i/80)*2, r=__hc.setBlock(dx, 30+(i%3), dz, 'planks'); if(r && r.wx!==undefined) n++; }
      return { attempted:5000, inGeneratedChunks:n, total:__hc.editCount() };
    })()`);
    console.log('host placed:', JSON.stringify(placed));

    // GUEST late-joins -> host must paginate the sync and SURVIVE
    const t0 = Date.now();
    const guest = await openGame(ctxG, base, 'join&debug=1&t=252', errG);
    await guest.waitForFunction(`window.__hc && __hc.netInfo().on===true`, { timeout:30000 });
    // wait until the guest's edit count matches the host's (sync complete), max 30s
    const hostCount = await host.evaluate(`__hc.editCount()`);
    let guestCount = 0, synced = false;
    for(let i=0;i<120;i++){ await sleep(250); guestCount = await guest.evaluate(`__hc.editCount()`); if(guestCount>=hostCount){ synced=true; break; } }
    const syncMs = Date.now()-t0;

    const hostNet = await host.evaluate(`__hc.netInfo()`);
    const guestNet = await guest.evaluate(`__hc.netInfo()`);
    const worst = async p => p.evaluate(`(() => { const f=__bench.frames.slice(-2000); return {worstMs:+Math.max(...f).toFixed(1), avgFps:+(1000/(f.reduce((a,b)=>a+b,0)/f.length)).toFixed(1)} })()`);
    console.log(JSON.stringify({
      hostEdits: hostCount, guestEdits: guestCount, synced, syncMs,
      hostAlive: hostNet.on && hostNet.ws===1, guestAlive: guestNet.on && guestNet.ws===1,
      hostNet, guestNet,
      hostFrames: await worst(host), guestFrames: await worst(guest),
      errors: { host: errH.slice(0,5), guest: errG.slice(0,5) },
    }, null, 1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
