import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT,'bench','results');
const TAG = process.argv[2] || 'A';
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
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,160)));
    await page.goto(`http://127.0.0.1:${port}/index.html?debug=1&t=195`, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(2500);
    const tp = await page.evaluate(`__hc.treeprobe()`); await sleep(9000);
    let tr = tp && tp.oneTree && tp.oneTree.trunk;
    if(!tr){ const s = await page.evaluate(`__hc.st()`); tr = {wx:Math.round(s.px), wz:Math.round(s.pz), h:64}; }   // fall back to treeprobe's forest center
    // Find an OPEN-AIR camera cell near the trunk: tp to each candidate (ground-snap), keep the first with head+body clear
    const cands=[[3,0],[0,3],[3,3],[-3,0],[0,-3],[4,2],[2,4],[-3,3],[5,0],[0,5]];
    let pick=null, camBlk=null;
    for(const [ox,oz] of cands){ const x=(tr?tr.wx:0)+ox, z=(tr?tr.wz:0)+oz;
      const at = await page.evaluate(`__hc.tpExact(${x}, ${z})`);       // ground-snap
      const py = Math.round(at.y);
      const body = await page.evaluate(`__hc.qaBlock(${x}, ${py}, ${z})`);
      const head = await page.evaluate(`__hc.qaBlock(${x}, ${py+1}, ${z})`);
      if(body===0 && head===0){ pick={x,z,py}; camBlk=body; await sleep(3500); break; }
    }
    await page.evaluate(`__hc.pitch && __hc.pitch(0.0)`); await sleep(400);
    for(let i=0;i<2;i++){ await page.evaluate(`__hc.aimAt(player.pos.x+Math.cos(${i*2.4})*18, player.pos.y+1.4, player.pos.z+Math.sin(${i*2.4})*18)`).catch(()=>{}); await sleep(400);
      await page.screenshot({ path: path.join(OUT, `woods-${TAG}-${i}.png`) }); }
    console.log(JSON.stringify({ tag:TAG, trunk:tr, pick, camBlk_shouldBe0:camBlk, errors }, null, 2));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
