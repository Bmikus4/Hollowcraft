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
// stand under a canopy in a forest, look forward; return player pos so both runs match
async function shoot(browser, port, tag, extraQ){
  const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
  const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,160)));
  await page.goto(`http://127.0.0.1:${port}/index.html?debug=1&t=195${extraQ}`, { waitUntil:'load', timeout:90000 });
  await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
  await sleep(2500);
  const tp = await page.evaluate(`__hc.treeprobe()`); await sleep(8000);
  // drop to just above the forest FLOOR under the canopy and look level-forward
  const tr = tp && tp.oneTree && tp.oneTree.trunk;
  if(tr){ await page.evaluate(`__hc.tpExact(${tr.wx+2}, ${tr.wz+2})`); await sleep(3000); }
  await page.evaluate(`__hc.pitch && __hc.pitch(-0.05)`); await sleep(400);
  const st = await page.evaluate(`__hc.st()`);
  await page.screenshot({ path: path.join(OUT, `alb-${tag}.png`) });
  await page.close();
  return { tag, st, tr, aSky: tp&&tp.aSky, errors };
}
(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const lit = await shoot(browser, port, 'lit', '');
    const alb = await shoot(browser, port, 'albedo', '&albedo=1');
    console.log(JSON.stringify({ lit, alb }, null, 2));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
