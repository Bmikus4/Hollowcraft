// Ben's night shot showed long thin near-black strokes in the sky. Claim: they are the sky birds. Test it by putting one in
// front of the camera at night, at the range they actually fly at, and measuring what it reads as: how dark it is against the
// sky behind it, and how long it is against how thick it is. A bird should be a short shape with wings; a "black line" is an
// aspect ratio of dozens to one.
//
//   node bench/tmp-bird-night.mjs [dayFraction]
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
// The dark blob in the middle of the frame: every pixel more than `drop` below the frame's median, its bounding box, and how
// dark the darkest of them is. Aspect ratio of that box is the "is it a line" number.
function blob(file, drop=12){
  const P=decodePNG(fs.readFileSync(file));
  const v=[]; for(let y=0;y<P.h;y++) for(let x=0;x<P.w;x++) v.push(lum(P.data,(y*P.w+x)*P.ch));
  const med=[...v].sort((a,b)=>a-b)[(v.length>>1)];
  let x0=1e9,x1=-1,y0=1e9,y1=-1,n=0,lo=1e9;
  for(let y=0;y<P.h;y++) for(let x=0;x<P.w;x++){ const L=lum(P.data,(y*P.w+x)*P.ch);
    if(L<med-drop){ n++; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; if(L<lo)lo=L; } }
  if(!n) return { none:true, med:+med.toFixed(1) };
  const w=x1-x0+1, h=y1-y0+1;
  return { med:+med.toFixed(1), darkest:+lo.toFixed(1), contrast:+(med-lo).toFixed(1), w, h,
           aspect:+(w/Math.max(1,h)).toFixed(1), px:n };
}
(async()=>{
  const T=process.argv[2]||'0.92';
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:900,height:520},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.setTime(${T});`);
    await page.evaluate(`__hc.skyFlock({spawn:true})`);
    await page.waitForFunction(`(()=>{try{const f=__hc.skyFlock(); return Array.isArray(f)&&f.length>0;}catch(e){return false;}})()`,null,{timeout:20000});
    // FLY UP TO THE FLOCK'S HEIGHT AND LOOK AT ONE, so the sky is the only thing behind it. Distance is whatever the flock is
    // at — that IS the range Ben saw them at.
    for(let k=0;k<8;k++){
      const f=await page.evaluate(`__hc.skyFlock()`); if(!f.length) break;
      const b=f[0];
      await page.evaluate(`(()=>{ const b=__hc.skyFlock()[0]; if(!b) return; __hc.tpAt(b.x-40, b.y+3, b.z-40); __hc.look(b.x,b.y,b.z); })()`);
      await page.evaluate(`__hc.setTime(${T})`); await sleep(500);
      const st=await page.evaluate(`__hc.skyFlock()[0]`);
      const f2=path.join(OUT,`bird-night-${k}.png`);
      // Crop the middle of the frame: the bird is at the crosshair after look(), and cropping keeps terrain and the HUD out of
      // the median that everything else is measured against.
      await page.screenshot({path:f2, clip:{x:300, y:150, width:300, height:220}});
      const r=blob(f2);
      console.log(`  ${k}: bird ${st?st.dist:'?'} blocks off, scale ${st?st.scale:'?'}  →  ${JSON.stringify(r)}`);
      if(!r.none) break;
      await sleep(400);
    }
    console.log('  frames: bench/results/bird-night-*.png');
    console.log('DONE');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
