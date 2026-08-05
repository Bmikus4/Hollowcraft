// v1: precise ground-level looks — (1) cabin from its yard, (2) shrub ground-contact on open beach.
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
const TAG = process.argv[2] || 'base';
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,250)));
    const extra = process.argv[3] ? ('&'+process.argv[3]) : '';
    await page.goto(base+'/index.html?debug=1&t=210'+extra,{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    const st = await page.evaluate(`__hc.st()`); const SX=st.sx, SZ=st.sz;
    console.log('spawn', SX, SZ, 'day', st.day);
    const CX=SX+22, CZ=SZ-14;

    // ---- CABIN: find the plank FLOOR y at the cabin centre, then stand in the yard at floor+2
    await page.evaluate(`__hc.tp(${CX},${CZ}+14)`); await sleep(8000);
    const info = await page.evaluate(`(()=>{ const CX=${CX}, CZ=${CZ};
      let floorY=-1; for(let y=4;y<200;y++){ if(__hc.blockAt(CX,y,CZ)!==0 && __hc.blockAt(CX,y+2,CZ)===0 && __hc.blockAt(CX,y+3,CZ)===0){ floorY=y; break; } }
      const ridge=[]; for(let y=floorY;y<floorY+12;y++) ridge.push(__hc.blockAt(CX,y,CZ));
      // wall ring audit: every edge cell of the 7x7 at y=floor+1..+3
      const wall={}, miss=[];
      for(let y=1;y<=3;y++)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
        if(Math.abs(dx)!==3 && Math.abs(dz)!==3) continue;
        const b=__hc.blockAt(CX+dx,floorY+y,CZ+dz); wall[b]=(wall[b]|0)+1; if(b===0) miss.push([dx,y,dz]); }
      const roof={}; for(let i=0;i<3;i++)for(let dx=-3;dx<=3;dx++){ const y=floorY+4+i, dz=3-i;
        const a=__hc.blockAt(CX+dx,y,CZ+dz), b=__hc.blockAt(CX+dx,y,CZ-dz); roof[a]=(roof[a]|0)+1; roof[b]=(roof[b]|0)+1; }
      return {floorY, ridge, wall, missing:miss, roof}; })()`);
    console.log('cabin', JSON.stringify(info));
    const FY=info.floorY;
    for(const [dz,name] of [[13,'front'],[-13,'back']]){
      await page.evaluate(`__hc.tpAt(${CX}, ${FY}+2.6, ${CZ}+(${dz}))`); await sleep(1600);
      await page.evaluate(`__hc.look(${CX}, ${FY}+3, ${CZ})`); await sleep(1400);
      await page.screenshot({ path: path.join(OUT,'v1-'+TAG+'-cabin-'+name+'.png') });
      console.log('shot cabin', name);
    }

    // ---- SHRUBS: open beach, bright sun, 2.5 blocks away, eye 1.1 above the block base
    // walk west from spawn to find sand at sea level with open sky
    const spot = await page.evaluate(`(()=>{ for(let d=0;d<80;d++){ const x=${SX}-d, z=${SZ};
        let g=-1; for(let y=120;y>2;y--){ if(__hc.blockAt(x,y,z)!==0){ g=y; break; } }
        if(g>0 && __hc.blockAt(x,g,z)===__hc.blockAt(x,g,z)){ /* keep */ }
        if(g>0){ let clear=true; for(let y=g+1;y<g+30;y++) if(__hc.blockAt(x,y,z)!==0){ clear=false; break; }
          if(clear) return {x,z,g}; } } return null; })()`);
    console.log('shrubSpot', JSON.stringify(spot));
    if(spot){
      await page.evaluate(`__hc.tp(${spot.x},${spot.z})`); await sleep(3500);
      const row = await page.evaluate(`(()=>['bush','fern','berry','tallgrass'].map((id,i)=>__hc.place2(${spot.x}+i*2, ${spot.z}, id, 0)))()`);
      console.log('row', JSON.stringify(row));
      const by=row[0].by;
      await page.evaluate(`__hc.tpAt(${spot.x}+3, ${by}+1.0, ${spot.z}+4)`); await sleep(1600);
      await page.evaluate(`__hc.look(${spot.x}+3, ${by}+0.35, ${spot.z})`); await sleep(1400);
      await page.screenshot({ path: path.join(OUT,'v1-'+TAG+'-shrub.png') });
      console.log('shot shrub by=',by);
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
