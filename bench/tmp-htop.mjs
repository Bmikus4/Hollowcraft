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
// scan a grid around (cx,cz) for columns that have a canopy core, return up to n treeCol reports
const SCAN = `(cx,cz,rad)=>{ const out=[]; for(let dx=-rad;dx<=rad&&out.length<6;dx++)for(let dz=-rad;dz<=rad&&out.length<6;dz++){
  const r=__hc.treeCol(cx+dx,cz+dz); if(r&&!r.err&&r.hasCanopyCore){ out.push({at:[cx+dx,cz+dz],...r}); } } return out; }`;
(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page = await (await browser.newContext({ viewport:{width:800,height:600} })).newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,160)));
    await page.goto(`http://127.0.0.1:${port}/index.html?debug=1&t=195`, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(6000);
    const s = await page.evaluate(`__hc.st()`);
    await page.evaluate(SCAN); // define? no — pass inline
    // near the cabin (spawn + ~(22,-14)) — a chunk endBulk touches
    const near = await page.evaluate(`(${SCAN})(${Math.round(s.px)+22}, ${Math.round(s.pz)-14}, 14)`);
    // far untouched forest (spawn + 150,150)
    await page.evaluate(`__hc.tpExact(${Math.round(s.px)+150}, ${Math.round(s.pz)+150})`); await sleep(9000);
    const far = await page.evaluate(`(${SCAN})(${Math.round(s.px)+150}, ${Math.round(s.pz)+150}, 20)`);
    console.log(JSON.stringify({ spawn:[s.px,s.pz], nearCabin:near, farForest:far, errors }, null, 2));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
