// NIGHT LIGHTING VERIFIER — screenshots the darkness-first rebuild for human review:
// plain deep night, night+torch pool, and the Wretch at 9u under natural night light.
//   node bench/verify-night.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'bench', 'results');
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
    const page = await ctx.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=630', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(14000);

    await page.evaluate(`__hc.cam({ yaw: 0.6, pitch: -0.05 })`);
    await sleep(600);
    await page.screenshot({ path: path.join(OUT,'night2-plain.png') });

    await page.evaluate(`(() => { __hc.setBlock(4, 1, 4, 'torch'); __hc.setBlock(-4, 1, 3, 'lantern'); __hc.cam({ yaw: 2.5, pitch: -0.18 }); })()`);
    await sleep(2000);
    await page.screenshot({ path: path.join(OUT,'night2-torch.png') });

    await page.evaluate(`(() => { __hc.summon(); __hc.put(9, 5); __hc.look(); })()`);
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT,'night2-wretch.png') });

    const st = await page.evaluate(`__hc.st()`);
    console.log(JSON.stringify({ fps: st.fps, wretchActive: st.wa, errors: errors.slice(0,5) }));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
