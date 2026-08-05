// IS THE GOD-RAY PASS DEAD, OR JUST SUBTLE? — Ben, 08-05: "god rays are gone from the sun".
//
// assert-godray-seed reads 143.3 -> 142.8 when the pass is toggled, and it reads the SAME at `69ccdea`, the commit whose message
// recorded 8/8 with "dark ground near a 2.6 degree sun 71.6 -> 89.9". So today is not a regression against that commit, and the
// recorded 8/8 was measured on a crop the COMPASS later took over (the search ran to 0.80 of frame height; the compass is a dark
// static disc bottom-left, and it was chosen as "the darkest patch near the sun" in every frame of every pair).
//
// Half a level is equally consistent with two very different worlds: a pass that does nothing, and a working pass whose additive
// wash is invisible against the 143-of-255 background that is now the darkest thing near the sun at that vantage. A pixel
// statistic cannot separate them. A GAIN CAN: __hc.godrays({forceStrength:6}) is roughly ten times the shipped 0.59, so if the
// whole frame does not move, the pass is not running.
//
// Reported over the WHOLE frame and over a band around the sun, because a shaft is angular: a crop can miss it, a frame cannot.
//
//   node bench/tmp-godray-alive.mjs
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
// the frame's own mean, and the biggest per-pixel difference anywhere in it — a shaft is a local wash, so the max difference is
// what says "something was drawn" even when the mean is dominated by the sky.
function diff(aF,bF){
  const A=decodePNG(fs.readFileSync(aF)), B=decodePNG(fs.readFileSync(bF));
  let ma=0,mb=0,n=0,mx=0,mxAt=[0,0], over1=0;
  for(let y=0;y<Math.min(A.h,B.h);y++) for(let x=0;x<Math.min(A.w,B.w);x++){
    const i=(y*A.w+x)*A.ch, la=lum(A.data,i), lb=lum(B.data,i);
    ma+=la; mb+=lb; n++; const d=lb-la;
    if(d>1) over1++;
    if(d>mx){ mx=d; mxAt=[x,y]; } }
  return { meanA:+(ma/n).toFixed(2), meanB:+(mb/n).toFixed(2), d:+((mb-ma)/n*n/n).toFixed(3),
           maxGain:+mx.toFixed(1), at:mxAt, pxOver1:+(100*over1/n).toFixed(2) };
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone();`);
    const S=await page.evaluate(`__hc.st()`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, __hc.groundY(${Math.round(S.sx)},${Math.round(S.sz)})+6, ${S.sz}+0.5)`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    // frame the sun: t=0.492 is the grazing evening sun the seed harness uses (setTime is a quarter turn out from its comment)
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.492)`); await sleep(540); await page.evaluate(`__hc.setTime(0.492)`); await sleep(240); };
    await pin();
    let best=null;
    for(let i=0;i<72;i++){ const yaw=i*Math.PI/36;
      for(const pitch of [0.02,0.16]){ await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(40);
        const g=await page.evaluate(`__hc.godrays()`);
        if(g.front){ const r=Math.hypot(g.sunProjXY[0], g.sunProjXY[1]); if(!best||r<best.r) best={r,yaw,pitch}; } } }
    if(!best) throw new Error('sun never framed');
    await page.evaluate(`__hc.cam({yaw:${best.yaw}, pitch:${best.pitch}})`); await sleep(400); await pin();
    console.log(`  state ${JSON.stringify(await page.evaluate(`__hc.godrays()`))}`);
    const shot=async tag=>{ const f=path.join(OUT,`gralive-${tag}.png`); await pin(); await page.screenshot({path:f}); return f; };
    for(const st of [0.6, 6, 30]){
      await page.evaluate(`__hc.godrays({on:false, forceStrength:${st}})`); const off=await shot(`off-${st}`);
      await page.evaluate(`__hc.godrays({on:true, forceStrength:${st}})`); const on=await shot(`on-${st}`);
      const g=await page.evaluate(`__hc.godrays()`);
      console.log(`  strength ${String(st).padEnd(4)} (live ${g.strength})  ${JSON.stringify(diff(off,on))}`);
    }
    await page.evaluate(`__hc.godrays({on:true, forceStrength:-1})`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
