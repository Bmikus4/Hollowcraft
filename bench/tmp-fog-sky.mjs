// WHY THE OCEAN AND THE SKY STAY CLEAR INSIDE A FOG BANK (Ben 08-04, the colonnade screenshot).
//
// scene.fog reaches the terrain automatically; the horizon layers all carry fog:false and opt in by hand off the WEATHER
// amount — fogShell.opacity = min(0.985, wf*1.25) covers the sky (index.html:5423 region), pineMat/pineUnderMat fade out on
// uWx, waterMat blends toward uFogColor on uWx. Every one of those reads `wf`, and wf is `_under ? 0 : weather.fog`
// (5426), where _under = inDungeon() || playerRoofed(). So standing under a roof with the sky in view is claimed to zero
// the whole horizon-fog path while the terrain keeps its haze.
//
// Two positions, one page, weather.fog forced to 0.9 the whole time:
//   A. open ground  — the control: the shell must cover the sky and the sky crop must go pale
//   B. under the cathedral roof, sky visible through the arches — the same forced fog, and what the state reads there
// If B reports weather.fog 0.9 with fogShellOp 0, the gate is the cause and no pixel is needed to argue it.
//
//   node bench/tmp-fog-sky.mjs
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
function mean(file,crop){ const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0; let s=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
  return +(s/n).toFixed(1); }
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
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const HOLD=`__hc.setTime(0.42);`;
    await page.evaluate(HOLD);
    const SKY=[0.30,0.70,0.06,0.26], GROUND=[0.30,0.70,0.62,0.80];   // upper middle = sky/horizon layers; lower middle = terrain
    const settle=async()=>{ for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); } await sleep(2200); };
    const state=async()=>await page.evaluate(`__hc.horizonDbg()`);
    const shot=async(n)=>{ await page.evaluate(HOLD); await sleep(200); const f=path.join(OUT,n); await page.screenshot({path:f}); return f; };

    // --- A. OPEN GROUND, fog off then on: the control that says the horizon-fog path works at all.
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}, ${gy+3}, ${S.sz}); __hc.cam({yaw:0.6, pitch:0.02});`);
    await settle();
    await page.evaluate(`__hc.fog(0)`); await sleep(1800);
    const clearF=await shot('fogsky-open-clear.png');
    console.log('  OPEN, fog 0.0   '+JSON.stringify(await state()));
    console.log('                  sky '+mean(clearF,SKY)+'   ground '+mean(clearF,GROUND));
    await page.evaluate(`__hc.fog(0.9)`); await sleep(2600);
    const openF=await shot('fogsky-open-fog.png');
    const openState=await state();
    console.log('  OPEN, fog 0.9   '+JSON.stringify(openState));
    console.log('                  sky '+mean(openF,SKY)+'   ground '+mean(openF,GROUND));

    // --- THE STRIP. A hard navy line survives the bank at the sea line while everything around it washes out. Bisect it by
    // layer, over a crop that is ONLY that line, and read the luminance step across it. oceanMat's uniforms (index.html:3089)
    // carry no uWx at all, unlike pineMat/pineUnderMat/waterMat, so it is the candidate.
    {
      const STRIP=[0.40,0.72,0.515,0.555];
      const rec=async(tag)=>{ const f=await shot('fogsky-strip-'+tag+'.png'); console.log('    strip '+tag.padEnd(10)+' '+mean(f,STRIP)+'   (sky above '+mean(f,[0.40,0.72,0.40,0.48])+')'); };
      await rec('all');
      await page.evaluate(`__hc.horizonDbg(false,true)`); await sleep(900); await rec('no-ocean');
      await page.evaluate(`__hc.horizonDbg(true,false)`); await sleep(900); await rec('no-pine');
      await page.evaluate(`__hc.horizonDbg(false,false)`); await sleep(900); await rec('no-layers');
      await page.evaluate(`__hc.horizonDbg(true,true)`); await sleep(600);
    }

    // --- B. UNDER A ROOF with the sky in view. The cathedral colonnade is the structure in Ben's shot.
    const ch=await page.evaluate(`__hc.church()`);
    console.log('  church: '+JSON.stringify(ch));
    if(ch && ch.x!=null){
      const cgy=await page.evaluate(`__hc.groundY(${ch.x},${ch.z})`);
      await page.evaluate(`__hc.tpAt(${ch.x}, ${cgy+3}, ${ch.z}); __hc.cam({yaw:0.6, pitch:0.02});`);
      await settle();
      await page.evaluate(`__hc.fog(0.9)`); await sleep(2600);
      const inF=await shot('fogsky-roofed-fog.png');
      const inState=await state();
      console.log('  ROOFED, fog 0.9 '+JSON.stringify(inState));
      console.log('                  sky '+mean(inF,SKY)+'   ground '+mean(inF,GROUND));
      // AND ONE BLOCK OF SKY OVERHEAD: same spot, lifted clear of the roof, same forced fog. If the shell comes back here
      // and nothing else changed, the roof is what switched it off.
      await page.evaluate(`__hc.tpAt(${ch.x}, ${cgy+60}, ${ch.z}); __hc.cam({yaw:0.6, pitch:0.02});`);
      await sleep(2600);
      console.log('  SAME SPOT, 60 UP, fog 0.9 '+JSON.stringify(await state()));
    }
    console.log('  frames: bench/results/fogsky-*.png');
    console.log('DONE');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
