// BEN'S OWN FRAME FOR THE HORIZON BAND: standing on a rise INSIDE the wood, at eye height, looking out over the real
// canopy - Screenshot 2026-08-18 091325. It is the only vantage where "the bands sit well above the real treeline with
// open sky beneath and a hard flat BLACK BOTTOM EDGE" can be judged, because it is the only one with a real treeline in
// front of the band.
//
// IT WAITS FOR THE MESH, AND SAYS SO. Two earlier cuts of this photographed a flat grey frame with a block outline in
// the middle of it and were nearly read as "the terrain does not draw": the block DATA was there, so groundY and the
// raycast both answered, while the chunk MESHES around the teleport had not been built yet. fill() is printed every
// second until it is level, and the frame is not taken until it is.
//
//   node bench/tmp-pines-wood.mjs [--set '{"sinkF":0.8}'] [--tag now] [--hours]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const argv=process.argv.slice(2);
const SET=(()=>{ const i=argv.indexOf('--set'); return i<0?null:argv[i+1]; })();
const TAG=(()=>{ const i=argv.indexOf('--tag'); return i<0?'now':argv[i+1]; })();
const HOURS=argv.includes('--hours')?[['noon',0.25],['night',0.75]]:[['noon',0.25]];
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0);`);
    if(SET) await page.evaluate(`__hc.pines(true, ${SET})`);
    console.log('  pines', JSON.stringify(await page.evaluate('__hc.pines()')));
    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    // A wooded rise, not the summit: the highest column in the elevation window a forest occupies.
    // surfH, NOT groundY. groundY block-scans a column and a wooded rise's column ends at the top of a BIRCH: the first
    // cut of this teleported the camera inside a trunk and photographed bark. surfH is the generator's own heightfield,
    // so the camera stands on the ground the trees are standing on. The spot also has to be CLEAR of trunk and leaf: the
    // three blocks above the surface are checked for air.
    const hill=await page.evaluate(`(()=>{ let best=null;
      for(let r=60; r<${IC.R}*0.7; r+=7) for(let k=0;k<48;k++){ const th=k/48*6.2831853;
        const x=Math.round(${IC.x}+Math.cos(th)*r), z=Math.round(${IC.z}+Math.sin(th)*r), g=__hc.surfH(x,z);
        if(g<=${SEA}+14 || g>=${SEA}+30) continue;
        // A CLEARING, NOT A CLEAR COLUMN. One clear column inside a stand still puts a trunk a block from the lens: the
        // second cut of this passed its own air test and photographed birch bark at every yaw. Eight bearings at three
        // blocks have to be clear as well, which is an opening a body can stand in and see out of.
        let clear=true;
        for(let k2=1;k2<=4 && clear;k2++) if(__hc.blockAt(x,g+k2,z)!==0) clear=false;
        for(let n=0;n<8 && clear;n++){ const a=n/8*6.2831853, nx=Math.round(x+Math.cos(a)*3), nz=Math.round(z+Math.sin(a)*3);
          for(let k2=1;k2<=4 && clear;k2++) if(__hc.blockAt(nx,g+k2,nz)!==0) clear=false; }
        if(clear && (!best || g>best.g)) best={x,z,g}; }
      return best; })()`);
    console.log('  island', JSON.stringify(IC), 'sea', SEA, 'hill', JSON.stringify(hill));
    if(!hill) throw new Error('no rise found');
    await page.evaluate(`__hc.tpAt(${hill.x}+0.5, ${hill.g}+1, ${hill.z}+0.5);`);
    let last=null;
    for(let i=0;i<90;i++){ const f=await page.evaluate('__hc.fill()');
      if(i%5===0) console.log('    fill', JSON.stringify(f));
      if(f && f.meshed>=f.want && JSON.stringify(f)===last) break; last=JSON.stringify(f); await sleep(1000); }
    // ---- AND NOW THE CLEARING IS FOUND, WITH THE WORLD LOADED ----
    // blockAt reads the WORLD, and an ungenerated chunk answers air: run over the whole island before anything is loaded
    // and every candidate passes its own clearance test, which is why two cuts of this picked the same trunk twice. The
    // search runs a second time now that the chunks around the rise are meshed, over a local window, and it is the same
    // clearance test - it just has real blocks to answer with this time.
    const spot=await page.evaluate(`(()=>{ let best=null;
      for(let dx=-40; dx<=40; dx+=2) for(let dz=-40; dz<=40; dz+=2){
        const x=${hill.x}+dx, z=${hill.z}+dz, g=__hc.surfH(x,z);
        if(g<=${SEA}+10 || g>=${SEA}+34) continue;
        let clear=true;
        for(let k=1;k<=4 && clear;k++) if(__hc.blockAt(x,g+k,z)!==0) clear=false;
        for(let n=0;n<8 && clear;n++){ const a=n/8*6.2831853, nx=Math.round(x+Math.cos(a)*3), nz=Math.round(z+Math.sin(a)*3);
          for(let k=1;k<=4 && clear;k++) if(__hc.blockAt(nx,g+k,nz)!==0) clear=false; }
        if(clear && (!best || g>best.g)) best={x,z,g}; }
      return best; })()`);
    console.log('  clearing', JSON.stringify(spot));
    if(spot){ await page.evaluate(`__hc.tpAt(${spot.x}+0.5, ${spot.g}+1, ${spot.z}+0.5);`);
      for(let i=0;i<40;i++){ const f=await page.evaluate('__hc.fill()'); if(f && f.meshed>=f.want) break; await sleep(1000); }
      await sleep(2000); }
    for(const [tag,yaw] of [['w0',0],['w90',Math.PI/2],['w180',Math.PI],['w270',-Math.PI/2]]){
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:0});`); await sleep(1500);
      for(const [when,t] of HOURS){
        await page.evaluate(`__hc.setTime(${t})`); await sleep(900); await page.evaluate(`__hc.setTime(${t})`); await sleep(500);
        const f=path.join(OUT,`pw-${TAG}-${tag}-${when}.png`); await page.screenshot({path:f});
        await page.evaluate('__hc.pines(0)'); await sleep(800);
        await page.screenshot({path:path.join(OUT,`pw-${TAG}-${tag}-${when}-off.png`)});
        await page.evaluate('__hc.pines(1)'); await sleep(800);
        console.log(`  ${tag} ${when}: -> ${path.basename(f)} (+ -off control)`);
      }
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
