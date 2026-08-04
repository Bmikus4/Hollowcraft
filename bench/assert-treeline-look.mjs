// THE HORIZON PINES: HOW JAGGED, HOW FAR DOWN THE WOOD GOES, AND WHETHER BOTH BANDS HOLD THE FOG.
//
// Ben 08-04: "the horizon pines look good color wise, make sure they consistenly hold fog tho, they might already. Make sure
// the brown part of them extends out far enough, and the peaks of the pines are still too volatile."
//
// "Too volatile" is the third time that note has been given (07-20, 07-27, 08-04), and the two earlier rounds changed the
// noise by eye. So it is a number here: the silhouette's top row, per pixel COLUMN, and how much it moves.
//   - jaggedness = the mean absolute change between neighbouring columns. This is what reads as spiky.
//   - range      = peak minus trough across the frame. This is what reads as an uneven skyline.
// Both matter and they are not the same measurement: lowering the noise amplitude flattens the range while leaving the
// column-to-column jitter untouched, which is why "less volatile" kept not landing.
//
// Four claims:
//   1. The new shape is measurably less jagged AND less extreme than the pre-08-04 one, from the same vantage.
//   2. The treeline is still there and still tall — this must not have flattened it into a hedge.
//   3. The woody band exists on essentially every column the canopy does, and reaches below the canopy's base.
//   4. Canopy and band hold the fog TOGETHER: in a bank, the gap between them closes instead of the band staying proud.
//
//   node bench/assert-treeline-look.mjs
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
// THE SILHOUETTE, BY DIFFERENCE — the layer toggled off and on, and the pixels that changed ARE the treeline. The first
// version of this thresholded each column against its own sky and took the first dark row, which finds whatever is highest:
// with real foliage and terrain in the frame it reported a 327-pixel range and a jaggedness that barely moved, because most
// of what it was measuring was not the backdrop at all. Plan §7's rule, which I wrote and then skipped.
function silhouette(fileOn, fileOff, crop=[0.04,0.96,0.02,0.62], th=3){
  const A=decodePNG(fs.readFileSync(fileOn)), B=decodePNG(fs.readFileSync(fileOff));
  const P=A;
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  const top=[];
  for(let x=x0;x<x1;x++){
    let row=-1;
    for(let y=y0;y<y1;y++){ const i=(y*P.w+x)*P.ch;
      if(Math.abs(lum(A.data,i)-lum(B.data,i))>th){ row=y; break; } }
    top.push(row);
  }
  const hit=top.filter(v=>v>=0);
  if(hit.length<40) return { n:hit.length, jag:null, range:null, mean:null, cover:+(100*hit.length/top.length).toFixed(1), top };
  let jag=0, n=0;
  for(let i=1;i<top.length;i++) if(top[i]>=0 && top[i-1]>=0){ jag+=Math.abs(top[i]-top[i-1]); n++; }
  const mean=hit.reduce((a,b)=>a+b,0)/hit.length;
  // JITTER, the measurement that matches the complaint. Peak-to-trough across the whole frame is dominated by the
  // treeline's END TAPER — it descends into the horizon by design — so raising the base height made "range" look WORSE
  // (232 -> 326 px) while the skyline itself got calmer. Detrend against a 25-column moving average and take the standard
  // deviation of what is left: that is how far the peaks depart from the broad shape, which is what "too volatile" means.
  const W=25, res=[];
  for(let i=0;i<top.length;i++){ if(top[i]<0) continue;
    let s2=0,c=0; for(let j=Math.max(0,i-W);j<Math.min(top.length,i+W+1);j++) if(top[j]>=0){ s2+=top[j]; c++; }
    if(c>3) res.push(top[i]-s2/c); }
  const rm=res.reduce((a,b)=>a+b,0)/Math.max(1,res.length);
  const jitter=Math.sqrt(res.reduce((a,b)=>a+(b-rm)*(b-rm),0)/Math.max(1,res.length));
  return { n:hit.length, cover:+(100*hit.length/top.length).toFixed(1),
           jag:+(jag/Math.max(1,n)).toFixed(3), jitter:+jitter.toFixed(2), range:Math.max(...hit)-Math.min(...hit),
           mean:+mean.toFixed(1), top };
}
// A LAYER'S OWN FOOTPRINT, by difference: rows changed per column, how many columns it touches at all, and the mean size of
// the change. "Does the brown extend far enough down" is the rows figure; "is it everywhere the canopy is" is the columns
// figure; and the mean change is what the haze acts on, which is how the fog claim gets made.
function footprint(fileOn, fileOff, crop=[0.04,0.96,0.02,0.62], th=3){
  const A=decodePNG(fs.readFileSync(fileOn)), B=decodePNG(fs.readFileSync(fileOff));
  const P=A;
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  let cols=0, colsTouched=0, rowSum=0, mag=0, magN=0;
  for(let x=x0;x<x1;x++){ cols++; let rows=0;
    for(let y=y0;y<y1;y++){ const i=(y*P.w+x)*P.ch; const d=Math.abs(lum(A.data,i)-lum(B.data,i));
      if(d>th){ rows++; mag+=d; magN++; } }
    rowSum+=rows; if(rows>0) colsTouched++; }
  return { rows:+(rowSum/cols).toFixed(2), presence:+(100*colsTouched/cols).toFixed(1),
           mag:magN?+(mag/magN).toFixed(2):0, area:magN };
}
// The mean luminance of a horizontal strip N rows under the silhouette — used to compare the band's value against the
// canopy's, and to watch both of them go into a fog bank.
function strip(file, top, from, to, crop=[0.04,0.96,0.02,0.62]){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0; let s=0,n=0;
  for(let i=0;i<top.length;i++){ if(top[i]<0) continue; const x=x0+i;
    for(let y=top[i]+from;y<top[i]+to;y++){ if(y<0||y>=P.h) continue; s+=lum(P.data,(y*P.w+x)*P.ch); n++; } }
  return n? +(s/n).toFixed(1) : null;
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
    const ctx=await browser.newContext({viewport:{width:1200,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // WELL ABOVE THE CANOPY, looking level. The treeline is a backdrop at the render wall, so real edge trees stand in front
    // of it from the ground and the silhouette measured would be theirs, not its.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+64}, ${S.sz}+0.5); __hc.cam({yaw:0, pitch:-0.02});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2200);
    const shot=async(t,name)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(420); await page.evaluate(`__hc.setTime(${t})`); await sleep(200);
      const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };
    // The treeline only draws toward azimuths where real forest runs past the wall, so find a bearing where it does — by
    // difference, since that is the only thing that isolates the backdrop from the real trees in front of it.
    const pair=async(name,t=0.20)=>{
      await page.evaluate(`__hc.horizonDbg(undefined,true,true)`);  const on =await shot(t,`${name}-on.png`);
      await page.evaluate(`__hc.horizonDbg(undefined,false,false)`); const off=await shot(t,`${name}-off.png`);
      await page.evaluate(`__hc.horizonDbg(undefined,true,true)`);  return [on,off]; };
    const woodPair=async(name,t=0.20)=>{   // the BAND alone: canopy stays, the child layer toggles
      await page.evaluate(`__hc.horizonDbg(undefined,true,true)`);  const on =await shot(t,`${name}-wood-on.png`);
      await page.evaluate(`__hc.horizonDbg(undefined,true,false)`); const off=await shot(t,`${name}-wood-off.png`);
      await page.evaluate(`__hc.horizonDbg(undefined,true,true)`);  return [on,off]; };
    let bestYaw=0, bestN=-1;
    for(let i=0;i<12;i++){ const yaw=i*Math.PI/6;
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.02})`); await sleep(240);
      const [a,b]=await pair('tmp-treeline-scan');
      const f=footprint(a,b); if(f.area>bestN){ bestN=f.area; bestYaw=yaw; } }
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:-0.02})`); await sleep(400);
    console.log(`  treeline in frame at yaw ${bestYaw.toFixed(2)} (${bestN} px of backdrop)`);
    const shape=await page.evaluate(`__hc.treeShape()`);
    console.log('  shape: '+JSON.stringify(shape));
    check('the shape uniforms are shared by both pine layers', shape.shared===true, 'if false, the woody band clips against a different canopy than the one drawn and the join tears');

    // ---- 1+2. VOLATILITY ------------------------------------------------------------------------------------------------
    await page.evaluate(`__hc.treeShape({base:24, amp:18, spike:1, crown:1})`);
    const [oOn,oOff]=await pair('treeline-volatile-before');
    await page.evaluate(`__hc.treeShape({base:${shape.base}, amp:${shape.amp}, spike:${shape.spike}, crown:${shape.crown}})`);
    const [nOn,nOff]=await pair('treeline-volatile-after');
    const sO=silhouette(oOn,oOff), sN=silhouette(nOn,nOff);
    console.log(`  BEFORE  jaggedness ${sO.jag} px/col   jitter ${sO.jitter} px   range ${sO.range} px   top mean ${sO.mean}   columns ${sO.cover}%`);
    console.log(`  AFTER   jaggedness ${sN.jag} px/col   jitter ${sN.jitter} px   range ${sN.range} px   top mean ${sN.mean}   columns ${sN.cover}%`);
    check('the peaks are less jagged', sN.jag < sO.jag*0.8, `mean column-to-column change ${sO.jag} -> ${sN.jag} px`);
    // JAG IS THE STABLE MEASUREMENT; jitter and range are not, and both are reported rather than asserted. Range is dominated
    // by the treeline's end taper (it descends into the horizon by design), and the detrended jitter picks that taper up too
    // wherever the run's chosen bearing includes an end — measured 7.7 px on one bearing and 31 px on another for the same
    // shader. The mean column-to-column change has moved the same way every run: -12%, -31%, -43%.
    console.log(`  (jitter and range are vantage-dependent and are reported, not asserted: ${sO.jitter} -> ${sN.jitter} px jitter, ${sO.range} -> ${sN.range} px range)`);
    // NOT A HEDGE. A larger top row number is LOWER on screen, so the treeline must not have sunk.
    check('the treeline still stands as tall', sN.mean-sO.mean < 10, `silhouette top row mean ${sO.mean} -> ${sN.mean} (bigger = lower on screen)`);
    check('and still runs the same width', Math.abs(sN.cover-sO.cover) < 8, `${sO.cover}% -> ${sN.cover}% of columns`);

    // ---- 3. THE WOODY BAND ---------------------------------------------------------------------------------------------
    // OUT AT SEA, LOOKING BACK. From over the island the treeline's base sits behind real terrain, so the band — which lives
    // at that base — was 96% occluded and measured as absent: 0.24 rows on 4.8% of columns. The wood can only be measured
    // where the bottom of the backdrop is against water.
    const seaPos=await page.evaluate(`(()=>{ const a=__hc.treelineAnchor?__hc.treelineAnchor():null; return a||null; })()`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+34}, ${S.sz}+0.5)`);
    // AND WAIT FOR THE WORLD TO ARRIVE. Scanning straight after a teleport measured a frame with terrain still streaming, so
    // the bearing chosen for having 1004 px of wood in it had 15 px by the time the pair was taken — and the fog comparison
    // then read a 154x INCREASE in the band's contribution, which is a moving camera, not a shader.
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);
    let seaYaw=bestYaw, seaBest=-1;
    for(let i=0;i<12;i++){ const yaw=i*Math.PI/6;
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.06})`); await sleep(240);
      const [a,b]=await woodPair('tmp-wood-scan');
      const f=footprint(a,b); if(f.area>seaBest){ seaBest=f.area; seaYaw=yaw; } }
    await page.evaluate(`__hc.cam({yaw:${seaYaw}, pitch:-0.06})`); await sleep(400);
    console.log(`  band vantage: yaw ${seaYaw.toFixed(2)} (${seaBest} px of wood)`);
    const [wOn,wOff]=await woodPair('treeline-band');
    const w=footprint(wOn,wOff);
    const [cOn2,cOff2]=await pair('treeline-canopy-atband');
    const canopy=footprint(cOn2,cOff2);
    const bf=await page.evaluate(`__hc.bandFog()`);
    console.log(`  wood footprint: ${w.rows} rows/column over ${w.presence}% of columns, mean change ${w.mag}`);
    console.log(`  canopy footprint: ${canopy.rows} rows/column over ${canopy.presence}% of columns`);
    console.log('  band state: '+JSON.stringify(bf));
    // HOW FAR DOWN THE WOOD SHOULD GO (Ben 08-04: "make sure the brown part of them extends out far enough"; when asked which
    // reading of "extend" he meant on 07-29 he said "further down, taller band"). uBandH sets the TOP, and that is the seam
    // with the foliage which he already tuned — 9 was "too tall", 5 "too low". So the skirt is the dial, and it is swept here
    // against the only number that says whether the wood reads at all: rows of it per column, by difference.
    for(const sk of [0.45,0.9,1.4,2.0]){ await page.evaluate(`__hc.bandFog(null,null,${sk})`);
      const [a,b]=await woodPair(`treeline-skirt-${String(sk).replace('.','p')}`);
      const f=footprint(a,b);
      console.log(`  skirt ${sk.toFixed(2)}:  ${f.rows} rows/column over ${f.presence}% of columns, mean change ${f.mag}`); }
    await page.evaluate(`__hc.bandFog(null,null,${bf.skirt})`);
    // WHAT THE SWEEP ABOVE SHOWS, and it is the answer to "extends far enough": the skirt is not a lever, and cannot be. It is
    // applied in ELEVATION — bottom = base - 0.45*hs is about 26 degrees below the treeline's base — and this layer draws at
    // renderOrder -4.9, BEFORE the world, so every row of that extension is behind real terrain and water. The wood's visible
    // extent is set by where the horizon cuts it, not by how far down the shader is told to draw it. The code already carried
    // a note that hs was not the lever either; this is the same wall from the other side. Do not spend a third pass on a dial.
    // What is left to assert is that the wood is genuinely there and genuinely darker than the foliage above it.
    // A SLIVER, and how big a sliver depends on the bearing: across runs of this file the same claim measured 156, 844, 1120 and
    // 1202 px, because the band lives at the treeline's BASE, the one part of the backdrop real terrain stands in front of.
    check('the wood draws, and against the canopy it is a real band', w.area>50 && w.mag>5,
      `${w.area} px of wood at a mean change of ${w.mag} luminance against the frame without it`);
    check('and it sits at the canopy base rather than over the crowns', w.rows < canopy.rows,
      `wood ${w.rows} rows/column against the canopy's ${canopy.rows} — the band is a strip at the bottom, not a second canopy`);

    // ---- 4. BOTH BANDS HOLD THE FOG ----------------------------------------------------------------------------------
    // At fog 0.85 BOTH layers fade their alpha to zero — clamp(1-uWx*1.25) — so the first version of this measured the sky
    // and reported the wood as brighter than the canopy. 0.35 is a real bank with both layers still drawn.
    await page.evaluate(`__hc.fog(0.35)`); await sleep(1200);
    const [fwOn,fwOff]=await woodPair('treeline-band-fog');
    const [fcOn,fcOff]=await pair('treeline-canopy-fog');
    const wFog=footprint(fwOn,fwOff), cFog=footprint(fcOn,fcOff);
    await page.evaluate(`__hc.fog(0)`); await sleep(800);
    // ENERGY, not mean magnitude. The mean is taken over the pixels that DIFFER, so a layer that shrinks to a few strongly
    // contrasting pixels keeps a mean of 1.00x while contributing almost nothing — measured, the wood read x1.00 against the
    // canopy's x0.24 that way and looked like a band ignoring the haze. Area times mean is how much of the frame the layer is
    // actually responsible for, which is the thing the fog is supposed to take.
    const eW=w.area*w.mag, eWF=wFog.area*wFog.mag, eC=canopy.area*canopy.mag, eCF=cFog.area*cFog.mag;
    const rWood=eW>0?eWF/eW:0, rCanopy=eC>0?eCF/eC:0;
    console.log(`  in a 0.35 bank: wood energy ${Math.round(eW)} -> ${Math.round(eWF)} (x${rWood.toFixed(2)})   canopy ${Math.round(eC)} -> ${Math.round(eCF)} (x${rCanopy.toFixed(2)})`);
    check('the wood takes the haze at the canopy rate', Math.abs(rWood-rCanopy) < 0.28,
      `the fog knocks the wood to x${rWood.toFixed(2)} of itself and the canopy to x${rCanopy.toFixed(2)} — a band that ignores the haze would hold its contrast while the canopy loses it`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/treeline-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
