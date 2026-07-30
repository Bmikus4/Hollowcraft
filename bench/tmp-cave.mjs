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
async function shot(browser, port, tag, q){
  const page = await (await browser.newContext({ viewport:{width:1000,height:600} })).newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html?debug=1&t=195${q}`, { waitUntil:'load', timeout:90000 });
  await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
  await sleep(6000);
  // sit the camera DEEP underground (natural rock/caves) — an enclosed space MUST stay dark in the sky viz
  const info = await page.evaluate(`(()=>{ const s=__hc.st(); const px=Math.round(s.px), pz=Math.round(s.pz), cy=Math.round(s.py)-22;
    __hc.tpExact(px, pz, cy); return {px,pz,cy, here:__hc.qaBlock(px,cy,pz), sky_here_should_be_low: 0 }; })().catch?0:0`).catch(e=>({err:String(e)}));
  await sleep(1500);
  await page.evaluate(`__hc.aimAt(player.pos.x+4, player.pos.y-1, player.pos.z)`).catch(()=>{});
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, `cave-${tag}.png`) });
  await page.close();
  return { tag, info };
}
(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const r=[];
    r.push(await shot(browser, port, 'sky', '&dbg=sky'));
    r.push(await shot(browser, port, 'lit', ''));
    console.log(JSON.stringify(r));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
