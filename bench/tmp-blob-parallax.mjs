// The blob, second discriminator: PARALLAX. pineLayer/oceanLayer are cylinders re-centred on the camera every frame
// (index.html:3386 updateHorizon), and their silhouette comes from treeline(az) — a function of WORLD AZIMUTH ALONE.
// So a band-owned defect sits at a fixed BEARING and does not move when the camera translates, while anything made of
// real voxels must swing across the frame under a 400-block lateral shift. §2's "fixed to a place in the world" cannot
// tell those apart; this can.
//
// Shots are CLIPPED to the treeline strip so the smear is visible at native pixels, and ?dbg=sky is on so any real
// chunk geometry in frame renders greyscale and cannot be mistaken for canopy.
//
//   node bench/tmp-blob-parallax.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
// Column profile of a crop that is ONLY canopy: the blob is then the minimum of that profile, and its x is its bearing.
function profile(file, cols=100){
  const P=decodePNG(fs.readFileSync(file)); const cw=P.w/cols; const per=[];
  for(let c=0;c<cols;c++){ let s=0,n=0; for(let y=0;y<P.h;y++) for(let x=(c*cw)|0;x<((c+1)*cw)|0;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; } per.push(s/n); }
  const sorted=[...per].sort((a,b)=>a-b); const med=sorted[cols>>1];
  let lo=1e9, at=0; for(let c=0;c<cols;c++) if(per[c]<lo){ lo=per[c]; at=c; }
  return { w:P.w, h:P.h, med:+med.toFixed(1), min:+lo.toFixed(1), drop:+(med-lo).toFixed(1), atCol:at, per:per.map(v=>Math.round(v)) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8&dbg=sky',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const HOLD=`__hc.setTime(0.42);`;
    const YAW=-0.785;            // the bearing the blob was found on
    const CLIP={x:0,y:232,width:1000,height:52};   // canopy only: no sky above, no woody band below
    const at=async(x,z,tag)=>{
      await page.evaluate(`__hc.tpAt(${x}, 46, ${z}); __hc.cam({yaw:${YAW}, pitch:-0.02});`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(2200); await page.evaluate(HOLD+`__hc.cam({yaw:${YAW}, pitch:-0.02})`); await sleep(400);
      const f=path.join(OUT,`blob-par-${tag}.png`); await page.screenshot({path:f, clip:CLIP});
      const p=profile(f);
      console.log(`  ${tag}  at (${x},${z})   canopy median ${p.med}  darkest ${p.min} at col ${p.atCol}/100  drop ${p.drop}`);
      console.log('    '+p.per.join(' '));
      return p;
    };
    // Base vantage, then 400 blocks PERPENDICULAR to the view, twice. Perpendicular to yaw -0.785 in world terms:
    // lookDir=(-sin y, ., -cos y) = (0.707, ., -0.707); the right vector is (0.707, ., 0.707).
    const B={x:-359, z:645};
    const a=await at(B.x, B.z, 'base');
    const b=await at(Math.round(B.x+283), Math.round(B.z+283), 'right400');
    const c=await at(Math.round(B.x-283), Math.round(B.z-283), 'left400');
    console.log('\n  darkest canopy column: base '+a.atCol+', +400 right '+b.atCol+', -400 left '+c.atCol);
    console.log('  crops: bench/results/blob-par-*.png');
    console.log('DONE');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
