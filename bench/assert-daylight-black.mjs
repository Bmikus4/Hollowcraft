// DAYLIGHT MUST HAVE DEEP SHADE AND NO BLACK HOLES — the guard Ben asked for BEFORE the shadows get darker.
//
// Ben 08-05: "absolute dark shadows during day time, like hyperrealistic daytime shadows, and THEN ALSO realistic daytime darkness
// too", with a hard precondition given in the same breath: "you must be careful not to reintroduce our black pixel bug."
//
// EVERY EXISTING BLACK-PIXEL METRIC IN THIS BENCH IS AT NIGHT (tmp-grain-black, assert-night-crush, assert-cave-black,
// tmp-black-texel-locate). None of them can fail on a change that only bites in daylight, which is precisely where the two floors
// under discussion live — `irradiance *= (0.26 + 0.74*pow(vSky,1.15))` and `directDiffuse *= (0.17 + 0.83*smoothstep(0.16,0.9,vSky))`,
// both of which were RAISED twice (0.035 -> 0.16 -> 0.26, and 0.12 -> 0.17) because shade read as flat black holes.
//
// SO THIS FILE IS THE CEILING, AND IT IS DELIBERATELY NOT A LOOK TEST. It says nothing about whether shade is dark ENOUGH — that is
// Ben's eye. It says how much of a daylit frame has fallen to black, and it fails if that rises.
//   pureBlack   share of pixels at luminance <= 1. A daylit frame should have almost none.
//   isoBlack    share at <= 1 with a neighbour over 14 — a black pixel in a LIT neighbourhood, which is the artefact he points at,
//               as opposed to a run of black that is a shadow or a silhouette.
//   p10         the dark tail's position. This is what SHOULD fall when shade deepens, and watching it move while the two black
//               shares stay flat is the difference between deeper shade and a broken frame.
//   sunShade    the median of the brightest fifth over the median of the darkest fifth — the frame's own contrast, one number.
// TWO VANTAGES: open daylit ground with tree shadows across it, and under a canopy. Grain OFF (it is a per-pixel noise and would
// dominate an isolated-black count), t=0.42 which is FULL DAYLIGHT (setTime's comment is a quarter turn out — 0.25 noon, 0.75
// midnight, and 0.42 is the value the rest of this bench uses for a daylight frame).
//
// RECORDED CEILING, this build, 2026-08-05 (see BASE below): both vantages hold ZERO pure black and ZERO isolated black. That is the
// number to keep. A change that deepens shade correctly moves p10 and sunShade and leaves those two at zero.
//
//   node bench/assert-daylight-black.mjs
//   HC_PAGE=<copy>.html node bench/assert-daylight-black.mjs   # to price a candidate build against the same crops
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
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  const v=[]; let pure=0, iso=0, n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const l=L(x,y); v.push(l); n++;
    if(l<=1){ pure++;
      let bright=false;
      for(let dy=-1;dy<=1&&!bright;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; if(L(xx,yy)>14){ bright=true; break; } }
      if(bright) iso++; } }
  v.sort((a,b)=>a-b);
  const q=f=>v[Math.min(v.length-1,(v.length*f)|0)];
  const lo=v.slice(0,(v.length*0.2)|0), hi=v.slice((v.length*0.8)|0);
  const med=a=>a.length?a[a.length>>1]:0;
  return { pureBlack:+(100*pure/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3),
           med:+q(0.5).toFixed(2), p10:+q(0.10).toFixed(2), p90:+q(0.90).toFixed(2),
           sunShade:+(med(hi)/Math.max(0.5,med(lo))).toFixed(2) };
}
// THE CEILING THIS BUILD MEASURED. Asserted, not printed: a guard that only prints is a guard nobody runs.
const BASE={ open:{ pureBlack:0.0, isoBlack:0.0 }, canopy:{ pureBlack:0.0, isoBlack:0.0 } };
const TOL=0.05;   // in PERCENT of the crop — 0.05% of a 1000x560 crop is roughly 90 pixels, i.e. a visible speckle, not a rounding wobble
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
    page.on('console',m=>{ const t=m.text(); if(/ERROR: 0:|GL_INVALID|shader/i.test(t)){ errs.push(t); console.log('  GLSL:',t.slice(0,300)); } });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true);`);
    // pinScene() zeroes weather; force clear air back explicitly rather than trusting it, and keep the sun where it was pinned.
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.42)`); await sleep(560); await page.evaluate(`__hc.setTime(0.42)`); await sleep(280); };
    // A TREE-SHADOW VANTAGE, found rather than assumed: stand off the ground looking down at the wood so the crop holds both sunlit
    // grass and the shadows the canopy throws across it. The crop excludes the HUD band and the crosshair box.
    const CROP=[0.10,0.90,0.16,0.62];
    const vantage=async(tag,x,y,z,yaw,pitch)=>{
      await page.evaluate(`__hc.tpAt(${x},${y},${z}); __hc.cam({yaw:${yaw}, pitch:${pitch}})`);
      for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(1600); await pin();
      const F=[]; for(let i=0;i<3;i++){ const f=path.join(OUT,`dayblack-${tag}-${i}.png`); await page.screenshot({path:f}); F.push(stat(f,CROP)); await sleep(200); }
      const pickMed=k=>{ const v=F.map(f=>f[k]).sort((a,b)=>a-b); return v[1]; };
      const r={}; for(const k of ['pureBlack','isoBlack','med','p10','p90','sunShade']) r[k]=pickMed(k);
      console.log(`  ${tag.padEnd(7)} ${JSON.stringify(r)}`);
      return r;
    };
    const gy=await page.evaluate(`__hc.groundY(${SX},${SZ})`);
    const open=await vantage('open', SX+0.5, gy+7, SZ+14.5, Math.PI, -0.40);
    // UNDER THE CANOPY, which is the case both raised floors exist for: leaves are not sky occluders, so the bake calls a forest floor
    // open sky and the only thing darkening it is the shadow map.
    // THE SPOT IS SEARCHED FOR, NOT ASSUMED. Standing at spawn and calling it a canopy gave a BEACH looking out to sea — median 167,
    // sunShade 1.89, sky and water filling the crop — which would have recorded a ceiling for a frame containing no shade at all.
    // A canopy column is one with real cover overhead and room to stand: leaves and logs count, and the two cells at head height
    // must be clear.
    const spot=await page.evaluate(`(()=>{ let best=null;
      for(let r=24;r<=120;r+=8) for(let a=0;a<16;a++){
        const x=Math.round(${SX}+Math.cos(a*Math.PI/8)*r), z=Math.round(${SZ}+Math.sin(a*Math.PI/8)*r);
        const g=__hc.groundY(x,z); if(g<=0) continue;
        if(__hc.blockAt(x,g+1,z)!==0 || __hc.blockAt(x,g+2,z)!==0) continue;
        let cover=0; for(let y=g+4;y<=g+18;y++) if(__hc.blockAt(x,y,z)!==0) cover++;
        if(!best || cover>best.cover) best={x,z,g,cover}; }
      return best; })()`);
    console.log(`  canopy spot ${spot?spot.x+','+spot.z:'none'} — ${spot?spot.cover:0} covered cells overhead`);
    check('a real canopy column was found, not the beach', !!spot && spot.cover>=4, JSON.stringify(spot));
    const canopy=await vantage('canopy', spot.x+0.5, spot.g+1.7, spot.z+0.5, Math.PI*0.5, -0.22);
    check('the daylight frame is actually daylit', open.med>40 && canopy.med>10, `open med ${open.med}, canopy med ${canopy.med}`);
    for(const [tag,r] of [['open',open],['canopy',canopy]]){
      check(`${tag}: no pure black`, r.pureBlack<=BASE[tag].pureBlack+TOL, `${r.pureBlack}% against a ceiling of ${BASE[tag].pureBlack+TOL}%`);
      check(`${tag}: no isolated black`, r.isoBlack<=BASE[tag].isoBlack+TOL, `${r.isoBlack}% against a ceiling of ${BASE[tag].isoBlack+TOL}%`);
    }
    // The dark tail and the contrast are REPORTED, not asserted: they are the numbers a deepening change is supposed to move, and a
    // ceiling on them would be a ceiling on the feature.
    console.log(`\n  for the record — what deeper shade should move:`);
    console.log(`    open    p10 ${open.p10}   sunShade ${open.sunShade}`);
    console.log(`    canopy  p10 ${canopy.p10}   sunShade ${canopy.sunShade}`);
    // HC_SWEEP walks the curve's exponent at the canopy vantage and prints what each setting costs and buys. It is not part of the
    // guard — the guard is the two ceilings above — it is the instrument for choosing the number, and for Ben to see the trade.
    if(process.env.HC_SWEEP){
      const cur=await page.evaluate(`__hc.skyCurve({})`);
      console.log(`\n  curve sweep at the canopy vantage (shipped ${JSON.stringify(cur)}):`);
      for(const e of [1.15, 1.7, 2.5]){
        await page.evaluate(`__hc.skyCurve({exp:${e}})`); await sleep(400); await pin();
        const f=path.join(OUT,`dayblack-sweep-exp-${e}.png`); await page.screenshot({path:f}); const r=stat(f,CROP);
        const c=await page.evaluate(`__hc.skyCurve({})`);
        console.log(`    exp ${String(e).padEnd(5)} half-sky face x${c.atHalf}   med ${String(r.med).padEnd(7)} p10 ${String(r.p10).padEnd(6)} sunShade ${String(r.sunShade).padEnd(6)} pureBlack ${r.pureBlack}%  isoBlack ${r.isoBlack}%`); }
      await page.evaluate(`__hc.skyCurve({exp:${cur.exp}})`);
      // A BUILT SHELTER, because a frame percentile is too blunt for this. The darkest tenth of a wood frame is dark TEXELS as much as
      // it is shade, so p10 barely moving says little. A 9x9 roof four blocks up is deterministic shade whatever the sun's azimuth:
      // vSky under it is 0, directDiffuse is 0, and every term this dial touches is in play at once.
      const RX=SX+30, RZ=SZ+30, RY=await page.evaluate(`__hc.groundY(${SX}+30,${SZ}+30)`);
      await page.evaluate(`(()=>{ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++){
          __hc.cmdRun('/setblock '+(${RX}+dx)+' ${RY} '+(${RZ}+dz)+' planks');
          __hc.cmdRun('/setblock '+(${RX}+dx)+' '+(${RY}+5)+' '+(${RZ}+dz)+' stone'); } })()`);
      for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(1400);
      const roofOk=await page.evaluate(`({ roof:__hc.blockAt(${RX},${RY}+5,${RZ}), floor:__hc.blockAt(${RX},${RY},${RZ}) })`);
      console.log(`  shelter at ${RX},${RY},${RZ} ${JSON.stringify(roofOk)}`);
      // AND THE TERM THAT ACTUALLY BITES. Three vantages: the SHELTER is where the feature lives, the open one is the guard against
      // darkening SUNLIT ground (which this must not do at all), the canopy one is the wood.
      console.log(`  shade-fill sweep — dark 1.0 is the pre-dial build:`);
      for(const d of [1.0, 0.8, 0.65, 0.5, 0.35, 0.2]){
        await page.evaluate(`__hc.dayShade({dark:${d}})`); await sleep(400);
        const out=[];
        for(const [tag,v] of [['shelter',[RX+0.5,RY+2.2,RZ+3.5,Math.PI,-0.30]],['canopy',[spot.x+0.5,spot.g+1.7,spot.z+0.5,Math.PI*0.5,-0.22]],['open',[SX+0.5,gy+7,SZ+14.5,Math.PI,-0.40]]]){
          await page.evaluate(`__hc.tpAt(${v[0]},${v[1]},${v[2]}); __hc.cam({yaw:${v[3]}, pitch:${v[4]}})`); await sleep(700); await pin();
          const f=path.join(OUT,`dayblack-sweep-dark-${d}-${tag}.png`); await page.screenshot({path:f}); const r=stat(f,CROP);
          out.push(`${tag} med ${String(r.med).padEnd(7)} p10 ${String(r.p10).padEnd(6)} p90 ${String(r.p90).padEnd(7)} sun/shade ${String(r.sunShade).padEnd(6)} black ${r.pureBlack}%/${r.isoBlack}%`); }
        console.log(`    dark ${String(d).padEnd(5)} ${out.join('   |   ')}`); }
      await page.evaluate(`__hc.dayShade({dark:1})`);
    }
    check('no page errors and no shader compile errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`  frames: bench/results/dayblack-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
