// QA (Ben 07-27): STAGE II bleaching flash. Drive the real startBossRegen turn and check
//  1) the flash snaps (fog density blown out, lights blown out, screen overlay at 1, sky white ALL AROUND),
//  2) it drains to the steady white heaven (~1.6s),
//  3) leaving stage II hands the horizon rings / dome / lights back exactly as they were.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('no')); else setTimeout(poll,250); }); })(); }); }
(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,180)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=210', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(3500);
    await page.evaluate(`__hc.qaLocked(true); __hc.pitch(0.25)`);   // look up at the sky
    const baseline = await page.evaluate(`__hc.s2()`);
    await page.screenshot({ path: path.join(OUT,'s2-before.png') });
    const kick = await page.evaluate(`__hc.s2Kick()`); console.error('stage2 ->', JSON.stringify(kick));
    await sleep(120); const snap = await page.evaluate(`__hc.s2()`);
    await page.screenshot({ path: path.join(OUT,'s2-flash.png') });
    await sleep(700); const mid = await page.evaluate(`__hc.s2()`);
    await page.screenshot({ path: path.join(OUT,'s2-mid.png') });
    await sleep(1800); const steady = await page.evaluate(`__hc.s2()`);
    await page.screenshot({ path: path.join(OUT,'s2-steady.png') });
    // leave stage II — the world must come back exactly as it was
    await page.evaluate(`__hc.killBoss()`); await sleep(1500);
    const after = await page.evaluate(`__hc.s2()`);
    await page.screenshot({ path: path.join(OUT,'s2-after.png') });
    console.log(JSON.stringify({ baseline, snap, mid, steady, after, pageErrors:errors.slice(0,8) }, null, 1));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
