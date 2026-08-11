// THE TEXEL RULE, BY DAY (Ben 08-11: "the texel rule needs checked during the day", and earlier: "dark shadow
// groupings appear on textures instead of as a mask on otherwise normal textures").
//
// THE NIGHT FIX DOES NOT COVER THE DAY CASE ON ITS OWN. The rendered-luminance floor is gated on light being
// delivered, and by day nothing has placed a lamp: `_bl` is zero across a whole wood, so a shaded face under canopy
// gated as unlit and took no floor. The gate now carries the face's own baked sky access scaled by the day factor,
// which is daylight and is exactly zero after dusk — so this harness is the one that says whether that term does
// anything and what it costs.
//
// TWO VANTAGES, because the fault has two shapes by day:
//   · a vertical face in canopy shade at CLOSE range, which is where he sees it (at distance the mip chain averages
//     the dark texel into its neighbours and the speckle is gone from the image before any shader term touches it);
//   · the far water at the render wall, which is where a shore vista at noon shows a ragged black band.
// The crop median is printed for each so a frame that does not contain the thing being measured is caught here
// rather than believed — three crops in this file's history did not.
//
//   node bench/tmp-texel-day.mjs [k/disp,k/disp,...]
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
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  const v=[]; let pure=0, iso=0, n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const l=L(x,y); v.push(l); n++;
    if(l<=2){ pure++;
      let bright=false;
      for(let dy=-2;dy<=2&&!bright;dy++) for(let dx=-2;dx<=2;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; if(L(xx,yy)>18){ bright=true; break; } }
      if(bright) iso++; } }
  v.sort((a,b)=>a-b);
  const q=f=>+v[Math.min(v.length-1,(v.length*f)|0)].toFixed(1);
  return { med:q(0.5), p10:q(0.10), p90:q(0.90), pureBlack:+(100*pure/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3) };
}
const ROWS=(process.argv[2]||'0.030/0,0.030/0.008').split(',').map(s=>s.split('/').map(Number));
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
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const IC=await page.evaluate(`__hc.island()`);
    // (1) A DIRT WALL IN CANOPY SHADE, stood 1.5 blocks off. Built rather than found: the face has to fill the crop
    // and be the same one every run.
    const spot=await page.evaluate(`(()=>{
      for(let r=8;r<=110;r+=3) for(let a=0;a<24;a++){
        const x=Math.round(${SX}+Math.cos(a*Math.PI/12)*r), z=Math.round(${SZ}+Math.sin(a*Math.PI/12)*r);
        const g=__hc.groundY(x,z); if(g<=0) continue;
        // FLAT AND UNDER COVER, and nothing else. An earlier version also demanded the air above be EMPTY, which no
        // forest floor ever is — it is carpeted in cross plants, so blockAt is non-zero almost everywhere and the
        // search returned null at every threshold. The wall is /setblock in, which overwrites plants anyway.
        const cov=(__hc.canAt(x,g+1,z)||{}).layers||0; if(cov<4) continue;
        let flat=true;
        for(let dx=-5;dx<=5&&flat;dx++) for(let dz=-1;dz<=3;dz++){ if(Math.abs(__hc.groundY(x+dx,z+dz)-g)>1) flat=false; }
        if(flat) return {x,z,g,cov:+cov.toFixed(1)}; }
      return null; })()`);
    console.log(`  shade spot ${JSON.stringify(spot)}`);
    if(!spot) throw new Error('no covered flat ground found');
    await page.evaluate(`(()=>{ for(let dx=-4;dx<=4;dx++) for(let dy=0;dy<=3;dy++) __hc.place2(${spot.x}+dx, ${spot.z}+2, 'dirt', dy);
      __hc.place2(${spot.x}-1, ${spot.z}+1, 'bush', 0); __hc.place2(${spot.x}+1, ${spot.z}+1, 'bush', 0); })()`);
    await sleep(1500);
    // (2) THE SHORE, looking seaward at the far water. Found by walking out until the ground reaches sea level.
    const shore=await page.evaluate(`(()=>{ const cx=${IC.cx}|0, cz=${IC.cz}|0;
      for(let d=40; d<${IC.R}*1.4; d+=2){ const x=cx-d, g=__hc.groundY(x,cz);
        if(g>0 && g<=${IC.sea}+1){ const bx=x+4; return {x:bx, z:cz, g:__hc.groundY(bx,cz)}; } }
      return null; })()`);
    console.log(`  shore ${JSON.stringify(shore)}`);
    // forward is (-sin yaw, -cos yaw): see lookDir().
    const VIEWS=[
      ['shade', spot.x+0.5, spot.g+2.2, spot.z+0.5, Math.atan2(-0,-1), 0.0, [0.34,0.66,0.32,0.72]],
    ];
    if(shore) VIEWS.push(['seawall', shore.x+0.5, shore.g+3, shore.z+0.5, Math.atan2(1,-0), -0.02, [0.20,0.80,0.47,0.58]]);
    const pin=async()=>{ await page.evaluate(`__hc.freezeT(0); __hc.setTime(0.25)`); await sleep(600); return await page.evaluate(`__hc.setTime(0.25)`); };
    for(const [name,px,py,pz,yaw,pitch,CROP] of VIEWS){
      await page.evaluate(`__hc.tpAt(${px},${py},${pz}); __hc.cam({yaw:${yaw}, pitch:${pitch}})`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2500);
      console.log(`  ---- ${name}  (uDay ${await pin()}) ----`);
      for(const [k,disp] of ROWS){
        await page.evaluate(`__hc.scot({amt:0.85, floor:0.02}); __hc.texFloor({k:${k}, disp:${disp}})`); await sleep(300); await pin();
        const f=path.join(OUT,`day-${name}-k${String(k).replace('.','_')}-d${String(disp).replace('.','_')}.png`); await page.screenshot({path:f});
        const r=stat(f,CROP);
        console.log(`    k ${String(k).padEnd(6)} disp ${String(disp).padEnd(7)} med ${String(r.med).padEnd(6)} p10 ${String(r.p10).padEnd(6)} p90 ${String(r.p90).padEnd(6)} pureBlack ${String(r.pureBlack).padEnd(7)}% isoBlack ${r.isoBlack}%`);
      }
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
