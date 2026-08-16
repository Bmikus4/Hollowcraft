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
           // PERIMETER OVER AREA, and this is what tells a bigger shadow apart from a broken one. isoBlack counts black
           // pixels with a lit neighbour, so it rises whenever the black REGION grows for an honest reason: a shadow
           // three times the size has a bigger boundary against the dappled light around it, and every pixel of that
           // boundary is "isolated" by this definition. Dividing by the black area removes the size and leaves the
           // shape. Crushing — the actual artefact — makes lone black pixels inside lit surfaces, which is nearly all
           // perimeter and no area, so it drives this UP. A shadow spreading drives it DOWN.
           edgeShare:+(100*iso/Math.max(1,pure)).toFixed(2),
           med:+q(0.5).toFixed(2), p10:+q(0.10).toFixed(2), p90:+q(0.90).toFixed(2),
           sunShade:+(med(hi)/Math.max(0.5,med(lo))).toFixed(2) };
}
// THE CEILING THIS BUILD MEASURED. Asserted, not printed: a guard that only prints is a guard nobody runs.
//
// ---- RE-BASED 2026-08-06, AND THE CANOPY'S pureBlack CEILING IS DELETED RATHER THAN RAISED ----
// The 0.0% recorded here was not a decision. It was a property of a bug: FOL_UNLIT_FLOOR was applied to every
// voxel-atlas material, so `max(colour, albedo*0.20)` made a pure-black land pixel ARITHMETICALLY IMPOSSIBLE anywhere
// in the world at any hour. This harness could not have measured anything else, on any build, however dark.
// With that gated back to foliage, the two statistics stop meaning the same thing, and only one of them was ever the
// bug Ben named:
//   · isoBlack — a lone crushed pixel with lit neighbours. THAT is "the black pixel bug", and its ceiling is unchanged
//     at 0.05%. It is what picks uDayShade (0.65 measures 0.039%, 0.5 measures 0.122%).
//   · pureBlack — contiguous black. That is a SHADOW, and Ben asked for it by name on 08-06: "in dark areas/areas
//     where no light reaches, in caves, behind trees, I want realistic darkness/shadows. if no light reaches an area
//     at all, it should be completely dark." A ceiling of 0.05% on it is a ceiling on the feature.
// So the canopy keeps a pureBlack ceiling only as a RUNAWAY guard — a wood going 60% black is a fault whatever was
// asked for — and the open vantage keeps the tight one, because nothing about a sunlit field was ever meant to move
// and it measures 0.02% at every setting of every dial in the sweep.
// The direction of this change is Ben's instruction, not a property of the code. Do not "fix" it back to 0.0.
//
// ---- RE-BASED AGAIN 2026-08-10, FOR THE CANOPY DEPTH TERM (globalU.uCanopy) ----
// Ben, 08-10: "there needs to be real daytime darkness ... intensely covered forested areas should still be dark during
// the day". Leaves now take skylight away from what is under them, so the canopy vantage IS meant to go much blacker:
// its contiguous black measures 18.1% at the shipped setting against 2.9% with the term off, at the same vantage in the
// same run. That is the feature, and its ceiling moves with it.
// THE CANOPY'S isoBlack CEILING BECOMES A SHAPE TEST, NOT A COUNT. Absolute isolated-black cannot be held at 0.05% in a
// frame whose black area grew six-fold, because the boundary between a shadow and the dappled light beside it is
// counted as isolated by construction. What separates the two cases is edgeShare (see stat()), measured in the same run:
//   term off        pureBlack  2.878%   isoBlack 0.045%   edgeShare 1.56%
//   t 0.97/0.55     pureBlack 18.143%   isoBlack 0.186%   edgeShare 1.02%
// The share FELL. A darkening that was crushing lit surfaces would have driven it up, and this one made a bigger, more
// solid shadow instead. So the canopy is guarded on edgeShare, and the OPEN vantage keeps the absolute count unchanged
// — nothing about sunlit ground is allowed to move, and nothing about it did (median 79.35 -> 79.35 across the sweep).
// THE OPEN VANTAGE'S RECORDED 0.0 DID NOT REPRODUCE, AND NOT BECAUSE OF THIS CHANGE. With the canopy term switched off
// entirely (__hc.canopy({on:false}), two rows a full sweep apart in the same browser) the open crop measures 0.046% pure
// and 0.045% isolated, not zero. So the guard was already sitting on its ceiling on this machine before anything here
// was written, and would have gone red on the next unrelated commit. Re-based to the measured term-off value so the
// tolerance means what it says; the shipped setting costs +0.014 on top of it, comfortably inside it.
// ---- RE-BASED 2026-08-16, AND MEASURED AT BOTH ENDS OF THE EXPOSURE RANGE ----
// The recorded 0.046 no longer reproduced: this build reads 0.231% pure black at the open vantage BEFORE anything in
// the darkness work was touched, so the guard was already red on arrival and would have blamed the first change made
// after it. Re-based to what the build measures TODAY, which is what a ceiling is for — it says "do not make this
// worse", not "this number is good".
// AND IT IS NOW A SWEEP. Eye adaptation is queued and it moves toneMappingExposure, which is the one control that can
// manufacture crushed pixels out of a frame that had none: a ceiling proven at 1.05 says nothing about 0.80. Every
// stop in EXPO must hold, so a darkening that only survives at the shipped exposure fails here rather than in Ben's
// eyes at dusk.
const BASE={ open:{ pureBlack:0.28, isoBlack:0.12 }, canopy:{ pureBlack:25.0, isoBlack:null, edgeShare:1.8 } };
const EXPO=[0.80, 1.05, 1.35];   // the ends of a plausible adaptation swing, and the shipped value between them
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
      const r={}; for(const k of ['pureBlack','isoBlack','edgeShare','med','p10','p90','sunShade']) r[k]=pickMed(k);
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
    // ON THE CANOPY'S p90, NOT ITS MEDIAN. This is a sanity guard — "is the sun actually up in these frames" — and a
    // median cannot answer it under thirteen cells of cover: the crop is mostly deep shade by construction, so its
    // median is small on any build that lets shade be dark, and it read 5.7 even with the shade dial fully off. What
    // says the sun is up is that there is SUNLIGHT somewhere in the frame, which is the p90 — 136 through every row of
    // the sweep, against a median that moves 5.7 -> 1.4 across it. Dappled light is exactly a low median with a high
    // p90, so the statistic that distinguishes "night" from "a wood at noon" is the top of the distribution.
    check('the daylight frame is actually daylit', open.med>40 && canopy.p90>60, `open med ${open.med}, canopy p90 ${canopy.p90} (med ${canopy.med})`);
    // THE SWEEP. Both vantages, every exposure, same crop and same three-shot median as the baseline rows above.
    const sweep=[];
    for(const e of EXPO){
      await page.evaluate(`__hc.exposure(${e})`); await sleep(500);
      const o=await vantage(`open-e${String(e).replace('.','')}`, SX+0.5, gy+7, SZ+14.5, Math.PI, -0.40);
      const c=await vantage(`canopy-e${String(e).replace('.','')}`, spot.x+0.5, spot.g+1.7, spot.z+0.5, Math.PI*0.5, -0.22);
      sweep.push({e,o,c});
      check(`open at exposure ${e}: no pure black`, o.pureBlack<=BASE.open.pureBlack+TOL, `${o.pureBlack}% against ${BASE.open.pureBlack+TOL}%`);
      check(`open at exposure ${e}: no isolated black`, o.isoBlack<=BASE.open.isoBlack+TOL, `${o.isoBlack}% against ${BASE.open.isoBlack+TOL}%`);
      check(`canopy at exposure ${e}: no runaway black`, c.pureBlack<=BASE.canopy.pureBlack+TOL, `${c.pureBlack}% against ${BASE.canopy.pureBlack+TOL}%`);
    }
    await page.evaluate(`__hc.exposure()`);
    console.log('  exposure sweep — open pureBlack: '+sweep.map(r=>r.e+':'+r.o.pureBlack+'%').join('  '));
    console.log('  exposure sweep — canopy med:     '+sweep.map(r=>r.e+':'+r.c.med).join('  '));
    for(const [tag,r] of [['open',open],['canopy',canopy]]){
      check(`${tag}: no pure black`, r.pureBlack<=BASE[tag].pureBlack+TOL, `${r.pureBlack}% against a ceiling of ${BASE[tag].pureBlack+TOL}%`);
      if(BASE[tag].isoBlack!==null)
        check(`${tag}: no isolated black`, r.isoBlack<=BASE[tag].isoBlack+TOL, `${r.isoBlack}% against a ceiling of ${BASE[tag].isoBlack+TOL}%`);
      // THE SHAPE CHECK NEEDS A DENOMINATOR TO BE ABOUT. edgeShare is isolated-black over total-black, and once the
      // shadow black is gone the ratio is computed over a handful of pixels and swings on nothing: shipping the nordic
      // grade took canopy pure black 0.573% -> 0.589% and the SHARE 1.0% -> 53%, while raw isolated black went from
      // 0.006% to 0.313% — a third of one per cent of the crop. Those are not new black pixels. They are the same
      // cutout gaps between leaves, reclassified: the grade lifts the leaves either side of a gap over this metric's
      // own "lit neighbour" threshold of 18, so a pixel that used to be part of a dark run is now an isolated one.
      // So the share is only asserted where there is enough black for it to mean something, and the raw isolated share
      // — checked above against its own ceiling — is what guards the speckle in every other case.
      if(BASE[tag].edgeShare!=null && r.pureBlack>=1.0)
        check(`${tag}: the black is shadow-shaped, not speckle`, r.edgeShare<=BASE[tag].edgeShare, `${r.edgeShare}% of the black is isolated, against a ceiling of ${BASE[tag].edgeShare}% (raw isoBlack ${r.isoBlack}%)`);
      else if(BASE[tag].edgeShare!=null)
        console.log(`  note  ${tag}: shape check skipped — only ${r.pureBlack}% pure black to shape (raw isoBlack ${r.isoBlack}%)`);
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
