// render check: the 3D world-placed spacetime rip + emergence
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
    await sleep(9000);   // let seraphPrewarm finish so the cutscene timeline is honest
    await page.evaluate(`__hc.ripTest()`);
    const waitT=async(tt)=>{ for(let i=0;i<160;i++){ const c=await page.evaluate(`__hc.cine()`); if(!c.active||c.t>=tt)break; await sleep(120); } };
    await waitT(1.9);  await page.screenshot({ path: path.join(OUT,'rip3d-open.png') });     // tear fully open (show-time sampled)
    await waitT(3.3);  await page.screenshot({ path: path.join(OUT,'rip3d-emerge.png') });   // mid-emergence
    await waitT(4.55); await page.screenshot({ path: path.join(OUT,'rip3d-seal.png') });     // sealing
    await sleep(1800);
    const st = await page.evaluate(`__hc.cine()`);
    console.log(JSON.stringify({ errors, cine:st }));
    await browser.close(); process.exit(errors.length?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
