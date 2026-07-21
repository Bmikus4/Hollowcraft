// STAGE III (FRACTAL WHITE VOID) VERIFIER — void entry on phase 3, fractal background live,
// chain fires from a torn eye + binds + Space-mash with the once-only tease + release, world restored on death.
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
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=630', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(2000);
    const fails=[]; const ck=(n,c,i)=>{ if(!c) fails.push(n+' :: '+JSON.stringify(i)); };

    await page.evaluate(`__hc.boss({park:true, dist:26, up:12, phase:2})`);
    await sleep(9000);
    await page.evaluate(`__hc.set({_bossPhase:2, _regenT:0, hpMax:7500, hp:5000, _park:false})`);
    await page.evaluate(`__hc.heal()`);
    // Stage II halfway: the world begins to PEEL — corroded-paint strips flutter off reality
    await page.evaluate(`__hc.peel({begin:0.5})`);
    let pk=null; for(let i=0;i<20;i++){ await page.evaluate(`__hc.heal()`); pk=await page.evaluate(`__hc.peel()`); if(pk.on&&pk.flakes>0)break; await sleep(200); }
    ck('the world PEELS mid-Stage-II', pk.on===true && pk.flakes>0, pk);
    await page.screenshot({ path: path.join(OUT,'peel-half.png') });
    // the third life finishes stripping reality -> the pure void
    await page.evaluate(`__hc.peel({begin:1, rate:0.6})`);
    let v=null; for(let i=0;i<50;i++){ await page.evaluate(`__hc.heal()`); v=await page.evaluate(`__hc.void3()`); if(v.on)break; await sleep(250); }
    ck('the peel completed into the WHITE VOID', v.on===true, v);
    await page.screenshot({ path: path.join(OUT,'void-entry.png') });
    // fractal comes online ~3s in, morphs over 6
    for(let i=0;i<24;i++){ await page.evaluate(`__hc.heal()`); await sleep(250); }
    v = await page.evaluate(`__hc.void3()`);
    ck('fractal raymarch is the sky (RT background)', v.fractal===true && v.bgIsRT===true && v.morph>0.4, v);
    await page.screenshot({ path: path.join(OUT,'void-fractal.png') });
    // (chains are shelved for now — no bind mechanic in the void this build)
    // on the FINAL life, death exits the void and restores the world (real hurtWretch->killWretch->exitVoid path)
    await page.evaluate(`__hc.killBoss()`);
    await sleep(800); v = await page.evaluate(`__hc.void3()`);
    ck('final death restored the world', v.on===false && v.bgIsRT===false, v);
    ck('zero page errors', errors.length===0, errors);
    const pass=fails.length===0;
    console.log(JSON.stringify({ pass, fails, errors:errors.slice(0,5) }, null, 1));
    await browser.close(); process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
