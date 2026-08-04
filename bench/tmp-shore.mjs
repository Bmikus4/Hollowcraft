// HOW MUCH WATER IS ON THE SHORE? Ben: "shoreline looks good, but water on shore needs expanded".
//
// The shoreline itself, the curved near-shore water, the ring fade and the ocean annulus are all ACCEPTED work and none of them
// is in question here. This is the near margin only: how many blocks of shallow water lie between the waterline and open sea.
//
// Measured off the heightfield rather than a frame, because the profile is pure worldgen -- surfaceH takes no chunk and no
// camera, so 24 bearings of coast cost one call. CFG.SEA is deliberately NOT the dial: it moves every coast in the world and
// everything ever sited by surfaceH, including the chapel, the dock and the lighthouse.
//
// usage: node bench/tmp-shore.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:800,height:520}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(4000);

    for(const deep of [2,4,8]){
      const p=await page.evaluate('__hc.shoreProfile(24,'+deep+')');
      if(p.err){ console.log('  ERR '+p.err); break; }
      console.log('  water no deeper than '+deep+':  shallow band  min '+p.shallow.min+'  median '+p.shallow.median
        +'  mean '+p.shallow.mean+'  max '+p.shallow.max+'  blocks   (sea level '+p.sea+')');
      if(deep===4){
        console.log('   per bearing (deg / coast r / shallow blocks / beach blocks to grass):');
        for(const o of p.perBearing) console.log('     '+String(o.bearing).padStart(4)+'   '+String(o.coast).padStart(4)
          +'   '+String(o.shallowBlocks).padStart(4)+'   '+o.beachToGrass);
      }
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
