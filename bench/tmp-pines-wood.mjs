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
    // ---- THE VANTAGE IS FOUND FROM THE GENERATOR, NOT FROM THE WORLD ----
    // Ben's frame is taken from a rise with the wood BELOW and in front of him, so three things have to be true of the
    // spot and all three are questions the generator can answer before a single chunk is loaded:
    //   surfH        the heightfield, not groundY - groundY block-scans a column and a wooded rise's column ends at the
    //                top of a BIRCH, which is how four cuts of this photographed bark.
    //   treeGates    pineAt is the generator's own "is there a trunk here". blockAt cannot be used for this: an
    //                ungenerated chunk answers AIR, so every candidate on the island passed a blockAt clearance test
    //                before the world was loaded and the search returned the same trunk three times.
    //   the drop     the ground has to fall away, or there is no canopy below the eye to hide the band's foot behind.
    //                The bearing it falls away along is the yaw the frame is shot on.
    // THE PAIR IS WHAT IS SCORED, spot AND bearing together. Scoring the spot alone and then taking its steepest fall
    // put the camera on a slope inside a birch stand: the clearance test passed at five blocks and the trunks stood at
    // eight, so the frame was bark and a gap of sky. A vantage is only Ben's vantage if the bearing it looks along is
    // clear of trunks far enough to see the valley, so the LOOK CORRIDOR is part of the test.
    const hill=await page.evaluate(`(()=>{ let best=null;
      for(let r=50; r<${IC.R}*0.75; r+=6) for(let k=0;k<64;k++){ const th=k/64*6.2831853;
        const x=Math.round(${IC.x}+Math.cos(th)*r), z=Math.round(${IC.z}+Math.sin(th)*r), g=__hc.surfH(x,z);
        if(g<=${SEA}+18 || g>=${SEA}+46) continue;
        let stand=true;
        for(let a=0;a<12 && stand;a++){ const an=a/12*6.2831853;
          for(const rr of [0,2,4]){ if(__hc.treeGates(Math.round(x+Math.cos(an)*rr), Math.round(z+Math.sin(an)*rr)).pineAt){ stand=false; break; } } }
        if(!stand) continue;
        // EVERY CELL OF THE CORRIDOR, not a grid over it. Sampling it every two blocks at three offsets stepped straight
        // past one-block trunks spaced four apart: the test passed and the frame was a birch stand. Only the three
        // steepest bearings are tested densely, which is what keeps the whole search inside a second.
        const bear=[];
        for(let a=0;a<16;a++){ const an=a/16*6.2831853;
          // THE DROP IS MEASURED AT FORTY BLOCKS, which is where Ben's near canopy stands. His crowns sit about eight
          // degrees below his eye, so from a 20-block tree at 40 blocks that is roughly 26 blocks of bluff - the number
          // this is looking for, not a gentle 60-block slope.
          bear.push({an, drop:g-__hc.surfH(Math.round(x+Math.cos(an)*40), Math.round(z+Math.sin(an)*40))}); }
        bear.sort((p,q)=>q.drop-p.drop);
        for(const b of bear.slice(0,3)){
          if(b.drop<16) break;
          const cx=Math.cos(b.an), cz=Math.sin(b.an);
          let open=true;
          // ONLY THE FIRST EIGHT BLOCKS HAVE TO BE CLEAR. A thirty-four-block tree-free corridor does not exist anywhere
          // on this island - the search returned null over every candidate - and it should not have to: what ruins the
          // frame is a trunk against the lens, not a wood in the middle distance, which is the subject.
          for(let d=2; d<=8 && open; d++){ for(let off=-3; off<=3 && open; off++){
            const nx=Math.round(x+cx*d-cz*off), nz=Math.round(z+cz*d+cx*off);
            if(__hc.treeGates(nx,nz).pineAt) open=false; } }
          if(!open) continue;
          if(!best || b.drop>best.drop){ best={x,z,g,drop:+b.drop.toFixed(1),yaw:+Math.atan2(-cx,-cz).toFixed(4)}; }
          break; } }
      return best; })()`);
    console.log('  island', JSON.stringify(IC), 'sea', SEA, 'rise', JSON.stringify(hill));
    if(!hill) throw new Error('no rise found');
    await page.evaluate(`__hc.tpAt(${hill.x}+0.5, ${hill.g}+1, ${hill.z}+0.5);`);
    let last=null;
    for(let i=0;i<90;i++){ const f=await page.evaluate('__hc.fill()');
      if(i%5===0) console.log('    fill', JSON.stringify(f));
      if(f && f.meshed>=f.want && JSON.stringify(f)===last) break; last=JSON.stringify(f); await sleep(1000); }
    for(const [tag,yaw] of [['down',hill.yaw],['down90',hill.yaw+Math.PI/2],['down180',hill.yaw+Math.PI],['down270',hill.yaw-Math.PI/2]]){
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
