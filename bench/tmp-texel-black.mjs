// TEXEL BLACKENING, ATTRIBUTED TO A TERM. Ben, 2026-08-11, with a screenshot: dirt and grass side faces under canopy
// break up into hard black texels while their bright neighbours survive.
//
// THE SHAPE OF THE BUG IS THE CLUE. The black follows the TEXTURE's own texels, not the screen's pixels, and it lands
// on the dark texels of a texture whose bright texels are fine. That is a multiply, not a threshold: a dark albedo
// texel times a small irradiance reaches zero while the bright texel beside it does not, so the face speckles.
// Which means the question is not "is the frame dark" but "how many terms are multiplying the ambient at once", and the
// harness that answers it is an A/B over those terms, one at a time, at a vantage that has the fault in frame.
//
// A VERTICAL FACE UNDER COVER, searched for rather than assumed. The fault needs three things at once: dense canopy
// overhead (so the canopy term bites), a face the sun cannot reach (so the day-shade term bites), and a texture with
// dark texels in it (dirt and the grass side). A forest floor has only the first two.
//
//   node bench/tmp-texel-black.mjs
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
// isoBlack is the metric Ben's report is about: a black pixel whose NEIGHBOUR is lit. A shadow is a run of black and is
// not this. speckleRuns counts how many of those isolated blacks are 1-2 pixels wide, which is what a crushed texel
// looks like on a face that is otherwise coloured.
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  const v=[]; let pure=0, iso=0, n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const l=L(x,y); v.push(l); n++;
    if(l<=2){ pure++;
      let bright=false;
      for(let dy=-1;dy<=1&&!bright;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; if(L(xx,yy)>18){ bright=true; break; } }
      if(bright) iso++; } }
  v.sort((a,b)=>a-b);
  const q=f=>+v[Math.min(v.length-1,(v.length*f)|0)].toFixed(1);
  return { med:q(0.5), p10:q(0.10), p90:q(0.90),
           pureBlack:+(100*pure/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3) };
}
const CROP=[0.18,0.82,0.28,0.72];
// TWO QUESTIONS IN ONE TABLE. The first four rows attribute the fault - if it is the stack of ambient multipliers, then
// turning one off must move the black share, and it does: 22.5% pure black shipped, 12.2% with the canopy term off,
// 6.3% with day-shade off, 1.3% with both off. The rest sweep Ben's floor, which is the fix, and the number wanted is
// the SMALLEST that clears the speckle - a floor bigger than it needs to be is a floor lifting shade that was correct.
const CFGS=[
  ['shipped',        `__hc.texFloor({k:0});`],
  ['canopy off',     `__hc.canopy({on:false}); __hc.texFloor({k:0});`],
  ['day-shade off',  `__hc.canopy({t:0.97,floor:0.55}); __hc.dayShade({dark:1}); __hc.texFloor({k:0});`],
  ['both off',       `__hc.canopy({on:false}); __hc.dayShade({dark:1}); __hc.texFloor({k:0});`],
  ['k 0.002',        `__hc.canopy({t:0.97,floor:0.55}); __hc.dayShade({dark:0.65}); __hc.texFloor({k:0.002});`],
  ['k 0.006',        `__hc.canopy({t:0.97,floor:0.55}); __hc.dayShade({dark:0.65}); __hc.texFloor({k:0.006});`],
  ['k 0.015',        `__hc.canopy({t:0.97,floor:0.55}); __hc.dayShade({dark:0.65}); __hc.texFloor({k:0.015});`],
  ['k 0.030',        `__hc.canopy({t:0.97,floor:0.55}); __hc.dayShade({dark:0.65}); __hc.texFloor({k:0.030});`],
  ['k 0.060',        `__hc.canopy({t:0.97,floor:0.55}); __hc.dayShade({dark:0.65}); __hc.texFloor({k:0.060});`],
  ['shipped',        `__hc.canopy({t:0.97,floor:0.55}); __hc.dayShade({dark:0.65}); __hc.texFloor({k:0});`],
];
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    // A STEP IN THE GROUND UNDER COVER: a column whose neighbour is two or more blocks lower, so there is a vertical
    // dirt/grass face to stand in front of, with real canopy overhead.
    const spot=await page.evaluate(`(()=>{ let best=null;
      for(let r=10;r<=110;r+=4) for(let a=0;a<24;a++){
        const x=Math.round(${SX}+Math.cos(a*Math.PI/12)*r), z=Math.round(${SZ}+Math.sin(a*Math.PI/12)*r);
        const g=__hc.groundY(x,z); if(g<=0) continue;
        const cov=(__hc.canAt(x,g+1,z)||{}).layers||0; if(cov<6) continue;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const g2=__hc.groundY(x+dx*3,z+dz*3); if(g2<=0) continue;
          const drop=g-g2; if(drop<2||drop>5) continue;
          if(__hc.blockAt(x+dx*3,g2+1,z+dz*3)!==0 || __hc.blockAt(x+dx*3,g2+2,z+dz*3)!==0) continue;
          const score=cov+drop;
          if(!best||score>best.score) best={x:x+dx*3, z:z+dz*3, g:g2, dx:-dx, dz:-dz, cov:+cov.toFixed(1), drop, score};
        } }
      return best; })()`);
    console.log(`  spot ${JSON.stringify(spot)}`);
    if(!spot) throw new Error('no shaded step found');
    const yaw=Math.atan2(spot.dz, spot.dx)-Math.PI/2;
    await page.evaluate(`__hc.tpAt(${spot.x}+0.5, ${spot.g}+2.2, ${spot.z}+0.5); __hc.cam({yaw:${yaw}, pitch:0.02})`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2000);
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.30)`); await sleep(500); await page.evaluate(`__hc.setTime(0.30)`); await sleep(300); };
    for(const [label,apply] of CFGS){
      await page.evaluate(apply); await sleep(400); await pin();
      const f=path.join(OUT,`texel-${label.replace(/[^a-z0-9]+/gi,'_')}.png`); await page.screenshot({path:f});
      const r=stat(f,CROP);
      console.log(`    ${label.padEnd(20)} med ${String(r.med).padEnd(6)} p10 ${String(r.p10).padEnd(6)} p90 ${String(r.p90).padEnd(6)} pureBlack ${String(r.pureBlack).padEnd(7)}% isoBlack ${r.isoBlack}%`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
