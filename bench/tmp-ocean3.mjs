// THREE'S OCEAN (webgl_shaders_ocean), on the shore vantage, with the frame cost of its planar reflection.
//
// Two things this has to answer and nothing else:
//   1. Does it RENDER? A vendored addon plus a fetched texture is exactly the shape of failure that has twice served a
//      build that did not run at all, so page errors are fatal here, not logged and ignored.
//   2. What does the second scene render COST? Water re-renders the whole scene from the mirrored camera every frame.
//      The forest is the expensive vantage (12.4 of 13.9 ms is scene draw), so it is sampled as well as the shore.
//
// INTERLEAVED A/B/A/B in one page, because this box's cooling fan makes blocked runs measure thermal drift. The dial is
// runtime, so both sides genuinely exist in one build and one load.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// Frame time over a fixed number of frames. Median, not mean: one streaming hitch otherwise decides the answer.
const FRAMES=`(async()=>{ const N=90, ts=[]; let last=performance.now();
  await new Promise(res=>{ let i=0; (function f(){ requestAnimationFrame(()=>{ const now=performance.now(); ts.push(now-last); last=now; if(++i>=N) return res(); f(); }); })(); });
  ts.sort((a,b)=>a-b); const q=f=>+ts[Math.min(ts.length-1,(ts.length*f)|0)].toFixed(2);
  return { med:q(0.5), p90:q(0.9) }; })()`;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null; const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ const m=String(e.message||e).slice(0,220); errs.push(m); console.log('  PAGEERROR:',m); });
    // The URL, not the message: "404 (Not Found)" without it sent this harness looking at the wrong asset once already.
    page.on('response',r=>{ if(r.status()>=400){ const u=r.url(); errs.push(r.status()+' '+u); console.log(`  HTTP ${r.status()} ${u}`); } });
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.island()`);
    const shore=await page.evaluate(`(()=>{ const cx=${IC.cx}|0, cz=${IC.cz}|0;
      for(let d=40; d<${IC.R}*1.4; d+=2){ const x=cx-d, g=__hc.groundY(x,cz);
        if(g>0 && g<=${IC.sea}+1){ const bx=x+4; return {x:bx, z:cz, g:__hc.groundY(bx,cz)}; } }
      return null; })()`);
    console.log(`  shore ${JSON.stringify(shore)}`);
    // NO ARGUMENT: reads the state without setting it, which is the only way to see what a normal load actually ships.
    console.log(`  default ${JSON.stringify(await page.evaluate(`__hc.ocean3()`))}`);
    // Two vantages: the shore looking seaward (where the ocean IS) and the island centre (the forest, the expensive one).
    const VIEWS=[['shore', shore.x+0.5, shore.g+3, shore.z+0.5, Math.atan2(1,-0), -0.02],
                 ['forest', IC.cx+0.5, null, IC.cz+0.5, Math.atan2(-0,-1), 0.0]];
    for(const [name,px,py,pz,yaw,pitch] of VIEWS){
      const y = py!=null ? py : (await page.evaluate(`__hc.groundY(${px|0},${pz|0})`))+2.2;
      await page.evaluate(`__hc.tpAt(${px},${y},${pz}); __hc.cam({yaw:${yaw}, pitch:${pitch}})`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2000);
      await page.evaluate(`__hc.freezeT(0); __hc.setTime(0.25)`); await sleep(500); await page.evaluate(`__hc.setTime(0.25)`);
      console.log(`  ---- ${name} ----`);
      for(const on of [0,1,0,1]){
        console.log(`    ocean3 ${on} -> ${JSON.stringify(await page.evaluate(`__hc.ocean3(${on})`))}`);
        await sleep(1200);
        const f=await page.evaluate(FRAMES);
        console.log(`      frame med ${String(f.med).padEnd(6)} p90 ${f.p90}`);
        if(on) await page.screenshot({path:path.join(OUT,`ocean3-${name}.png`)});
        else   await page.screenshot({path:path.join(OUT,`ocean3-${name}-off.png`)});
      }
      // WAVE SCALE. The example's defaults are tuned to its own plane, not to a world measured in blocks, so the size
      // and the distortion are swept here rather than guessed at once and shipped.
      if(name==='shore'){
        for(const [sz,ds] of [[0.5,3.7],[1,3.7],[3,3.7],[3,8]]){
          await page.evaluate(`__hc.ocean3(1); __hc.ocean3Set({size:${sz}, distortion:${ds}})`); await sleep(900);
          await page.screenshot({path:path.join(OUT,`ocean3-size${String(sz).replace('.','_')}-d${String(ds).replace('.','_')}.png`)});
          console.log(`      shot size ${sz} distortion ${ds}`);
        }
        // THE SPECKLE SURVIVES A COMPLETE REPLACEMENT OF THE WATER SURFACE, so it is not the water shader. Ben named
        // kelp; this is the test of that, and it is a within-page A/B on geometry that is already built.
        await page.evaluate(`__hc.ocean3(1); __hc.ocean3Set({size:3, distortion:3.7})`);
        for(const fol of [1,0,1]){
          console.log(`      foliage ${fol} -> ${JSON.stringify(await page.evaluate(`__hc.folOn(${fol})`))}`);
          await sleep(900);
          await page.screenshot({path:path.join(OUT,`ocean3-fol${fol}.png`)});
        }
        // Foliage is NOT it. Next candidate: the voxel water underneath winning the depth test at the render wall,
        // where the depth buffer has no precision left. Lift the plane and the band should go with it.
        for(const yy of [0.02, 0.5, 2.0]){
          console.log(`      lift ${yy} -> ${JSON.stringify(await page.evaluate(`__hc.ocean3Set({y:${yy}})`))}`);
          await sleep(900);
          await page.screenshot({path:path.join(OUT,`ocean3-lift${String(yy).replace('.','_')}.png`)});
        }
      }
    }
    console.log(errs.length? `  FAIL ${errs.length} page/console errors` : '  no page errors');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
