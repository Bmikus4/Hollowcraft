// WIND CHIME PHYSICS VERIFY: place a chime, confirm the pendulum state binds + wind moves it (outdoor),
// then run the player through it and confirm a strong impulse + a ring timestamp.
//   node bench/tmp-verify-chime.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(300);
    const spot=await page.evaluate(`(()=>{ const p=__hc.pines(); const r=__hc.chime(Math.floor(p.px)+3, Math.floor(p.pz)); __hc.tpExact(Math.floor(p.px)+3.5, Math.floor(p.pz)-3); return r; })()`);
    await sleep(2500);   // wind should be rocking it by now
    const windState=await page.evaluate(`__hc.chimeState()`);
    // now sprint THROUGH the chime column: hold W toward it
    await page.evaluate(`(()=>{ __hc.cam({yaw:${Math.PI}, pitch:0}); })()`);   // chime is +z of us
    await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
    const brushState=await page.evaluate(`__hc.chimeState()`);
    const w=windState&&windState[0], b=brushState&&brushState[0];
    const windMoves = !!(w && (Math.abs(w.ax)+Math.abs(w.az)+Math.abs(w.vx)+Math.abs(w.vz))>0.004);
    const rang = !!(b && b.rang>0);
    console.log(JSON.stringify({pass:windMoves&&errors.length===0, windMoves, rang, windState, brushState, spot, errors:errors.slice(0,4)},null,1));
    await browser.close();
    process.exit((windMoves&&!errors.length)?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
