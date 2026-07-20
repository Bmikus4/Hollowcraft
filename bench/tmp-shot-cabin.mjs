// Cabin refit visual check: interior from the doorway + NW corner, exterior west side (birdhouse).
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
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
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
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,250)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    const c=await page.evaluate(`(()=>{ const p=__hc.pines(); return {cx:Math.floor(p.px)+22-Math.floor(p.px)%1, }; })()`).catch(()=>null);
    // cabin sits at spawn+(-?) — read spawn from the Home log: use island() px? Simplest: evaluate mmLandmarks-ish via __hc? Use fixed offsets from spawn via tp.
    const spot=await page.evaluate(`(()=>{ const L={x:0,z:0}; try{ const p=__hc.pines(); L.x=p.px; L.z=p.pz; }catch(e){} return L; })()`);
    // spawn-relative: player boots at spawn; cabin = spawn+22,-14
    const sx=Math.round(spot.x), sz=Math.round(spot.z);
    const CB={x:sx+22, z:sz-14};
    await sleep(2500);
    const pad=await page.evaluate(`__hc.tpExact(${CB.x+0.5}, ${CB.z+6.5})`);   // learn the pad's ground y from the dirt ring outside the door
    const fy=pad.y;   // cabin floor stands at this level
    const shots=[
      ['door-in',   CB.x+0.5, CB.z+2.6, 0, -0.18],            // just inside the door, looking NORTH into the room (yaw0=-Z)
      ['nw-corner', CB.x-2.2, CB.z-2.2, -Math.PI*0.75, -0.15],// NW corner looking SE (chair east wall + bookshelves)
      ['west-out',  CB.x-8,   CB.z-2,   -Math.PI/2, -0.05],   // outside, looking EAST at the west wall + birdhouse
    ];
    for(const [name,x,z,yaw,pitch] of shots){
      await page.evaluate(`(()=>{ __hc.tpExact(${x},${z},${fy}); __hc.cam({yaw:${yaw}, pitch:${pitch}}); })()`);
      await sleep(700);
      await page.screenshot({ path: path.join(OUT,'cabin-'+name+'.png') });
      console.log('shot',name,'y',fy);
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
