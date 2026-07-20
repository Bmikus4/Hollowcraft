// FURNACE FX VISUAL VERIFY — places a mid-smelt furnace via __hc.smelt, then orbits it:
// the fire/glow/item must sit on ONE fixed face (the one nearest the player at ignition),
// never billboard-track the viewer, and nothing may stick out past the block faces.
//   node bench/tmp-verify-furnace.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base = 'http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser = await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    const page = await ctx.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, { timeout:90000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`, { timeout:90000 });

    // stand SOUTH of the furnace spot and ignite it → the fx must claim the south face and stay there
    const spot = await page.evaluate(`(()=>{ const p=__hc.pines(); const px=Math.floor(p.px), pz=Math.floor(p.pz);
      const r=__hc.smelt(px, pz+4); r.standZ=pz; r.standX=px; return r; })()`);
    if(spot.err){ console.log(JSON.stringify({pass:false, err:spot.err})); process.exit(1); }
    await sleep(1200);

    // orbit: shoot the furnace from 4 compass sides at eye level, 3.2 blocks out
    const shots=[['S',0,3.2,0],['W',-3.2,0,-Math.PI/2],['N',0,-3.2,Math.PI],['E',3.2,0,Math.PI/2]];   // yaw 0 faces -Z; dir=(-sin,-cos)
    for(const [name,ox,oz,yaw] of shots){
      await page.evaluate(`(()=>{ __hc.tpExact(${spot.bx+0.5+ox}, ${spot.bz+0.5+oz}); __hc.cam({yaw:${yaw}, pitch:-0.32}); })()`);
      await sleep(600);
      await page.screenshot({ path: path.join(OUT, 'furnace-'+name+'.png') });
      console.log('shot', name);
    }
    // and a close diagonal to check nothing pokes past the block edges
    await page.evaluate(`(()=>{ __hc.tpExact(${spot.bx+2.4}, ${spot.bz+2.4}); __hc.cam({yaw:${Math.PI*0.75}, pitch:-0.4}); })()`);
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'furnace-diag.png') });
    console.log(JSON.stringify({pass:errors.length===0, spot, errors:errors.slice(0,5)}));
    await browser.close();
    process.exit(errors.length?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
