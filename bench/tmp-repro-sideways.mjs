// REPRO: wretch approaches a watching player — capture orientation + state each second
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
    page.on('pageerror', e=>console.log('PAGEERR', String(e.message||e).slice(0,150)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=630', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(1500);
    await page.evaluate(`(()=>{ __hc.summon(); __hc.put(0,-22); })()`);   // 22 blocks ahead, player faces -z = staring at it
    await page.waitForFunction(`(() => { try { return __hc.st().wa===true; } catch(e){ return false; } })()`, { timeout:30000 });
    for(let i=0;i<12;i++){
      const st = await page.evaluate(`__hc.pose()`);
      console.log(i, JSON.stringify(st));
      await page.evaluate(`__hc.look()`);
      await page.screenshot({ path: path.join(OUT, 'repro-'+String(i).padStart(2,'0')+'.png') });
      await sleep(1000);
    }
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
