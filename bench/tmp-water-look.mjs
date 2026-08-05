// THE THREE THINGS BEN ASKED FOR, IN ONE RUN: no foam, transparent water, and no painted plane under the land.
// The hole is DUG with /setblock air, because that is exactly what he did — stand on the shore above sea level and break a few
// blocks — and the 08-04 gate on the camera's own column cannot see it: the camera is over land while the hole is not.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let R=0,G=0,B=0,n=0,bright=0,blue=0; const v=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    R+=r;G+=g;B+=b;n++; const l=lum(P.data,i); v.push(l);
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    if(l>120 && (mx>0?(mx-mn)/mx:0)<0.22) bright++;      // near-grey and bright: what foam looks like
    if(b>r*1.25 && b>28) blue++;                          // blue-dominant: what a painted sea plane looks like
  }
  v.sort((a,b)=>a-b);
  return { rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)], med:+v[n>>1].toFixed(1),
           foamPct:+(100*bright/n).toFixed(3), bluePct:+(100*blue/n).toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    console.log(`  foam ${JSON.stringify(await page.evaluate(`__hc.foam()`))}`);
    console.log(`  sea  ${JSON.stringify(await page.evaluate(`__hc.seaLook()`))}`);
    const S=await page.evaluate(`__hc.st()`);
    const W=await page.evaluate(`(function(){ var Wb=__hc.bid('water');
      for(var a=0;a<24;a++){ var th=a*Math.PI/12;
        for(var d=12; d<=240; d+=2){ var x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d), run=0;
          for(var k=0;k<7;k++){ var xx=Math.round(x+Math.cos(th)*k*2), zz=Math.round(z+Math.sin(th)*k*2), wet=false;
            for(var y=36;y<=42;y++) if(__hc.blockAt(xx,y,zz)===Wb){ wet=true; break; }
            if(wet) run++; else break; }
          if(run>=6) return {x:x,z:z,th:th,d:d}; } }
      return null; })()`);
    console.log(`  coast ${JSON.stringify(W)}`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(240); };
    const shot=async tag=>{ const f=path.join(OUT,`wl-${tag}.png`); await page.screenshot({path:f}); return f; };
    const aimAt=async(x,y,z,pitch)=>{ let by=0,br=1e9;
      for(let k=0;k<32;k++){ const yaw=k*Math.PI/16; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(55);
        const p=await page.evaluate(`__hc.screenOf(${x}, ${y}, ${z})`);
        if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-320); if(r<br){ br=r; by=yaw; } } }
      await page.evaluate(`__hc.cam({yaw:${by}, pitch:${pitch}})`); await sleep(300);
      return page.evaluate(`__hc.screenOf(${x}, ${y}, ${z})`); };
    // 1. SHALLOW WATER FROM THE SHORE — the transparency claim, and the foam claim
    const cx=(W.x-Math.cos(W.th)*5).toFixed(2), cz=(W.z-Math.sin(W.th)*5).toFixed(2);
    await page.evaluate(`__hc.tpAt(${cx}, 43.4, ${cz})`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1600);
    await aimAt((W.x+Math.cos(W.th)*8).toFixed(2), 40, (W.z+Math.sin(W.th)*8).toFixed(2), -0.32);
    await pin(0.30);
    console.log(`  shallow water  ${JSON.stringify(stat(await shot('shore'),[0.28,0.72,0.50,0.74]))}`);
    // 2. THE HOLE, dug three wide and down past sea level
    const hx=Math.round(W.x-Math.cos(W.th)*9), hz=Math.round(W.z-Math.sin(W.th)*9);
    const g=await page.evaluate(`__hc.groundY(${hx},${hz})`);
    await page.evaluate(`(function(){ for(var dx=-1;dx<=1;dx++) for(var dz=-1;dz<=1;dz++) for(var y=${g}; y>=36; y--) __hc.cmdRun('/setblock '+(${hx}+dx)+' '+y+' '+(${hz}+dz)+' air'); })()`);
    await sleep(1500);
    await page.evaluate(`__hc.tpAt(${hx}+2.6, ${g}+3.2, ${hz}+2.6)`); await sleep(700);
    const p2=await aimAt(hx+0.5, g-3, hz+0.5, -0.8);
    await pin(0.30);
    const f2=await shot('hole');
    console.log(`  hole bottom at screen ${p2&&p2.onScreen?(p2.px|0)+','+(p2.py|0):'OFFSCREEN'}`);
    if(p2&&p2.onScreen){
      const P=decodePNG(fs.readFileSync(f2)); const rad=24; let R=0,G=0,B=0,n=0,blue=0;
      for(let y=Math.max(0,p2.py-rad);y<Math.min(P.h,p2.py+rad);y++) for(let x=Math.max(0,p2.px-rad);x<Math.min(P.w,p2.px+rad);x++){
        const i=(y*P.w+x)*P.ch, r=P.data[i],gg=P.data[i+1],b=P.data[i+2]; R+=r;G+=gg;B+=b;n++; if(b>r*1.25&&b>28) blue++; }
      console.log(`  hole floor rgb [${(R/n).toFixed(1)},${(G/n).toFixed(1)},${(B/n).toFixed(1)}]  blue-dominant ${(100*blue/n).toFixed(2)}%  — a painted sea plane inside the hole reads BLUE`);
    }
    // 3. THE HORIZON, so the far plane still exists where it is the only sea there is
    await page.evaluate(`__hc.tpAt(${(W.x+Math.cos(W.th)*30).toFixed(2)}, 60, ${(W.z+Math.sin(W.th)*30).toFixed(2)})`); await sleep(1400);
    await page.evaluate(`__hc.cam({yaw:${W.th}, pitch:-0.05})`); await sleep(300); await pin(0.30);
    console.log(`  far sea band   ${JSON.stringify(stat(await shot('horizon'),[0.30,0.70,0.40,0.48]))}`);
    console.log('  frames: bench/results/wl-shore.png, wl-hole.png, wl-horizon.png');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
