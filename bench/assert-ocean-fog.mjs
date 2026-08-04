// THE HORIZON SEA BAND TAKES WEATHER FOG, AND ONLY WEATHER FOG.
//
// oceanMat declared uFogCol and never read it, so a fog bank dense enough to erase the terrain left the sea band drawing pure
// water colour — measured before the fix at fog 0.9: a pixel of rgb(51,70,96), luminance 68, in air reading 189. A 121-level
// hole along the whole horizon, and the only thing left visible in a bank.
//
// Three claims, and the third is the one that keeps the fix honest:
//   1. In a bank, the darkest pixel at the sea line is no longer far below the air around it.
//   2. Hiding oceanLayer barely changes that crop any more — before, hiding it moved the darkest pixel by 79 levels, which is
//      the whole of the defect being carried by one layer.
//   3. CONTROL: in CLEAR AIR the band is untouched, to within the frame-to-frame floor. uWx is 0 there, so a change would mean
//      the mix leaked into the ordinary horizon Ben has already signed off.
//
// Ordered so the control is measured FIRST, before any claim depends on it (bench/assert-ssao.mjs's pattern, same reasons).
//
//   node bench/assert-ocean-fog.mjs
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
// THE DARKEST PIXEL, not the mean. The band is a few rows tall in a 560-row frame, so a crop mean dilutes a 121-level hole
// into single digits; the defect IS the extreme, and the extreme is what has to come back up.
function darkest(file, crop){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  let lo=1e9, at=null, rgb=null, sum=0, n=0; const v=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, L=lum(P.data,i); sum+=L; n++; v.push(L);
    if(L<lo){ lo=L; at=[x,y]; rgb=[P.data[i],P.data[i+1],P.data[i+2]]; } }
  v.sort((a,b)=>a-b);
  // …and the MEDIAN alongside it, for the clear-air control. In clear weather this crop also holds unlit terrain and the
  // treeline's black undertree seam, so `min` there is a 0 that has nothing to do with the sea band and cannot move when the
  // band does. The extreme is the right metric for a hole in fog; the median is the right one for "did the band change".
  return { min:+lo.toFixed(1), mean:+(sum/n).toFixed(1), median:+v[v.length>>1].toFixed(1), at, rgb };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });   // §7: animated grain moves a sixth of the screen between any two frames
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const HOLD=`__hc.setTime(0.42);`;   // pinned at EVERY shot, not once (§7)
    const SEALINE=[0.55,0.82,0.50,0.58], AIR=[0.30,0.72,0.30,0.44];
    const shot=async(n)=>{ await page.evaluate(HOLD); await sleep(200); const f=path.join(OUT,n); await page.screenshot({path:f}); return f; };
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}, ${gy+3}, ${S.sz}); __hc.cam({yaw:0.6, pitch:0.02});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2200);

    // ---- CONTROL FIRST: clear air, band on vs band hidden. uWx is 0, so the two must differ by exactly what they differed by
    // before the change — the band is still the darkest thing at the sea line in clear weather, and that is correct.
    await page.evaluate(`__hc.fog(0)`); await sleep(1800);
    const clrOn=await shot('oceanfog-clear-on.png');
    await page.evaluate(`__hc.horizonDbg(false,true)`); await sleep(900);
    const clrOff=await shot('oceanfog-clear-noocean.png');
    await page.evaluate(`__hc.horizonDbg(true,true)`); await sleep(600);
    const cOn=darkest(clrOn,SEALINE), cOff=darkest(clrOff,SEALINE);
    console.log(`  CLEAR   band on: median ${cOn.median}   band hidden: median ${cOff.median}   delta ${(cOff.median-cOn.median).toFixed(1)}`);

    // ---- THE BANK.
    await page.evaluate(`__hc.fog(0.9)`); await sleep(2800);
    const fogOn=await shot('oceanfog-bank-on.png');
    const air=darkest(fogOn,AIR);
    await page.evaluate(`__hc.horizonDbg(false,true)`); await sleep(900);
    const fogOff=await shot('oceanfog-bank-noocean.png');
    await page.evaluate(`__hc.horizonDbg(true,true)`); await sleep(600);
    const fOn=darkest(fogOn,SEALINE), fOff=darkest(fogOff,SEALINE);
    console.log(`  BANK    band on: min ${fOn.min} rgb(${fOn.rgb})   band hidden: min ${fOff.min}   delta ${(fOff.min-fOn.min).toFixed(1)}`);
    console.log(`          air in the same frame: min ${air.min}, mean ${air.mean}`);

    // 1. THE HOLE IS GONE. Before: 67.8 against air at 189 — 121 levels below it. The band may still be a touch darker than
    //    open air (it is a different surface at a grazing angle) but it cannot be a hole punched through the bank.
    check('the sea band no longer punches through a fog bank', (air.mean - fOn.min) < 40, `sea line ${fOn.min} against air mean ${air.mean} — a gap of ${(air.mean-fOn.min).toFixed(1)} levels, was 121`);
    // 2. AND THE LAYER NO LONGER OWNS THE CROP. Before, hiding it moved the darkest pixel 78.6 levels; there is nothing else
    //    in a bank for it to be hiding, so this is the same claim measured from the other side.
    check('hiding the band barely changes the bank',          Math.abs(fOff.min - fOn.min) < 25, `${fOn.min} with it, ${fOff.min} without — ${Math.abs(fOff.min-fOn.min).toFixed(1)} levels, was 78.6`);
    // 3. CLEAR AIR UNTOUCHED. Both edits are algebraically identity at uWx=0 — clamp(0*1.15)=0 and fogTo=mix(uRing,·,0)=uRing —
    //    so this cannot fail by arithmetic; it fails if the weather amount ever leaks in where the weather is clear, which is
    //    the mistake that would quietly flatten the horizon Ben has already signed off. Measured at 10.0 levels of separation.
    check('clear air still has its horizon separation',       (cOff.median - cOn.median) > 7, `band on ${cOn.median}, hidden ${cOff.median} — the band is still ${(cOff.median-cOn.median).toFixed(1)} levels of separation in clear weather`);
    check('no page errors',                                   errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/oceanfog-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
