// HOW FAR DOES A LANTERN CARRY, AND WHAT TAKES IT AWAY?
//
// Ben: "light emitters need to be visible from farther away." assert-emitters-and-rays settled that the bloom threshold is
// NOT the cause (8..160 blocks glow identically at 0.88 and 1.15). This walks the row out past the chunk radius and prices
// the two remaining suspects separately: FOG mixing the emitter toward the fog colour, and the atlas MIP CHAIN averaging a
// lantern's bright texels with the transparent black around them as the quad goes sub-pixel.
//   node bench/tmp-emit-reach.mjs
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
// A box around the lantern's OWN projected position, so "visible" is that lamp's pixels and not the scene's.
function around(file,px,py,rad=26,th=60){
  const P=decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,(px-rad)|0), x1=Math.min(P.w,(px+rad)|0), y0=Math.max(0,(py-rad)|0), y1=Math.min(P.h,(py+rad)|0);
  let peak=0, glow=0, s=0, n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const L=lum(P.data,(y*P.w+x)*P.ch); if(L>peak)peak=L; if(L>th)glow++; s+=L; n++; }
  return { peak:+peak.toFixed(1), glow, mean:n?+(s/n).toFixed(2):0 };
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
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const DIST=[8,24,48,96,160,224,288];
    // IN THE AIR AT A FIXED HEIGHT, with the camera at the same height and sky behind: the first attempt put each lamp 12
    // blocks over its own ground and the camera 16 over spawn's, which is inside a forested hillside — six of the seven lamps
    // were behind terrain and read as lamps that do not carry. Nothing about reach can be measured through a hill.
    // The lamp's presence is read back with blockAt, because past the chunk radius /setblock has nowhere to write.
    // y=105, NOT 130: CFG.WORLD_H is 128, so /setblock at 130 writes outside the world and silently does nothing — blockAt
    // read 0 at every distance and the crops were all measuring the same patch of sky.
    // FANNED IN BEARING, not laid along the view axis. A row along the axis is COLLINEAR with the camera, so all seven lamps
    // project to one pixel and every distance reports an identical number — which is exactly what the first run printed.
    // The z offset grows with distance so the angular separation is constant (~5 degrees a lamp) whatever the yaw convention.
    const AIRY=105;
    const lamps=await page.evaluate(`(()=>{ const out=[]; const D=${JSON.stringify(DIST)};
      for(let i=0;i<D.length;i++){ const d=D[i], x=Math.round(${S.sx}+d), z=Math.round(${S.sz}+0.09*d*(i-3));
        __hc.cmdRun('/setblock '+x+' '+${AIRY}+' '+z+' lantern');
        out.push({d,x,y:${AIRY},z, id:__hc.blockAt(x,${AIRY},z)}); }
      return out; })()`);
    const lanternId=await page.evaluate(`__hc.bid('lantern')`);
    console.log('  lamps (d, blockAt vs lantern id '+lanternId+'): '+JSON.stringify(lamps.map(l=>[l.d,l.id])));
    await page.evaluate(`__hc.tpAt(${S.sx}-8, ${AIRY}, ${S.sz}+0.5);`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(600); }
    await sleep(2500);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(420); await page.evaluate(`__hc.setTime(${t})`); await sleep(200); };
    await pin(0.75);
    const far=lamps[3];   // the mid lamp is the one with no bearing offset: centring it puts the whole fan on screen
    let bestYaw=0, bestR=1e9;
    for(let i=0;i<24;i++){ const yaw=i*Math.PI/12;
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:0.0})`); await sleep(110);
      const p=await page.evaluate(`__hc.screenOf(${far.x}+0.5, ${far.y}+0.5, ${far.z}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-280); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:0.0})`); await sleep(600);
    console.log(`  yaw ${bestYaw.toFixed(2)}, camera.far ${JSON.stringify(await page.evaluate(`__hc.godrays?__hc.godrays().camFar:null`))}`);
    const measure=async(tag)=>{ const f=path.join(OUT,`reach-${tag}.png`); await page.screenshot({path:f}); const out=[];
      for(const L of lamps){ const p=await page.evaluate(`__hc.screenOf(${L.x}+0.5, ${L.y}+0.5, ${L.z}+0.5)`);
        out.push({ d:L.d, on:!!(p&&p.onScreen), ...(p&&p.onScreen?around(f,p.px,p.py):{peak:null,glow:null,mean:null}) }); }
      return out; };
    const A=await measure('shipped');
    await page.evaluate(`__hc.vis({fogmul:0})`); await sleep(700);
    const B=await measure('nofog');
    await page.evaluate(`__hc.vis({fogmul:1})`); await sleep(400);
    console.log('   dist |  shipped  peak / glow px / mean  |  fog off  peak / glow px / mean');
    for(let i=0;i<lamps.length;i++){ const a=A[i], b=B[i];
      console.log(`   ${String(a.d).padStart(4)} |  ${a.on?String(a.peak).padStart(6):'  OFFSCR'} ${String(a.glow).padStart(6)} ${String(a.mean).padStart(7)}  |  ${b.on?String(b.peak).padStart(6):'  OFFSCR'} ${String(b.glow).padStart(6)} ${String(b.mean).padStart(7)}`); }
    console.log('  frames: bench/results/reach-*.png');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
