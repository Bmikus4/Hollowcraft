// v1 fix-list recon: (a) shrub/foliage ground contact, (b) cabin visibility, (c) canopy over the cabin.
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
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    const st = await page.evaluate(`__hc.st()`);
    const SX=st.sx, SZ=st.sz; console.log('spawn', SX, SZ, 'day', st.day);

    // ---- (a) FOLIAGE GROUND CONTACT — plant a row on the beach (flat sand), eye 3 blocks away, level
    const bx = SX, bz = SZ;
    await page.evaluate(`__hc.tp(${bx},${bz})`); await sleep(3500);
    const row = await page.evaluate(`(()=>{ const ids=['bush','fern','tallgrass','berry','yarrow','sage'];
      return ids.map((id,i)=>__hc.place2(${bx}+i, ${bz}+4, id, 0)); })()`);
    console.log('row', JSON.stringify(row));
    const gy = row[0].by;   // block y of the foliage
    await page.evaluate(`__hc.tpAt(${bx}+2.5, ${gy}+0.9, ${bz}+7.5)`); await sleep(1400);
    await page.evaluate(`__hc.look(${bx}+2.5, ${gy}+0.3, ${bz}+4.5)`);
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT,'v1-foliage.png') });
    console.log('shot foliage @gy', gy);

    // ---- (b)(c) CABIN — is it built, and what is above it?
    const CX=SX+22, CZ=SZ-14;
    await page.evaluate(`__hc.tp(${CX},${CZ}+22)`); await sleep(6000);
    const scan = await page.evaluate(`(()=>{ const CX=${CX}, CZ=${CZ};
      let g=0; for(let y=180;y>0;y--){ const b=__hc.blockAt(CX,y,CZ); if(b!==0&&b!==undefined){ g=y; break; } }
      // ground = first solid scanning UP from y=2 that has AIR above for 2
      let gy=0; for(let y=4;y<180;y++){ if(__hc.blockAt(CX,y,CZ)!==0 && __hc.blockAt(CX,y+1,CZ)===0 && __hc.blockAt(CX,y+2,CZ)===0){ gy=y; } }
      const col=[]; for(let y=2;y<90;y++) col.push(__hc.blockAt(CX,y,CZ));
      // count leaves/log in the 15x19 cabin box, ABOVE ground+8
      let leafAbove=0, logAbove=0, structBlocks=0;
      for(let dx=-7;dx<=7;dx++)for(let dz=-9;dz<=9;dz++){
        let g2=0; for(let y=180;y>0;y--){ const b=__hc.blockAt(CX+dx,y,CZ+dz); if(b!==0){ g2=y; break; } }
        if(g2>0) structBlocks++;
      }
      return {topSolid:g, lastAirTop:gy, col:col.join(','), cols:structBlocks}; })()`);
    console.log('cabinCol', JSON.stringify(scan).slice(0,1200));
    await page.evaluate(`__hc.tpAt(${CX}, ${scan.lastAirTop}+3.5, ${CZ}+18)`); await sleep(2500);
    await page.evaluate(`__hc.look(${CX}, ${scan.lastAirTop}+3, ${CZ})`); await sleep(1200);
    await page.screenshot({ path: path.join(OUT,'v1-cabin.png') });
    // aerial: straight down on the cabin
    await page.evaluate(`__hc.tpAt(${CX}, ${scan.lastAirTop}+55, ${CZ}+1)`); await sleep(3000);
    await page.evaluate(`__hc.look(${CX}, ${scan.lastAirTop}, ${CZ})`); await sleep(1200);
    await page.screenshot({ path: path.join(OUT,'v1-cabin-aerial.png') });
    console.log('shot cabin');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
