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
    const alb = process.argv[2]==='albedo' ? '&albedo=1' : '';
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=210'+alb, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(1500);
    await page.evaluate(`__hc.treeprobe()`);   // teleports to the probe center (may find nothing yet)
    await sleep(8000);                          // stream+generate the far region
    const p = await page.evaluate(`__hc.treeprobe()`);   // now the chunks exist → find a real trunk
    const tr = p.oneTree && p.oneTree.trunk;
    if(tr){
      // stand ~12 blocks away at ground eye-level, look at the canopy
      await page.evaluate(`__hc.tpExact(${tr.wx+32}, ${tr.wz}, ${tr.h+8})`);
      await sleep(8000);   // stream the region
      await page.evaluate(`__hc.aimAt(${tr.wx}, ${tr.h+14}, ${tr.wz})`); await sleep(500);   // near-horizontal profile of the tree
      await page.screenshot({ path: path.join(OUT,'tree-closeup'+(alb?'-albedo':'')+'.png') });
    }
    console.log(JSON.stringify({ trunk:tr, oneTree:p.oneTree, errors }));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
