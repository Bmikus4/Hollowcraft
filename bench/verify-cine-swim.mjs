// CERAPHIM-CUTSCENE + SWIM + BEAM-CARVE VERIFIER
//   1. swim: teleport into deep sea, hold Space → y must rise to the surface (and breach)
//   2. cutscene: __hc.ripTest() → _cine active, rip visible at 2.5s (screenshot), boss risen + overlay gone by 6s
//   3. beam carve: __hc.carveTest() → blocks broken along the beam path (not just the landing zone)
//   node bench/verify-cine-swim.mjs
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

const checks=[];
function check(name, ok, detail){ checks.push({name, ok:!!ok, detail}); console.log(`${ok?'PASS':'FAIL'}  ${name}  ${JSON.stringify(detail)}`); }

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
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=252', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(3000);
    const shot = n => page.screenshot({ path: path.join(ROOT,'bench','results',`verify-cine-${n}.png`) });

    // ---------- 1. SWIM — deep water, hold Space, must reach the surface ----------
    const dw = await page.evaluate(`__hc.deepWater()`);
    console.log('deep water:', JSON.stringify(dw));
    if(!dw){ check('swim: found deep water', false, dw); }
    else {
      await page.evaluate(`__hc.tpExact(${dw.x}, ${dw.z}, ${dw.sea-4})`);
      await page.waitForFunction(`(() => { try { return __hc.probe().chunkHere===true; } catch(e){ return false; } })()`, { timeout:30000 });   // physics idles in unloaded chunks — wait for the sea chunk to stream in
      await sleep(400);
      const y0 = (await page.evaluate(`__hc.tpExact(${dw.x}, ${dw.z}, ${dw.sea-4})`)).y;   // re-seat at depth (may have drifted while unloaded)
      await page.evaluate(`__hc.lock(true)`);   // physics() only runs while pointer-locked — force the flag (headless can't acquire real lock)
      await page.evaluate(`__hc.key('Space',true)`);
      await sleep(2600);
      const after = await page.evaluate(`__hc.water()`);
      await page.evaluate(`__hc.key('Space',false); __hc.lock(false)`);
      console.log('swim after 2.6s Space:', JSON.stringify({y0, after}));
      check('swim: rose from depth', after.y > y0 + 1.5, {from:y0, to:after.y});
      check('swim: reached the surface band', after.y >= dw.sea - 1.4, {y:after.y, sea:dw.sea});
    }

    // ---------- 2. BEAM CARVE — path destruction through terrain ----------
    await page.evaluate(`(() => { const s=__hc.st(); __hc.pitch(0); })()`);
    const carve = await page.evaluate(`__hc.carveTest()`);
    console.log('carve:', JSON.stringify(carve));
    check('carve: beam path breaks blocks', carve.broken > 0, carve);
    check('carve: mid-path pillar destroyed', Array.isArray(carve.pillarAfter) && carve.pillarAfter.every(b=>b===0), carve);

    // ---------- 3. CUTSCENE — rip overlay, flash build beat, boss risen, cleanup ----------
    const cine0 = await page.evaluate(`__hc.ripTest()`);
    check('cine: started', cine0.active === true, cine0);
    await sleep(900);
    const cineEarly = await page.evaluate(`__hc.cine()`);
    check('cine: pre-flash (not built yet)', cineEarly.active===true && cineEarly.built===false, cineEarly);
    await sleep(1600);   // t≈2.5s — flash passed, rip torn open, boss should exist
    const cineMid = await page.evaluate(`__hc.cine()`);
    const stMid = await page.evaluate(`__hc.st()`);
    await shot('rip-open');
    check('cine: build fired inside the flash', cineMid.active===true && cineMid.built===true, cineMid);
    check('cine: boss risen mid-scene', cineMid.boss===true && stMid.wa===true, {boss:cineMid.boss, wa:stMid.wa, wy:stMid.wy});
    await sleep(3000);   // t≈5.5s — cutscene must be gone
    const cineEnd = await page.evaluate(`__hc.cine()`);
    check('cine: ended + cleaned up', cineEnd.active===false && cineEnd.boss===true, cineEnd);
    await shot('boss-after');

    const pass=checks.filter(c=>c.ok).length;
    console.log(JSON.stringify({pass, fail:checks.length-pass, pageErrors:errors.slice(0,6)}));
    await browser.close();
    process.exit(checks.every(c=>c.ok)&&errors.length===0?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})();
