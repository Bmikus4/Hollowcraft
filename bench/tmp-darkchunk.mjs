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
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=195', { waitUntil:'load', timeout:90000 }); // dusk: low ambient makes any dark seam pop
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(3000);
    await page.evaluate(`__hc.treeprobe()`); await sleep(8000);       // land in real inland forest, ground level
    const base = await page.evaluate(`__hc.st()`);
    const bx = base.px, bz = base.pz;
    const shots=[];
    // step outward in 3 legs; each leg lands on FRESH ground so new chunks stream beside the player.
    const legs=[[220,0],[0,240],[-260,180]];
    let cx=bx, cz=bz;
    for(let s=0;s<legs.length;s++){
      cx+=legs[s][0]; cz+=legs[s][1];
      const at = await page.evaluate(`__hc.tpExact(${cx}, ${cz})`);   // no y -> ground level
      await sleep(6500);                                              // let the fresh ring stream + mesh
      // look toward the direction we just came from AND ahead, slightly down, to catch ground seams
      await page.evaluate(`__hc.aimAt(${cx-legs[s][0]*3}, ${(at.y||70)-6}, ${cz-legs[s][1]*3})`); await sleep(500);
      const fa=path.join(OUT,`darkchk-${s}a.png`); await page.screenshot({ path:fa });
      await page.evaluate(`__hc.aimAt(${cx+legs[s][0]*3}, ${(at.y||70)-6}, ${cz+legs[s][1]*3})`); await sleep(500);
      const fb=path.join(OUT,`darkchk-${s}b.png`); await page.screenshot({ path:fb });
      shots.push({ at });
    }
    console.log(JSON.stringify({ base:{bx,bz}, shots, errors }, null, 2));
    await browser.close(); process.exit(0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
