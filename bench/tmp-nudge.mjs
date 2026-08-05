// QA (Ben 07-27): the Ceraphim arrival must NOT own the camera — it may only nudge your eyes up ONCE.
// 1) fire the summon, sample pitch: it should rise on its own, then stop and stay put (no hold, no snap-back).
// 2) fire it again and move the mouse mid-nudge: control must come back instantly (nudge dropped).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`,null, { timeout:90000 });
    await sleep(3000);
    await page.evaluate(`__hc.qaLocked(true)`);   // headless has no real pointer lock — look code is gated on it
    const P = () => page.evaluate(`(()=>({pitch:+__hc.pitchNow(), yaw:+__hc.yawNow(), cine:__hc.cine().active, nudge:__hc.nudgeActive()}))()`);
    // ---- RUN 1: hands off. pitch should climb once, then hold wherever it landed.
    await page.evaluate(`__hc.pitch(0)`);
    const before = await P();
    await page.evaluate(`__hc.ripTest()`);
    const trace=[];
    for(let i=0;i<12;i++){ await sleep(250); trace.push(await P()); }
    // ---- RUN 2: same, but yank the mouse 200px mid-nudge -> nudge must die on the spot
    await page.evaluate(`__hc.cineKill && __hc.cineKill()`);
    await sleep(600);
    await page.evaluate(`__hc.pitch(0)`);
    await page.evaluate(`__hc.ripTest()`);
    await sleep(200);
    const midA = await P();
    await page.evaluate(`__hc.lookInject(0,200)`);   // the player yanks the mouse down 200px
    await sleep(400);
    const midB = await P();
    console.log(JSON.stringify({ before, trace, run2:{ midA, midB }, pageErrors:errors.slice(0,8) }, null, 1));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
