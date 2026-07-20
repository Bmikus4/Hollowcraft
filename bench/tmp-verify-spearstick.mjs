// SPEAR-STICK VERIFIER — thrown spears embed in the wretch and RIDE it while it moves
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
    await sleep(1500);
    const fails=[]; const ck=(n,c,i)=>{ if(!c) fails.push(n+' :: '+JSON.stringify(i)); };
    await page.evaluate(`(()=>{ __hc.summon(); __hc.put(0, 8); })()`);
    await page.waitForFunction(`(() => { try { return __hc.st().wa===true; } catch(e){ return false; } })()`, { timeout:30000 });
    // throw until one sticks in it (charge windup randomness: retry a few)
    let r=null;
    for(let t=0;t<6;t++){ await page.evaluate(`(()=>{ __hc.put(0, 8); __hc.spearTest(); })()`); await sleep(900);
      r=await page.evaluate(`__hc.riding()`); if(r.some&&r.some(s=>s.onW)) break; }
    ck('spear stuck ON the wretch', Array.isArray(r)&&r.some(s=>s.onW), r);
    const before=(r||[]).find(s=>s.onW);
    await page.evaluate(`__hc.put(25, -20)`); await sleep(400);
    const after=(await page.evaluate(`__hc.riding()`)).find(s=>s.onW);
    ck('spear RODE the move (>15 blocks)', before&&after&&Math.hypot(after.x-before.x,after.z-before.z)>15, {before, after});
    ck('zero page errors', errors.length===0, errors);
    const pass=fails.length===0;
    console.log(JSON.stringify({ pass, fails, errors:errors.slice(0,5) }, null, 1));
    await browser.close(); process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
