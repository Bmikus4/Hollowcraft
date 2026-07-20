// CERAPHIM VERIFIER — the 07-20 trio:
//  A. all seven eyes expose live world hit-spheres (central = biggest, ~3.8m radius at game scale)
//  B. shooting the central eye damages the boss (ray-march sphere test in fireGun)
//  C. weather fog burns off while the boss is in the world (0.9 -> ~0 in ~5s)
//  D. full-body screenshot for the feather-plane eyeball check
//   node bench/tmp-verify-ceraphim.mjs
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
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(2000);
    const fails=[]; const ck=(name,cond,info)=>{ if(!cond) fails.push(name+' :: '+JSON.stringify(info).slice(0,300)); };

    // A: summon parked, eyes report live world spheres
    await page.evaluate(`__hc.boss({park:true, dist:34, up:12})`);
    await sleep(9000);   // arrival cutscene + build
    const a = await page.evaluate(`__hc.eyes()`);
    ck('7 eye spheres live', a.spheres && a.spheres.length===7, a);
    if(a.spheres && a.spheres.length===7){
      const c=a.spheres.filter(s=>s.central); const maxR=Math.max(...a.spheres.map(s=>s.r));
      ck('exactly one central eye', c.length===1, a.spheres);
      ck('central is the biggest', c[0] && Math.abs(c[0].r-maxR)<1e-3, {central:c[0], maxR});
      ck('game-scale radius sane (2.5-6m central)', c[0] && c[0].r>2.5 && c[0].r<6, c[0]);
    }

    // D: screenshot for the feather-plane check (aim the camera at it)
    await page.evaluate(`__hc.aimEye()`);
    await sleep(400);
    await page.screenshot({ path: path.join(OUT,'ceraphim-feathers.png') });

    // B: shoot the central eye — hp must drop
    const hp0 = a.hp;
    await page.evaluate(`__hc.gun('hunting_rifle')`); await sleep(400);
    await page.evaluate(`(()=>{ __hc.aimEye(); return __hc.shoot(); })()`);
    await sleep(300);
    const b = await page.evaluate(`__hc.eyes()`);
    ck('central-eye shot damages the boss', b.hp < hp0, {hp0, hp1:b.hp});

    // C: fog burns off while the boss is up
    await page.evaluate(`__hc.fog(0.9)`);
    await sleep(6000);
    const fog = await page.evaluate(`__hc.fog()`);
    ck('fog burned off (<0.1 after 6s)', fog<0.1, {fog});

    ck('zero page errors', errors.length===0, errors);
    const pass = fails.length===0;
    console.log(JSON.stringify({ pass, fails, errors:errors.slice(0,5) }, null, 1));
    await browser.close();
    process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
