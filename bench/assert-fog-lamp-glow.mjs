// A LAMP IS STILL A LAMP INSIDE A NIGHT FOG BANK.
//
// Ben, 08-05: "light should be visible through nighttime black fog."
//
// WHAT THE MEASUREMENT FOUND, and it is not what the complaint sounds like (bench/tmp-fog-lamp.mjs). The lamp's own quad is NOT
// erased: flameMat and the remembered-emitter halo are both additive with fog:false, and their pixels come through a bank
// unchanged. What the fog deletes is everything the lamp LIGHTS. three's fog is mix(colour, fogColour, f) and the night fog colour
// is 0.0018/0.0022/0.0034 — so a lit patch of ground 20 blocks away is not veiled, it is replaced by black: crop median 46.9
// clear against 7.9 fogged, and 19.9 against 7.0 at 45 blocks. A lamp with nothing lit around it reads as a bare dot.
//
// THE FIX: fog between the eye and a lit surface is itself lit by the same lamp, so a fraction of the light delivered there is
// added back after the fog mix, in proportion to fogFactor. Night only — reflectedLight.directDiffuse carries the sun, and the
// daylight bank's brightness was signed off after four rounds of tuning.
//
// TWO TRAPS THIS FILE IS BUILT AROUND, both already paid for in this bench:
//   THE CROSSHAIR. A crop centred on a lamp contains the frame centre, and the crosshair reads 218-235 at every distance and in
//   every condition — the first measurement's "the lamp's core survives fog" was the crosshair, not the lamp. The lamp is aimed
//   OFF-CENTRE here and the check asserts it.
//   THE FLAME FLICKERS 12% on real elapsed time, so every number is a median of five frames.
//
//   node bench/assert-fog-lamp-glow.mjs
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
function stat(file,px,py,r){
  const P=decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,px-r)|0, x1=Math.min(P.w,px+r)|0, y0=Math.max(0,py-r)|0, y1=Math.min(P.h,py+r)|0;
  const v=[]; let R=0,G=0,B=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch; v.push(lum(P.data,i)); R+=P.data[i]; G+=P.data[i+1]; B+=P.data[i+2]; n++; }
  v.sort((a,b)=>a-b);
  return { med:+v[v.length>>1].toFixed(2), p90:+v[(v.length*0.9)|0].toFixed(2),
           warm:+((R/n)/Math.max(1,B/n)).toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true);`);

    const G=await page.evaluate(`__hc.scot({})`);
    console.log(`  dials ${JSON.stringify(G)}`);
    check('the fog in-scatter is on by default', G.glow>0.1, `glow ${G.glow}`);

    const S=await page.evaluate(`__hc.st()`);
    const LX=Math.round(S.sx), LZ=Math.round(S.sz), GY=await page.evaluate(`__hc.groundY(${Math.round(S.sx)},${Math.round(S.sz)})`);
    // A pale floor under the lamp, so "what the lamp lights" is a real signal rather than dark grass — and the subject of the
    // measurement is that floor, not the flame.
    await page.evaluate(`(()=>{ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) __hc.cmdRun('/setblock '+(${LX}+dx)+' ${GY} '+(${LZ}+dz)+' planks');
      __hc.cmdRun('/setblock ${LX} ${GY+1} ${LZ} lantern'); })()`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    check('the lantern is placed', (await page.evaluate(`__hc.blockAt(${LX},${GY+1},${LZ})`))>0);

    const D=22;
    await page.evaluate(`__hc.tpAt(${LX}+0.5, ${GY}+3.0, ${LZ}+${D}+0.5)`);
    for(let i=0;i<16;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(350); }
    await sleep(1000);
    // AIM OFF-CENTRE: put the lamp near (300,340) so the crop cannot contain the crosshair at (500,280).
    const TX=300, TY=340;
    let by=0,br=1e9;
    for(let i=0;i<72;i++){ const yaw=i*Math.PI/36; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.10})`); await sleep(45);
      const p=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${GY}+0.5, ${LZ}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-TX,p.py-TY); if(r<br){ br=r; by=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${by}, pitch:-0.10})`); await sleep(500);
    const sp=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${GY}+0.5, ${LZ}+0.5)`);
    const R=54;
    console.log(`  lamp floor projects to ${sp.px|0},${sp.py|0} (r ${br.toFixed(0)} from the off-centre target)`);
    check('the lit floor is on screen', sp.onScreen && br<180, `r ${br.toFixed(0)}`);
    check('and the crop excludes the crosshair', Math.hypot(sp.px-500,sp.py-280)>R+14,
      `crosshair is ${Math.hypot(sp.px-500,sp.py-280).toFixed(0)} px away, crop radius ${R}`);

    const pin=async f=>{ await page.evaluate(`__hc.setTime(0.94); __hc.fog(${f});`); await sleep(560); await page.evaluate(`__hc.setTime(0.94); __hc.fog(${f});`); await sleep(260); };
    const sample=async(tag)=>{ const F=[];
      for(let i=0;i<5;i++){ const f=path.join(OUT,`foglamp-${tag}-${i}.png`); await page.screenshot({path:f}); F.push(stat(f,sp.px,sp.py,R)); await sleep(150); }
      const p=k=>{ const v=F.map(x=>x[k]).sort((a,b)=>a-b); return v[2]; };
      return { med:p('med'), p90:p('p90'), warm:p('warm') }; };

    // ---- the three conditions -------------------------------------------------------------------------------------------
    await page.evaluate(`__hc.scot({glow:0})`); await pin(0);    const clear=await sample('clear');
    await page.evaluate(`__hc.scot({glow:0})`); await pin(0.85); const fogOff=await sample('fog-noglow');
    await page.evaluate(`__hc.scot({glow:0.5})`); await pin(0.85); const fogOn=await sample('fog-glow');
    await page.evaluate(`__hc.scot({glow:0})`); await pin(0.85); const ctl=await sample('fog-noglow-again');
    await page.evaluate(`__hc.scot({glow:0.5})`); await sleep(200);
    console.log(`  clear night, no fog        ${JSON.stringify(clear)}`);
    console.log(`  fog bank, in-scatter OFF  ${JSON.stringify(fogOff)}`);
    console.log(`  fog bank, in-scatter ON   ${JSON.stringify(fogOn)}`);
    console.log(`  fog bank, OFF again       ${JSON.stringify(ctl)}`);
    // THE ARTEFACT MUST BE THERE FIRST. glow 0 is the shipped shader with the term switched off, and it has to show the bank
    // deleting the lit floor, or this file is measuring nothing.
    check('a night bank deletes what the lamp lights, with the term off', fogOff.med < clear.med*0.5,
      `median ${clear.med} -> ${fogOff.med}`);
    const flick=Math.max(Math.abs(fogOff.med-ctl.med), 1.5);
    check('the in-scatter puts the light back through the fog', fogOn.med > fogOff.med+flick+1.5,
      `median ${fogOff.med} -> ${fogOn.med} (flicker ${flick.toFixed(2)})`);
    check('and it comes back WARM, not as grey haze', fogOn.warm > 1.25, `R/B ${fogOff.warm} -> ${fogOn.warm}`);
    // It must not overshoot into "brighter than no fog at all": fog is still fog.
    check('fog is still fog — the glow does not exceed the clear-air light', fogOn.med <= clear.med+2.0,
      `median ${fogOn.med} vs clear ${clear.med}`);

    // ---- DAYLIGHT IS UNTOUCHED ------------------------------------------------------------------------------------------
    // The term is scaled by (1 - day), so the daylight bank Ben signed off after four rounds of tuning cannot move.
    await page.evaluate(`__hc.setTime(0.42); __hc.fog(0.85);`); await sleep(700); await page.evaluate(`__hc.setTime(0.42)`); await sleep(300);
    await page.evaluate(`__hc.scot({glow:0})`); await sleep(420); await page.evaluate(`__hc.setTime(0.42)`); await sleep(260);
    const dOff=await sample('day-noglow');
    await page.evaluate(`__hc.scot({glow:0.5})`); await sleep(420); await page.evaluate(`__hc.setTime(0.42)`); await sleep(260);
    const dOn=await sample('day-glow');
    console.log(`  daylight bank, OFF ${JSON.stringify(dOff)}`);
    console.log(`  daylight bank, ON  ${JSON.stringify(dOn)}`);
    check('a daylight fog bank is unchanged', Math.abs(dOn.med-dOff.med)<=2.0, `median ${dOff.med} -> ${dOn.med}`);

    check('no page errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/foglamp-*.png   (__hc.scot({glow}) is the dial)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
