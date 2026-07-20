// TIP-TOE SNEAK VERIFIER — the recovered Wretch spec's big piece:
//  A. confidence metric climbs when it stands in the player's blind spot at night, dies when watched
//  B. sneak triggers organically (STALK, unwatched, 6-30 blocks, conf>0.62) and owns the state
//  C. the animation blend engages: arms raise toward the dead-wrist pose, crawl drops (upright on toes)
//  D. screenshot of the slink for eyeball QA
//   node bench/tmp-verify-sneak.mjs
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
    const fails=[]; const ck=(name,cond,info)=>{ if(!cond) fails.push(name+' :: '+JSON.stringify(info)); };

    // A: summon, park it dead in the blind spot (player looks -z; +z is behind), night boot
    await page.evaluate(`(()=>{ __hc.summon(); __hc.put(0, 14); })()`);
    await page.waitForFunction(`(() => { try { return __hc.st().wa===true; } catch(e){ return false; } })()`, { timeout:30000 });
    for(let i=0;i<14;i++){ await page.evaluate(`__hc.put(0, 14)`); await sleep(250); }   // hold it behind while conviction builds
    const a = await page.evaluate(`__hc.sneak()`);
    ck('confidence climbs in the blind spot at night', a.conf>0.55, a);

    // B: organic trigger (no force) — sneaking flips on and owns STALK
    ck('sneak triggered organically', a.sneaking===true && a.state==='STALK', a);

    // C: animation engages while it walks in — blend up, arm raised toward the dead-wrist pose, body upright
    await sleep(1500);
    const c = await page.evaluate(`__hc.sneak()`);
    ck('anim blend engaged', c.blend>0.5, c);
    ck('arms raised (shoulder swung up toward -1.0)', c.arm<-0.55, c);
    ck('upright on its toes (crawl released)', c.crawl<0.35, c);

    // D: look at it + screenshot the slink
    await page.evaluate(`__hc.look()`); await sleep(400);
    await page.screenshot({ path: path.join(OUT,'wretch-tiptoe.png') });
    // watching it must BREAK the sneak (conf dies + exit)
    await sleep(2600);
    const d = await page.evaluate(`__hc.sneak()`);
    ck('being watched breaks the sneak', d.sneaking===false, d);

    ck('zero page errors', errors.length===0, errors);
    const pass = fails.length===0;
    console.log(JSON.stringify({ pass, fails, errors:errors.slice(0,5) }, null, 1));
    await browser.close();
    process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
