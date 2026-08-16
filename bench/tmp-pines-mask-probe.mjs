// WHY IS THERE A TREELINE OVER OPEN WATER, AND WHY IS IT FLOATING?
//
// bench/results/ph-w-dusk-on.png: standing on the west beach at eye height looking out to sea, the band draws across
// bearings that are open ocean, and its BASE sits about 55 px ABOVE the water horizon with sky between the two.
// Two separate questions, and this asks both against the generator rather than against the frame:
//   1. per azimuth, what fraction of the band's own radial window (d0 +/- the same 26-block step) is forest by the
//      same test the mask uses - h > SEA+4 and h < SEA+38;
//   2. for the azimuths that pass, what elevation does the band's own arithmetic put the ground line at, in degrees:
//      (groundHeight - cameraY) / distance, which is what the shader computes.
// A treeline drawn at +3.9 degrees when the horizon is at 0 is not a look problem, it is that arithmetic.
//
//   node bench/tmp-pines-mask-probe.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    const IC=await page.evaluate(`__hc.island()`); const SEA=IC.sea;
    const wall=(await page.evaluate(`__hc.pines()`)).wall;
    // The same west-shore stand the frames were shot from.
    const sh=await page.evaluate(`(()=>{ for(let d=Math.round(${IC.R}*1.6); d>40; d-=1){ const x=Math.round(${IC.cx}-d), z=Math.round(${IC.cz});
        if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z)}; } return null; })()`);
    const camY=sh.g+1.62;
    console.log(`  stand ${sh.x},${sh.z} ground ${sh.g} camY ${camY.toFixed(2)}   wall ${wall}  sea ${SEA}  island ${IC.cx},${IC.cz} R ${IC.R}`);
    const rows=await page.evaluate(`(()=>{ const N=384, d0=${wall}*1.0, step=26, out=[];
      for(let i=0;i<N;i++){ const az=(i/N)*6.2831853-3.14159265, dx=Math.cos(az), dz=Math.sin(az);
        let forest=0,hSum=0,hN=0;
        for(let k=0;k<6;k++){ const r=d0-step*1.5+step*k, x=Math.round(${sh.x}+dx*r), z=Math.round(${sh.z}+dz*r);
          const h=__hc.groundY(x,z); if(h>${SEA}+4 && h<${SEA}+38){ forest++; hSum+=h; hN++; } }
        out.push({i, deg:Math.round(az*180/Math.PI), vis:forest/6, gh:hN?hSum/hN:0}); }
      return out; })()`);
    // WHICH AZIMUTHS ARE IN FRONT OF A CAMERA LOOKING DUE WEST: the look direction is (-1,0), so bearings within
    // 37 degrees of az=180/-180 are the ones in that 74-degree frame.
    const inFrame=rows.filter(r=>Math.abs(Math.abs(r.deg)-180)<=37);
    const live=inFrame.filter(r=>r.vis>=0.10);
    console.log(`  looking WEST: ${live.length} of ${inFrame.length} on-screen azimuths carry forest (mask cutoff 0.10)`);
    if(live.length){
      const el=live.map(r=>({deg:r.deg, vis:+r.vis.toFixed(2), gh:Math.round(r.gh), elevDeg:+((r.gh-camY)/wall*180/Math.PI).toFixed(2)}));
      el.sort((a,b)=>b.elevDeg-a.elevDeg);
      console.log('  highest ground lines on screen (ground height, and the degrees above eye the band draws it at):');
      for(const e of el.slice(0,8)) console.log(`    az ${String(e.deg).padStart(4)}  vis ${e.vis}  ground ${e.gh}  ->  ${e.elevDeg} deg above eye`);
      const med=el[el.length>>1];
      console.log(`  median on-screen band elevation ${med.elevDeg} deg above eye   (the water horizon is at 0.00)`);
    }
    // AND THE WHOLE CIRCLE, so "it keeps to the edges" can be read as a number rather than believed.
    const all=rows.filter(r=>r.vis>=0.10);
    console.log(`  whole circle: ${all.length} of 384 azimuths carry forest at ${wall} blocks`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
