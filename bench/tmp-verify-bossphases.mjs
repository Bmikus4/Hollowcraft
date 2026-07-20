// CERAPHIM 3-PHASE HEALTHBAR VERIFIER — 1500 -> 3000 -> 3750; each depletion regenerates the next bar
// (untouchable during the flood-back); the third bar's end is the true death.
//   node bench/tmp-verify-bossphases.mjs
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
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=630', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(2000);
    const fails=[]; const ck=(n,c,i)=>{ if(!c) fails.push(n+' :: '+JSON.stringify(i)); };

    await page.evaluate(`__hc.boss({park:true, dist:34, up:12})`);
    await sleep(9000);   // arrival cutscene + build
    const p1 = await page.evaluate(`__hc.bossHp()`);
    ck('phase 1 opens at 1500/1500', p1.phase===1 && p1.hpMax===1500 && p1.hp===1500 && p1.boss===true, p1);

    // drain bar 1 -> the SECOND bar regenerates
    await page.evaluate(`__hc.gun('hunting_rifle')`); await sleep(400);
    await page.evaluate(`(()=>{ __hc.set({hp:10}); __hc.aimEye(); return __hc.shoot(); })()`); await sleep(300);
    const p2 = await page.evaluate(`__hc.bossHp()`);
    ck('bar 1 death -> phase 2 regen begins (hpMax 3000)', p2.phase===2 && p2.hpMax===3000 && p2.regenT>0, p2);
    // untouchable during the flood
    await page.evaluate(`(()=>{ __hc.aimEye(); return __hc.shoot(); })()`); await sleep(200);
    const p2b = await page.evaluate(`__hc.bossHp()`);
    ck('untouchable while the bar floods back', p2b.phase===2 && p2b.regenT>0, p2b);
    await sleep(3000);
    const p2c = await page.evaluate(`__hc.bossHp()`);
    ck('bar 2 fully regenerated to 3000', p2c.hp===3000 && p2c.regenT===0, p2c);

    // drain bar 2 -> the THIRD (final, 3750) regenerates
    await page.evaluate(`(()=>{ __hc.set({hp:10}); __hc.aimEye(); return __hc.shoot(); })()`); await sleep(3300);
    const p3 = await page.evaluate(`__hc.bossHp()`);
    ck('bar 2 death -> final bar 3750 regenerated', p3.phase===3 && p3.hpMax===3750 && p3.hp===3750, p3);

    // drain bar 3 -> TRUE DEATH (no fourth life); retry the kill shot around the bolt cycle
    let pd=null;
    for(let t=0;t<4;t++){ await page.evaluate(`(()=>{ __hc.set({hp:10}); __hc.aimEye(); return __hc.shoot(); })()`); await sleep(700);
      pd=await page.evaluate(`__hc.bossHp()`); if(pd.boss===false||pd.active===false)break; await sleep(900); }
    ck('third bar death is FINAL (boss falls)', pd && (pd.boss===false || pd.active===false), pd);

    ck('zero page errors', errors.length===0, errors);
    const pass=fails.length===0;
    console.log(JSON.stringify({ pass, fails, errors:errors.slice(0,5) }, null, 1));
    await browser.close(); process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
