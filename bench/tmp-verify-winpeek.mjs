// WINDOW-PEEK VERIFIER — builds a REAL glass window next to the player, starts the lurk, then asserts:
//  A. it stands in the cell just OUTSIDE the pane, feet on the ground
//  B. it FACES the glass (facing vector dot toward-pane > 0.85 — the backwards bug)
//  C. its face is AT the pane: head within ~1 block of the pane centre vertically + horizontally
//  D. screenshot through the window (the player's view of the press)
//   node bench/tmp-verify-winpeek.mjs
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
    await sleep(1500);
    const fails=[]; const ck=(n,c,i)=>{ if(!c) fails.push(n+' :: '+JSON.stringify(i)); };

    // build a 5-wide glass wall 3 blocks north of the player, at eye height (the lurk scanner samples randomly)
    await page.evaluate(`(()=>{ for(let dx=-2;dx<=2;dx++){ __hc.setBlock(dx,1,-3,'glass'); __hc.setBlock(dx,2,-3,'glass'); } __hc.setBlock(0,3,0,'planks'); __hc.cam({yaw:0,pitch:0}); })()`);   // glass wall + a roof block (an exposed night player hands the lurk straight back to the hunt)
    await sleep(600);
    let L=null; for(let t=0;t<10;t++){ L=await page.evaluate(`__hc.winLurk()`); if(L.ok)break; await sleep(150); }
    ck('window lurk started on the built pane', L.ok===true && L.lurk!=null, L);
    if(L.ok){
      // A: stands in the outside cell (one block past the pane from the player), on the ground
      const dxp=Math.abs(L.pos.x-L.lurk.gx), dzp=Math.abs(L.pos.z-L.lurk.gz);
      ck('stands two cells outside the pane', dxp+dzp>1.2 && dxp+dzp<=4.4, {dxp, dzp, L});   // 2-out placement (diagonal normals go one further on both axes)
      // B: FACES the glass — facing vector (-sin yaw, -cos yaw) toward the pane
      const fdx=-Math.sin(L.yaw), fdz=-Math.cos(L.yaw);
      const tx=L.lurk.gx-L.pos.x, tz=L.lurk.gz-L.pos.z, td=Math.hypot(tx,tz)||1;
      ck('faces the window (was backwards)', (fdx*tx/td+fdz*tz/td)>0.85, {yaw:L.yaw, dot:+(fdx*tx/td+fdz*tz/td).toFixed(2)});
      // C: the servo folds the face to just below the pane centre, one block of air off the glass
      await sleep(1600);
      const H = await page.evaluate(`__hc.headPos()`);
      const tgtY=L.lurk.gy+0.5-0.4;
      ck('face servos to just below the pane centre (±0.9)', Math.abs(H.y-tgtY)<0.9, {headY:H.y, tgtY});
      ck('face a block off the glass (0.8-3.2)', (()=>{const d=Math.hypot(H.x-L.lurk.gx,H.z-L.lurk.gz); return d>0.8&&d<3.2;})(), {H, gx:L.lurk.gx, gz:L.lurk.gz});
      // D: the player's view through the window
      await page.screenshot({ path: path.join(OUT,'winpeek-through-glass.png') });
    }
    ck('zero page errors', errors.length===0, errors);
    const pass=fails.length===0;
    console.log(JSON.stringify({ pass, fails, errors:errors.slice(0,5) }, null, 1));
    await browser.close(); process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
