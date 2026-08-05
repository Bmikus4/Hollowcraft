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
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('no server')); else setTimeout(poll,250); }); })(); }); }
(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=210', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`,null, { timeout:90000 });
    await sleep(2500);
    const boss = process.argv[2]==='boss';
    const k = await page.evaluate(`__hc.corpseKill(${boss})`);      // drop wretch (ground) or seraph (gy+10) corpse
    await page.evaluate(`__hc.aimAt(${k.x}, ${k.gy+4}, ${k.z})`);
    await sleep(700); await page.screenshot({ path: path.join(OUT,'ragdoll-'+(boss?'boss-fall':'wretch')+'.png') });   // mid-fall
    const fall=[];
    for(let i=0;i<9;i++){ const s=await page.evaluate(`__hc.ragState()`); fall.push(s.map(r=>r.y+(r.settled?'S':r.landed?'L':'.'))); await sleep(400); }
    const s1=await page.evaluate(`__hc.ragState()`);
    await page.evaluate(`__hc.aimAt(${k.x}, ${k.gy+3}, ${k.z})`); await sleep(400);
    await page.screenshot({ path: path.join(OUT,'ragdoll-'+(boss?'boss-settled':'wretch2')+'.png') });
    console.log(JSON.stringify({ kill:k, fall, afterSettle:s1, errors }));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
