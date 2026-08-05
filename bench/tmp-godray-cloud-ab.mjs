// IS THE CLOUD OCCLUSION WHAT TOOK THE SHAFTS AWAY, or were they never measurable at this vantage?
// assert-godray-seed's sun check reads +0.080 on a threshold of +1.0, and its lantern check is a RATIO of that number, so
// both fail together whenever the shaft is small. The cloud transmittance (uCloudOcc) multiplies the seed, and at t=0.492
// the cover over the sun's line is whatever the deterministic field says it is — which cannot be reasoned about, only read.
// Three frames at one vantage: pass off, pass on with the occlusion, pass on without it (cloudOcc:0 = the pre-change pass).
//   node bench/tmp-godray-cloud-ab.mjs
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
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, 104, ${S.sz}+0.5)`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(220); };
    await pin(0.492);
    let best=null;
    for(let i=0;i<48;i++) for(const pitch of [0.05,0.20]){
      const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(70);
      const g=await page.evaluate(`__hc.godrays()`);
      if(g.front && Math.abs(g.sunProjXY[0])<0.45 && Math.abs(g.sunProjXY[1])<0.45){
        const r=Math.hypot(g.sunProjXY[0],g.sunProjXY[1]); if(!best||r<best.r) best={r,yaw,pitch,xy:g.sunProjXY}; } }
    if(!best) throw new Error('sun never framed');
    await page.evaluate(`__hc.cam({yaw:${best.yaw}, pitch:${best.pitch}})`); await sleep(400); await pin(0.492);
    const sunPx=[(0.5+best.xy[0]*0.5)*1000, (0.5-best.xy[1]*0.5)*560];
    console.log(`  sun at screen ${sunPx[0].toFixed(0)},${sunPx[1].toFixed(0)}`);
    const shot=async tag=>{ const f=path.join(OUT,`grayab-${tag}.png`); await page.screenshot({path:f}); return f; };
    const darkCrop=(file)=>{ const P=decodePNG(fs.readFileSync(file)); let b=null;
      for(let cy=(0.30*P.h)|0; cy<(0.66*P.h)|0; cy+=30) for(let cx=60; cx<P.w-180; cx+=60){
        if(Math.hypot(cx+60-sunPx[0], cy+30-sunPx[1])>340) continue;
        if(Math.abs(cx+60-P.w*0.5)<70 && Math.abs(cy+30-P.h*0.5)<50) continue;
        let s=0,n=0; for(let y=cy;y<cy+60;y++) for(let x=cx;x<cx+120;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
        const m=s/n; if(m>4 && (!b||m<b.m)) b={m,cx,cy}; }
      return b; };
    const cropMean=(file,c)=>{ const P=decodePNG(fs.readFileSync(file)); let s=0,n=0;
      for(let y=c.cy;y<c.cy+60;y++) for(let x=c.cx;x<c.cx+120;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
      return +(s/n).toFixed(3); };
    // THE CLOCK IS NOT FROZEN, AND AT DUSK IT IS THE LOUDEST THING IN THE FRAME. DAY_LEN is 840 s and the vantage is
    // t=0.492, eight seconds before sunset, where the whole scene darkens measurably between two 420 ms screenshots — the
    // first run of this probe read the pass as NEGATIVE in both conditions, which no additive pass can be. Every frame is
    // therefore re-pinned to the same worldTime immediately before the shot, and the conditions are cycled twice so a
    // residual drift shows up as disagreement between the two rounds rather than as a result.
    const frame=async(tag,setup)=>{ await page.evaluate(setup); await sleep(300); await pin(0.492); const f=await shot(tag); return f; };
    const fOff=await frame('off',`__hc.godrays({on:false})`);
    const C=darkCrop(fOff); console.log(`  crop ${C.cx},${C.cy} mean ${C.m.toFixed(2)}`);
    const round=async(r)=>{
      const o=cropMean(await frame(`off-r${r}`,`__hc.godrays({on:false})`),C);
      const w=cropMean(await frame(`occ1-r${r}`,`__hc.godrays({on:true, cloudOcc:1})`),C);
      const n=cropMean(await frame(`occ0-r${r}`,`__hc.godrays({on:true, cloudOcc:0})`),C);
      console.log(`  round ${r}: off ${o}   on+clouds ${w} (${(w-o>=0?'+':'')}${(w-o).toFixed(3)})   on+no-clouds ${n} (${(n-o>=0?'+':'')}${(n-o).toFixed(3)})`);
      return {o,w,n}; };
    const r1=await round(1), r2=await round(2);
    console.log(`  mean shift with clouds ${(((r1.w-r1.o)+(r2.w-r2.o))/2).toFixed(3)}, without ${(((r1.n-r1.o)+(r2.n-r2.o))/2).toFixed(3)}`);
    // AT 10x GAIN the question stops being "is this subtle" and becomes "is this dead", and the two conditions separate:
    // if the shafts are there at all, cloudOcc:0 must be BRIGHTER than cloudOcc:1 by the cover over the sun's own line.
    const g1=cropMean(await frame('force-occ1',`__hc.godrays({on:true, cloudOcc:1, forceStrength:10})`),C);
    const g0=cropMean(await frame('force-occ0',`__hc.godrays({on:true, cloudOcc:0, forceStrength:10})`),C);
    const gx=cropMean(await frame('force-off',`__hc.godrays({on:false, forceStrength:10})`),C);
    console.log(`  at 10x gain: off ${gx}   clouds ${g1} (+${(g1-gx).toFixed(3)})   no-clouds ${g0} (+${(g0-gx).toFixed(3)})`);
    await page.evaluate(`__hc.godrays({forceStrength:-1, cloudOcc:1})`);
    // AND WHAT THE CLOUD FIELD ITSELF SAYS along the sun's line, so the luma is not the only witness.
    console.log(`  uniforms: ${JSON.stringify(await page.evaluate(`__hc.godrays()`))}`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
