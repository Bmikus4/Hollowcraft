// PINE HORIZON MASK VERIFIER — the treeline must track the REAL coastline past the fog wall:
// mask 0 where the beyond-horizon band is sea, >0 only where land runs on, never a full 360 ring.
// Ground truth is recomputed in-page from surfaceH along each of the 128 shader azimuths.
//   node bench/tmp-verify-pines.mjs
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
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(3000);

    // check the mask at several spots: spawn, and after teleports inland / to the coast
    const spots = [ null, [40,0], [-60,20], [0,-70] ];   // null = spawn; others are relative hops (force recompute)
    const checks = [];
    for (const hop of spots) {
      if (hop) { const cur = await page.evaluate(`__hc.pines()`); await page.evaluate(`__hc.tpExact(${cur.px+hop[0]}, ${cur.pz+hop[1]})`); }
      await sleep(700);   // let updateHorizon recompute
      const r = await page.evaluate(`(() => {
        const p = __hc.pines(); if (p.err) return p;
        let agree=0, ringOverSea=0, landArcs=0, seaArcs=0;
        for (let i=0;i<128;i++){
          const land=p.truth[i], m=p.mask[i];
          if (land===0){ seaArcs++; if(m>=51) ringOverSea++; }      // mask must be ~0 over pure sea (51 = shader discard threshold 0.2)
          if (land===8){ landArcs++; if(m>200) agree++; }           // deep land runs must paint pines
        }
        const lit = p.mask.filter(v=>v>=51).length;
        return { px:p.px, pz:p.pz, visD:p.visD, seaArcs, ringOverSea, landArcs, landLit:agree, litFrac:+(lit/128).toFixed(2) };
      })()`);
      checks.push(r);
    }

    // screenshots for the eye: look toward the sea and toward land from the last spot
    await page.evaluate(`__hc.cam ? __hc.cam({yaw:4.71, pitch:0.02}) : (player.yaw=4.71, player.pitch=0.02)`);
    await sleep(400); await page.screenshot({ path: path.join(OUT,'pines-seaward.png') });
    await page.evaluate(`__hc.cam ? __hc.cam({yaw:1.57, pitch:0.02}) : (player.yaw=1.57, player.pitch=0.02)`);
    await sleep(400); await page.screenshot({ path: path.join(OUT,'pines-landward.png') });

    const bad = checks.filter(c => c.err || c.ringOverSea>0 || (c.landArcs>4 && c.landLit===0) || c.litFrac>0.95);
    const pass = bad.length===0 && errors.length===0;
    console.log(JSON.stringify({ pass, checks, errors:errors.slice(0,5) }, null, 1));
    await browser.close();
    process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
