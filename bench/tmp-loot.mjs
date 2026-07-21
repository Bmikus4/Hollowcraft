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
    await sleep(3000);
    await page.evaluate(`__hc.hold('loot_bag')`); await sleep(300);
    const opened = await page.evaluate(`__hc.useHeld()`);          // open the ceraphim loot bag
    await page.evaluate(`__hc.hold('wretch_bag')`); await sleep(200);
    const opened2 = await page.evaluate(`__hc.useHeld()`);         // open the wretch bag
    const t = await page.evaluate(`__hc.placeTrophy('ceraphim')`); await sleep(2500);
    await page.evaluate(`__hc.aimAt(${t.placed[0]}, ${t.placed[1]+1.2}, ${t.placed[2]})`); await sleep(400);
    await page.screenshot({ path: path.join(OUT,'trophy-ceraphim.png') });
    const t2 = await page.evaluate(`__hc.placeTrophy('wretch')`); await sleep(2000);
    await page.evaluate(`__hc.aimAt(${t2.placed[0]}, ${t2.placed[1]+1.2}, ${t2.placed[2]})`); await sleep(400);
    await page.screenshot({ path: path.join(OUT,'trophy-wretch.png') });
    console.log(JSON.stringify({ afterBothBags:opened2.inv, trophyBlock:t, errors }));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
