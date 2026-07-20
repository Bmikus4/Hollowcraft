// INTRO-JESUS DEPARTURE VERIFIER — boots the game headless and watches the spawn Jesus:
// he must exist at spawn, start leaving after ~10s, head OVER WATER, and despawn only past the render edge.
//   node bench/tmp-verify-jesus.mjs
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
    const page = await ctx.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });

    const seen = { spawned:false, leaving:false, overWater:false, maxDist:0, despawned:false, daddyOutside:false };
    const track = [];
    for (let t=0; t<75; t+=2.5) {
      const fauna = await page.evaluate(`__hc.fauna()`);
      if (fauna.err) { console.error('fauna err:', fauna.err); break; }
      const j = fauna.find(a=>a.t==='jesus');
      if (fauna.some(a=>a.t==='daddy')) seen.daddyOutside = true;   // natural spawner must never produce one
      if (j) { seen.spawned = true;
        if (j.leaving) seen.leaving = true;
        if (j.leaving && j.overWater) seen.overWater = true;
        seen.maxDist = Math.max(seen.maxDist, j.pd);
        track.push({t, x:j.x, z:j.z, pd:j.pd, leaving:j.leaving, water:j.overWater});
        if (t<20 || (t%10)===0) console.log('t'+t, JSON.stringify(j));
      } else if (seen.leaving) { seen.despawned = true; break; }
      await sleep(2500);
    }
    const pass = seen.spawned && seen.leaving && seen.overWater && seen.despawned && seen.maxDist>82 && !seen.daddyOutside && errors.length===0;
    console.log(JSON.stringify({ pass, ...seen, errors:errors.slice(0,5) }, null, 1));
    console.log('path:', track.map(p=>`t${p.t} d${p.pd}${p.leaving?'L':''}${p.water?'W':''}`).join(' '));
    await browser.close();
    process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
