// THE TEXEL RULE, MEASURED AT THE RANGE BEN SEES IT AT. His words, 2026-08-11, after f1eeb7c shipped:
// "i dont think the rule landed, there are still faces with light projecting on them, they are considered lit, yet
// they still have black texels on them. its only when I as the player gets close that I see them" and "during the day
// dark shadow groupings appear on textures instead of as a mask on otherwise normal textures."
//
// TWO THINGS IN THAT REPORT, AND BOTH CHANGE HOW THIS IS MEASURED.
//   · "ONLY WHEN I GET CLOSE" IS A MIP LEVEL. At range the texture is minified and the mip chain averages a dark texel
//     into its bright neighbours, so the speckle is gone from the image before any shader term touches it. Every
//     measurement of this fault so far was taken from a standing vantage several blocks back — which is the one range
//     at which the fault is invisible. This harness stands 1.5 blocks off the face, at mip 0.
//   · "A MASK ON OTHERWISE NORMAL TEXTURES" IS THE FAULT STATED EXACTLY. Shading multiplies albedo, so a falling
//     irradiance takes the dark texels to zero first and the shadow arrives as a PATTERN cut out of the texture
//     instead of as an even drop in value across it. That is what the minimum-albedo scale is supposed to prevent.
//
// So the table below is the shipped floor against a sweep, at a close face, in the two lightings he named: a night
// face with a lantern on it, and a day face in shade. The number wanted is the SMALLEST k that clears the speckle
// without lifting the shade — pureBlack/isoBlack to zero while med barely moves.
//
//   node bench/tmp-texel-closeup.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
// pureBlack is the rule itself ("we cant display fully black texels"); isoBlack is the SPECKLE — a black pixel with a
// lit neighbour, which is what separates a crushed texel from an honest shadow. contrast is the second half of his
// report: p90-p10 across a face that should be one material at one light level. A mask drops med and leaves the
// spread; a multiply widens the spread, which is the shadow "appearing on the texture".
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
  return { med:q(0.5), p10:q(0.10), p90:q(0.90), spread:+(q(0.90)-q(0.10)).toFixed(1),
           pureBlack:+(100*pure/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3) };
}
const CROP=[0.34,0.66,0.30,0.70];
const KS=[0, 0.030, 0.060, 0.090, 0.140, 0.200];
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
    // A BUILT WALL, NOT A FOUND ONE. The face has to be the whole crop and the same one every run, and it has to be
    // DIRT: the fault lands on the textures with near-black texels in them, and stone has none.
    const spot=await page.evaluate(`(()=>{
      for(let r=8;r<=90;r+=3) for(let a=0;a<24;a++){
        const x=Math.round(${SX}+Math.cos(a*Math.PI/12)*r), z=Math.round(${SZ}+Math.sin(a*Math.PI/12)*r);
        const g=__hc.groundY(x,z); if(g<=0) continue;
        let flat=true;
        for(let dx=-5;dx<=5&&flat;dx++) for(let dz=-5;dz<=5;dz++) if(Math.abs(__hc.groundY(x+dx,z+dz)-g)>1){ flat=false; break; }
        if(!flat) continue;
        let clear=true;
        for(let dx=-5;dx<=5&&clear;dx++) for(let dz=-5;dz<=5;dz++) for(let yy=1;yy<=6;yy++) if(__hc.blockAt(x+dx,g+yy,z+dz)!==0){ clear=false; break; }
        if(clear) return {x,z,g}; }
      return null; })()`);
    console.log(`  spot ${JSON.stringify(spot)}`);
    if(!spot) throw new Error('no open flat ground found');
    // A dirt wall on the +z side, a bush in front of it, and a lantern at the foot: the wall's own face is the crop,
    // the bush is Ben's "around shrubs", and the lantern is his "lit area".
    const built=await page.evaluate(`(()=>{ let n=0;
      for(let dx=-4;dx<=4;dx++) for(let dy=0;dy<=3;dy++){ __hc.place2(${spot.x}+dx, ${spot.z}+2, 'dirt', dy); n++; }
      __hc.place2(${spot.x}-1, ${spot.z}+1, 'bush', 0); __hc.place2(${spot.x}+1, ${spot.z}+1, 'bush', 0);
      const l=__hc.place2(${spot.x}, ${spot.z}, 'lantern', 0);
      return {placed:n, lantern:l, wall:__hc.blockAt(${spot.x}, ${spot.g}+2, ${spot.z}+2)}; })()`);
    console.log(`  built ${JSON.stringify(built)}`);
    await sleep(1500);
    // 1.5 BLOCKS OFF THE FACE, EYE ON IT. THE YAW MAPPING IS lookDir()'s, NOT A GUESS: forward is
    // (-sin yaw, -cos yaw), so facing (dx,dz) is yaw = atan2(-dx,-dz). Taking it from the treeline harness instead
    // (atan2(dz,dx)-PI/2) pointed the camera out to sea and the "36% pure black" it read was a night hillside.
    const aim=await page.evaluate(`(()=>{ __hc.tpAt(${spot.x}+0.5, ${spot.g}+2.2, ${spot.z}+0.5);
      __hc.cam({yaw:Math.atan2(-0,-1), pitch:0.0}); return __hc.cam({}); })()`);
    console.log(`  aim ${JSON.stringify(aim)}`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2000);
    // 0.75 is midnight, 0.25 noon (setTime: 0 = sunrise). uDay is printed as the proof the clock took — the cycle runs
    // on between the call and the frame, so it is set twice and read back.
    const pin=async(t)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); return await page.evaluate(`__hc.setTime(${t})`); };
    for(const [when,t] of [['NIGHT + lantern',0.75],['DAY, shaded face',0.25]]){
      const uDay=await pin(t);
      console.log(`  ---- ${when}  (uDay ${uDay}) ----`);
      for(const k of KS){
        await page.evaluate(`__hc.texFloor({k:${k}})`); await sleep(300); await pin(t);
        const f=path.join(OUT,`closeup-${when.split(' ')[0]}-k${String(k).replace('.','_')}.png`); await page.screenshot({path:f});
        const r=stat(f,CROP);
        console.log(`    k ${String(k).padEnd(6)} med ${String(r.med).padEnd(6)} p10 ${String(r.p10).padEnd(6)} p90 ${String(r.p90).padEnd(6)} spread ${String(r.spread).padEnd(6)} pureBlack ${String(r.pureBlack).padEnd(7)}% isoBlack ${r.isoBlack}%`);
      }
    }
    await page.evaluate(`__hc.texFloor({k:0.030})`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
