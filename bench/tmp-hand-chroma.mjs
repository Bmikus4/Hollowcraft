// DOES A CARRIED LANTERN BRING THE COLOUR BACK, AND HOW BRIGHT IS ITS POOL? Ben, 08-05, twice:
//   (1) "most of the world is grey at night" — answered by uHandPos (bcb9ba1): the scotopic gate read the BAKED block-light
//       volume, and a torch in your hand is a PointLight that was never baked, so lighting the world by hand did nothing to it.
//   (2) "lighting is completely broken at night, held lights aren't nearly as bright as they should be" — THIS RUN.
//
// Nothing shipped on 08-05 touches heldLight's intensity (46/58), distance (26/32) or decay (1.3) — checked in HEAD's source, so
// the pool is not being dimmed at the light. What the three shipped features CAN do is change what the pool is seen AGAINST:
// the washout greys unlit ground, and directional skylight multiplies the sky/ambient term — which at night IS the whole ambient —
// by 0.80 on a wall and dn on a downward face. So this measures the pool's OWN luminance, at a fixed vantage, with each toggle
// off in turn. That is the measurement nobody had made; every prior number here was a saturation, which says nothing about bright.
//
// Reads absolute luminance AND the lantern-minus-empty delta per condition. The delta is the pool's own contribution and is the
// number that matters: an absolute lum can fall because the surroundings got darker while the pool is untouched, which is a
// different bug from the pool being dim.
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
function hue(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let R=0,G=0,B=0,S=0,n=0; const L=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b); R+=r;G+=g;B+=b; S+= mx>0?(mx-mn)/mx:0; n++;
    L.push(0.2126*r+0.7152*g+0.0722*b); }
  L.sort((a,b)=>a-b);
  return { rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)], sat:+(S/n).toFixed(3),
           lum:+(0.2126*R/n+0.7152*G/n+0.0722*B/n).toFixed(2),
           // A pool is a BRIGHT patch inside a dark crop, so the mean is diluted by however much dark is in frame. p90 is the
           // pool itself; the median is the ground around it. Both, because "the pool is dim" and "the night is dark" differ here.
           med:+L[(L.length*0.5)|0].toFixed(2), p90:+L[(L.length*0.90)|0].toFixed(2), max:+L[L.length-1].toFixed(2) };
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    try{ await page.evaluate(`__hc.freezeAnimals(true)`); }catch(e){}   // animals FLEE the camera, and a contact shadow needs one standing still
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy}+2.6, ${S.sz}+8.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1600);
    await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:-0.45})`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(240); };
    const T=0.94;   // moon well up; setTime is offset a quarter turn from its own comment (t=0.75 is midnight, 0.25 noon)
    // The ground crop the chroma answer was measured in, plus a tight one on the pool itself. A pool 2.6 blocks under the eye at
    // pitch -0.45 lands just below frame centre; the wide crop dilutes it with unlit ground, which is exactly why p90 is read too.
    const GROUND=[0.30,0.70,0.55,0.80], POOL=[0.42,0.58,0.62,0.74];
    const shot=async tag=>{ const f=path.join(OUT,`handchroma-${tag}.png`); await page.screenshot({path:f}); return f; };

    // Each condition is ONE toggle off against the shipped default, and the last is all three, so a fault that needs two of them
    // off cannot hide. Restore explicitly rather than assuming a condition left the defaults alone.
    const DEF=`__hc.scot({amt:0.85}); __hc.skyDir({amt:1}); __hc.contactShadows({on:true});`;
    const CONDS=[
      ['shipped',   DEF],
      ['scot-off',  DEF+` __hc.scot({amt:0});`],
      ['skydir-off',DEF+` __hc.skyDir({amt:0});`],
      ['cs-off',    DEF+` __hc.contactShadows({on:false});`],
      ['all-off',   DEF+` __hc.scot({amt:0}); __hc.skyDir({amt:0}); __hc.contactShadows({on:false});`],
    ];
    // FLICKER IS THE NOISE FLOOR AND IT IS 12%. heldLight.intensity is (strong?58:46)*(1+sin(t*11)*0.07+sin(t*1.9)*0.05), on REAL
    // elapsed time, so any single lantern frame carries up to ±12% of the pool. The first bisect run below read gaps of 0.9–6.6
    // levels of 113 between conditions and every one of them was this, not the feature under test. Median of N frames or the
    // comparison is meaningless.
    const sample=async(tag,crop,n=5)=>{
      const S=[]; for(let i=0;i<n;i++){ const f=await shot(tag); S.push(hue(f,crop)); await sleep(130); }
      const pick=k=>{ const v=S.map(s=>s[k]).sort((a,b)=>a-b); return +v[(v.length*0.5)|0].toFixed(2); };
      return { lum:pick('lum'), med:pick('med'), p90:pick('p90'), max:pick('max'), n };
    };

    if((process.env.HC_MODE||'profile')==='profile'){
      // HOW FAR DOES A HELD LIGHT REACH? This is Ben's axis ("held lights aren't nearly as bright as they should be") and it is
      // NOT the night ambient, which he has asked four times to keep genuinely black and which assert-night-crush guards.
      // heldLight sits AT the camera, so looking straight down at flat ground makes the light-to-surface distance exactly the
      // player's height above it — a radial falloff profile with nothing built and no terrain-flatness trap to fall into.
      // A torch and a lantern are different lights (46/dist 26/0xff6a22 vs 58/dist 32/0xff9838), so both.
      const gy2=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
      await page.evaluate(`__hc.cam({yaw:0, pitch:${-Math.PI/2+0.02}})`);   // straight down; a hair off -pi/2 so the view matrix stays well-conditioned
      const CENTRE=[0.44,0.56,0.40,0.60];   // frame centre only — y 0.50 catches the crosshair but its own pixels are excluded by taking a MEDIAN, and 0.85+ would swallow the hotbar
      await pin(T);
      for(const [item,label] of [['lantern','lantern 58/32'],['torch','torch 46/26']]){
        console.log(`\n  === ${label} — pool luminance vs distance (light is at the camera, so distance = height) ===`);
        await page.evaluate(`__hc.holdNone()`); await sleep(300);
        for(const h of [2,3,4,6,8,12,16,20,26,32]){
          await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy2}+${h}, ${S.sz}+0.5)`); await sleep(500); await pin(T);
          const off=await sample(`prof-${item}-h${h}-off`,CENTRE,3);
          await page.evaluate(`__hc.fillHotbar(['${item}'])`); await sleep(700); await pin(T);
          const on=await sample(`prof-${item}-h${h}-on`,CENTRE,5);
          await page.evaluate(`__hc.holdNone()`); await sleep(300);
          console.log(`    d=${String(h).padStart(2)}b  unlit med ${String(off.med).padStart(6)}  held med ${String(on.med).padStart(6)}  gain ${(on.med-off.med).toFixed(2).padStart(7)}  x${off.med>0.5?(on.med/off.med).toFixed(2):'--'}`);
        }
      }
      console.log(`\n  Read the GAIN column: that is the held light's own delivered luminance at that distance. A ratio divides by`);
      console.log(`  noise when the unlit baseline is near zero at night, which is why the gain is the number and x is a courtesy.`);
      return;
    }

    const rows=[];
    for(const [tag,js] of CONDS){
      const state=await page.evaluate(`(function(){ ${js} return { scot:__hc.scot({}), skyDir:__hc.skyDir({}) }; })()`);
      // EMPTY first: holdNone clears the selected slot, so the pool is genuinely off rather than a lantern out of view.
      await page.evaluate(`__hc.holdNone()`); await sleep(400); await pin(T);
      const fE=await shot(tag+'-empty'); const e=hue(fE,POOL), eG=hue(fE,GROUND);   // ONE frame, two crops — two screenshots are two different frames
      await page.evaluate(`__hc.fillHotbar(['lantern'])`); await sleep(900); await pin(T);
      const fL=await shot(tag+'-lantern'); const l=hue(fL,POOL), lG=hue(fL,GROUND);
      rows.push({tag,state,e,l,eG,lG});
      console.log(`\n  [${tag}]  scot ${state.scot.amt} skyDir ${state.skyDir.amt}`);
      console.log(`    POOL   empty lum ${e.lum} med ${e.med} p90 ${e.p90}  |  lantern lum ${l.lum} med ${l.med} p90 ${l.p90} max ${l.max}`);
      console.log(`    POOL   DELTA lum ${(l.lum-e.lum).toFixed(2)}  med ${(l.med-e.med).toFixed(2)}  p90 ${(l.p90-e.p90).toFixed(2)}   <- the pool's own contribution`);
      console.log(`    GROUND empty rgb ${JSON.stringify(eG.rgb)} sat ${eG.sat} lum ${eG.lum}  |  lantern rgb ${JSON.stringify(lG.rgb)} sat ${lG.sat} lum ${lG.lum}`);
    }
    const base0=rows[0];
    console.log(`\n  === WHICH TOGGLE OWNS THE POOL'S BRIGHTNESS (vs shipped) ===`);
    for(const r of rows.slice(1)){
      const dPool=r.l.p90-base0.l.p90, dDelta=(r.l.p90-r.e.p90)-(base0.l.p90-base0.e.p90);
      console.log(`  ${r.tag.padEnd(11)} lantern p90 ${r.l.p90.toFixed(2)} (${dPool>=0?'+':''}${dPool.toFixed(2)} vs shipped)   pool delta ${(r.l.p90-r.e.p90).toFixed(2)} (${dDelta>=0?'+':''}${dDelta.toFixed(2)})`);
    }
    console.log(`\n  A toggle is the culprit only if turning it OFF raises the lantern frame materially. If every row sits on the`);
    console.log(`  shipped number, nothing I shipped dims the pool and the next suspect is heldLight itself or the grade.`);
    console.log(`  frames: bench/results/handchroma-<cond>-{empty,lantern}.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
