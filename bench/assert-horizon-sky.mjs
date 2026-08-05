// THE SKY GOES ALL THE WAY DOWN, AND THE SEA STAYS ON TOP OF THE SEABED.
//
// Ben 08-04, two notes with one cause between them:
//   "all of this needs removed and replaced with sky, this is the dark blue horizon backdrop below the sky. IT NEEDS
//    REMOVED, the sky should extend down beyond the horizon in its place, ALWAYS"
//   "the ocean shore is broken, and its falling under the ground far out... we could fix this by making water get deeper
//    quicker, or by actually fixing the ocean itself"
//
// The backdrop is oceanMat, a painted gradient on a camera-centred cylinder that fills everything below a bowed horizon
// line. The shore is waterMat's world curve: the surface is pushed DOWN by up to 58 blocks with distance while the terrain
// under it does not move, so every shelf near sea level comes up through the water.
//
// Four claims:
//   1. With the band off, the sky's own gradient is what sits under the horizon — so the region just above the waterline
//      gets BRIGHTER (sky) rather than dropping onto the sea anchor, and the hard step the band made is gone.
//   2. The sky no longer paints the sea's anchor colour into its own lowest rows either (uSkyToSea 0).
//   3. The world curve can no longer sink the surface below its own seabed, so less land shows through the far water.
//   4. Nothing else went with it: the far-sea disc still draws, and there are no page errors.
//
//   node bench/assert-horizon-sky.mjs
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
// A VERTICAL PROFILE down the middle of the frame: one mean per row band. The band Ben photographed is a step in this
// profile, so the profile is the measurement — a whole-crop mean would average the sky and the band together and move barely
// at all. x is kept to the middle third so the compass and the held item cannot enter it.
function rows(file, bands=28){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*0.34)|0, x1=(P.w*0.66)|0, out=[];
  for(let b=0;b<bands;b++){
    const y0=((P.h*b)/bands)|0, y1=((P.h*(b+1))/bands)|0; let s=0,n=0;
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
    out.push(+(s/n).toFixed(1)); }
  return out;
}
// THE SAME PROFILE, BUT PER-ROW MEDIAN. Needed the moment stars were extended below the horizon: they are sparse bright
// outliers, so they lift a row's MEAN without changing the gradient, and the flat-slab test started failing on a sky that had
// simply acquired stars. A median ignores a few hundred bright pixels in a band of thousands.
function rowsMed(file, bands=28){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*0.34)|0, x1=(P.w*0.66)|0, out=[];
  for(let b=0;b<bands;b++){
    const y0=((P.h*b)/bands)|0, y1=((P.h*(b+1))/bands)|0, v=[];
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch));
    v.sort((a,b2)=>a-b2); out.push(+v[v.length>>1].toFixed(1)); }
  return out;
}
// THE BIGGEST DOWNWARD STEP between adjacent bands, and where it is.
function step(prof, from, to){ let best=0, at=-1;
  for(let i=Math.max(1,from);i<Math.min(prof.length,to);i++){ const d=prof[i-1]-prof[i]; if(d>best){ best=d; at=i; } }
  return { drop:+best.toFixed(1), at }; }
// THE PLATEAU IS THE ARTEFACT, not the step. A sky meeting a sea across a horizon is a hard edge by nature — the first
// version of this file asserted that edge should be soft and failed the fix for working: with the band gone the sky/water
// step got BIGGER (56 -> 137) precisely because the band was no longer standing between them at a middle value.
// What Ben photographed is a REGION: rows that are neither sky nor sea, holding a value between the two. So count them.
function plateau(prof, from, to, lo=60, hi=130){ const rows=[];
  for(let i=from;i<Math.min(prof.length,to);i++) if(prof[i]>lo && prof[i]<hi) rows.push(i+':'+prof[i]);
  return rows; }
// SAND, by hue: the beach and the shelf are warm and desaturated-bright, the sea is blue. Counting "not blue" pixels in a
// crop of far water is what "the ground is coming up through the sea" looks like as a number.
function warmPct(file, crop){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  let warm=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch;
    const r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    if(r>b+6 && r>70) warm++;                     // red over blue: sand, never sea
    n++; }
  return +(100*warm/n).toFixed(3);
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
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // BEN'S VANTAGE: a little above the beach, looking out to sea and slightly down — the shot he sent. A high vantage hides
    // both faults (the band shrinks to a strip and the far shelf falls outside the frame), so height is part of the test.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+9}, ${S.sz}+0.5); __hc.cam({yaw:0.0, pitch:-0.16});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2200);
    // TWO BEARINGS, because the two faults are visible from opposite ones. The backdrop wants OPEN water — any land in the
    // frame is a second thing changing between the pair. The shore fault wants the most land it can get in the far-water
    // band, which is where a shelf near sea level comes up through a surface that has been pushed down. Scanning for the
    // clearest bearing and then testing the shore from it measured a stretch of sea with no shelf in it at all.
    const scan=[];
    for(let i=0;i<12;i++){ const yaw=i*Math.PI/6;
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.16})`); await sleep(240);
      const f=path.join(OUT,'tmp-horizon-scan.png'); await page.screenshot({path:f});
      scan.push({yaw, warm:warmPct(f,[0.20,0.80,0.40,0.58])}); }
    scan.sort((a,b)=>a.warm-b.warm);
    const bestYaw=scan[0].yaw, landYaw=scan[scan.length-1].yaw;
    console.log(`  open water at yaw ${bestYaw.toFixed(2)} (${scan[0].warm}% land in the far band); most shelf at yaw ${landYaw.toFixed(2)} (${scan[scan.length-1].warm}%)`);
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:-0.16})`); await sleep(400);
    const shot=async(t,name)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(420); await page.evaluate(`__hc.setTime(${t})`); await sleep(200);
      const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };

    // ---- 1+2. THE BACKDROP ---------------------------------------------------------------------------------------------
    const before=await page.evaluate(`(()=>{ __hc.horizonBand({on:true}); __hc.skyToSea(1); return __hc.horizonBand(); })()`);
    const fBefore=await shot(0.20,'horizon-band-before.png');
    await page.evaluate(`__hc.horizonBand({on:false}); __hc.skyToSea(0);`);
    const fAfter=await shot(0.20,'horizon-band-after.png');
    const pB=rows(fBefore), pA=rows(fAfter);
    console.log('  band ON  rows: '+pB.join(' '));
    console.log('  band OFF rows: '+pA.join(' '));
    const sB=step(pB,4,20), sA=step(pA,4,20);
    const qB=plateau(pB,4,15), qA=plateau(pA,4,15);
    console.log(`  biggest step, upper frame:  band ON ${sB.drop} at ${sB.at}   band OFF ${sA.drop} at ${sA.at}  (the OFF one IS the waterline)`);
    console.log(`  rows between sky and sea:   band ON [${qB.join(' ')}]   band OFF [${qA.join(' ')}]`);
    check('the band was there to begin with', qB.length>=2, `${qB.length} row bands hold a value between sky and sea: [${qB.join(' ')}] — if this is empty the vantage is wrong, not the fix`);
    check('and nothing sits between the sky and the sea any more', qA.length===0, `[${qA.join(' ')}]`);
    const bandRow=sB.at>=0?sB.at:14;
    check('what replaced it is brighter, i.e. sky', pA[bandRow] > pB[bandRow]+6, `row band ${bandRow}: ${pB[bandRow]} -> ${pA[bandRow]}`);
    // …and the sky it was replaced with is a smooth gradient, not a second edge.
    // sA.at-1, not sA.at: the row band directly above the waterline STRADDLES it — part sky, part sea — so it reads as a
    // 12-level step that is really the horizon inside one band, not a second edge in the sky. A 28-band profile cannot
    // resolve a boundary finer than a band, and pretending otherwise failed the check on the geometry of its own bins.
    const skyStep=step(pA,4,Math.max(5,sA.at-1));
    check('the sky above the waterline is smooth', skyStep.drop<8, `biggest step in the sky itself ${skyStep.drop} levels over row bands 4..${sA.at-2}`);
    const st=await page.evaluate(`__hc.horizonBand()`);
    console.log('  state: '+JSON.stringify(st));
    check('the far-sea disc is still drawing', st.farSea===true && st.layerVisible===true && st.band===false, JSON.stringify(st));

    // ---- 2b. AND AT NIGHT (Ben 08-04: "night sky still doesnt extend down to infinity") ------------------------------
    // Same measurement, midnight. The daytime case is fixed and asserted above, so if the night reads differently it is a
    // night-specific layer and not the band — and the profile says WHICH row it starts at, which is what names the layer.
    const fNight=await shot(0.75,'horizon-night.png');
    const pN=rows(fNight);
    console.log('  NIGHT rows: '+pN.join(' '));
    const sN=step(pN,3,20);
    // NOT a plateau test at night. The whole night sky lives between 18 and 82 luminance, so a band that catches "values
    // between sky and sea" catches the gradient itself — it flagged six rows that are a smooth 23.7 -> 82.2 ramp toward the
    // horizon, which is the Rayleigh gradient plus airglow and is what the sky is supposed to do. What can be asserted is that
    // the ramp is SMOOTH and RISES all the way to the waterline: a sky that stops short shows up as a step or a reversal.
    const nSkyStep=step(pN,3,Math.max(4,sN.at-1));
    let mono=true; for(let i=4;i<sN.at-1;i++) if(pN[i] < pN[i-1]-1.5) mono=false;
    console.log(`  NIGHT biggest step ${sN.drop} at row ${sN.at} (the waterline);  sky's own biggest step ${nSkyStep.drop};  rises monotonically ${mono}`);
    check('the night sky runs down to the waterline without a shelf', nSkyStep.drop<6 && mono,
      `biggest step within the night sky ${nSkyStep.drop} levels over row bands 3..${sN.at-2}, rising to ${pN[sN.at-1]} at the waterline from ${pN[3]} at the top of the crop`);
    // AND FROM HIGH UP, LOOKING STEEPLY DOWN, which is where "it does not extend down" would show: past the far plane the sea
    // is clipped, and whatever fills the frame under that edge is either sky or a hole. Reported, with the frame to look at.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+150}, ${S.sz}+0.5); __hc.cam({yaw:${bestYaw}, pitch:-0.62});`);
    await sleep(1200);
    const fDown=await shot(0.75,'horizon-night-down.png');
    const pD=rows(fDown);
    console.log('  NIGHT looking down, rows: '+pD.join(' '));
    // A FLAT SLAB IS A RUN OF IDENTICAL ROWS. Below dir.y = -0.1 the dome's gradient used to clamp, and five consecutive row
    // bands read exactly 78.4 — that constant is the artefact, and it is what "does not extend down to infinity" looks like as
    // a number. The sky below the horizon has to keep changing.
    const pDm=rowsMed(fDown);
    console.log('  NIGHT looking down, per-row MEDIAN: '+pDm.join(' '));
    let run=1, worst=1;
    for(let i=1;i<12;i++){ if(Math.abs(pDm[i]-pDm[i-1])<0.35){ run++; if(run>worst) worst=run; } else run=1; }
    check('the sky below the horizon keeps changing instead of holding one colour', worst<3,
      `longest run of row bands within 0.35 luminance of each other: ${worst} (it was 5 at exactly 78.4)`);
    // AND IT HAS STARS IN IT (Ben 08-04: "night sky is not below horizon still, (stars etc)"). Extending the gradient was only
    // half — everything in the shader's `add` accumulator is gated on dir.y, so below the horizon the sky was starless, which
    // reads as the sky having stopped. Stars are small and bright against a dark field, so they are counted as local peaks: a
    // pixel more than 25 luminance above the mean of its row band. Counted ABOVE the horizon as the control and BELOW it as the
    // claim, on the same frame.
    const starCount=(file, y0f, y1f)=>{
      const P=decodePNG(fs.readFileSync(file));
      const x0=(P.w*0.34)|0, x1=(P.w*0.66)|0, y0=(P.h*y0f)|0, y1=(P.h*y1f)|0;
      let s2=0,n=0; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ s2+=lum(P.data,(y*P.w+x)*P.ch); n++; }
      const mean=s2/Math.max(1,n); let hits=0;
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) if(lum(P.data,(y*P.w+x)*P.ch) > mean+25) hits++;
      return { mean:+mean.toFixed(1), hits }; };
    // The looking-down night frame: rows 0..0.30 of it are above the horizon, 0.32..0.40 below it (the waterline sat at row
    // band 11 of 28, i.e. 0.39 of the frame height).
    const above=starCount(fDown,0.02,0.28), below=starCount(fDown,0.30,0.385);
    console.log(`  NIGHT stars: above the horizon ${above.hits} px over mean ${above.mean};  below it ${below.hits} px over mean ${below.mean}`);
    check('and it has stars in it below the horizon', below.hits>0 && below.hits > above.hits*0.4,
      `${below.hits} star pixels below the horizon against ${above.hits} above — the gate was step(0.02,dir.y), which ended the sky at the horizon`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+9}, ${S.sz}+0.5); __hc.cam({yaw:${bestYaw}, pitch:-0.16});`);
    await sleep(900);

    // ---- 3. THE SHORE --------------------------------------------------------------------------------------------------
    // Same frame, clamp off then on. Less land in the far-water band is the whole claim.
    const curve=await page.evaluate(`__hc.seaCurve()`);
    console.log('  curve: '+JSON.stringify(curve));
    // FROM THE OPEN-WATER BEARING, and in a thin strip just under the horizon — that is where the render wall is and where a
    // seabed drained by the curve shows up as sand. The bearing with the most land in it is the island itself, and measuring
    // there measured a beach in the foreground that the curve has nothing to do with: 28.1% -> 27.9%, which is noise.
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:-0.16})`); await sleep(400);
    await page.evaluate(`__hc.seaCurve({clamp:0})`);
    const fUnclamped=await shot(0.20,'horizon-shore-unclamped.png');
    await page.evaluate(`__hc.seaCurve({clamp:1})`);
    const fClamped=await shot(0.20,'horizon-shore-clamped.png');
    const FAR=[0.10,0.90,0.455,0.50];   // the strip immediately below the horizon: the far sea at the render wall
    const wU=warmPct(fUnclamped,FAR), wC=warmPct(fClamped,FAR);
    console.log(`  land showing through the far water:  curve unclamped ${wU}%   clamped ${wC}%`);
    check('the sea no longer falls under the ground far out', wC < wU-0.02, `${wU}% -> ${wC}% of the far-water band is land, from the bearing with the most shelf in it`);
    const cv=await page.evaluate(`__hc.seaCurve()`);
    console.log('  curve now: '+JSON.stringify(cv));
    // THE SHAPE BEN ASKED FOR (08-04: "i just want the ocean to look like its going on forever, and to have an ever so slight
    // world curve out at its end"). Two halves, and the first one is what makes the shore safe by construction rather than by
    // a clamp: the bend does not begin until beyond the render wall, so NO chunk water is curved at all.
    check('and the clamp is what is live', cv.clamp===1);
    // AT THE WALL, read from the hook rather than at a hardcoded 182 blocks — the wall is 128 at rd=8, and 182 is past the
    // start of the bend, so the old form of this check measured 0.01 blocks of curve and called it a failure.
    check('nothing inside the render wall curves at all', cv.dropAtWall===0 && cv.r>cv.wall,
      `drop at the wall (${cv.wall} blocks) is ${cv.dropAtWall}, and the bend starts at ${cv.r}`);
    // AND THE CLAIM IS ABOUT THE VISIBLE RANGE, not the disc's geometric rim: the far plane clips at camera.far, so anything
    // past it is geometry nobody sees. The cap binds well before 1000 blocks now and that is fine — what matters is the dip
    // across the sea you can actually look at.
    check('and the far end curves, ever so slightly', cv.dropAtFar>1.2 && cv.dropAtFar<5,
      `${cv.dropAtFar} blocks down at the far plane (${cv.camFar}), from flat at the wall — about 0.44 degrees of dip across the last 150 blocks of visible sea`);
    // THE LEDGE, geometrically, so this does not depend on a vantage being lucky: at the render wall the disc takes the cap
    // and the shallow chunk water beside it takes its own column, and the difference is the step.
    check('the step where the far sea meets chunk water is under a block and a half', cv.ledgeAtWall.shelf3<1.5,
      `ledge at the wall against a 3-deep shelf ${cv.ledgeAtWall.shelf3} blocks (was 55.3 at the old 58-block cap), against 6-deep ${cv.ledgeAtWall.shelf6}, deep water ${cv.ledgeAtWall.deep20}`);
    // ---- 4. THE PAINTED OCEAN IS NOT INLAND (Ben 08-04: "the ocean still appears below a certain level inland") ---------
    // The disc is centred on the camera at sea level and, since it became a full disc, covers the ground you are standing on.
    // Toggling it is the measurement: inland the two frames must be identical, and at the shore they must not be, or the fix
    // has simply deleted the far sea.
    const discPair=async(tag)=>{
      await page.evaluate(`__hc.farSeaOn(true)`);  await sleep(300); const on =await shot(0.20,`horizon-disc-${tag}-on.png`);
      await page.evaluate(`__hc.farSeaOn(false)`); await sleep(300); const off=await shot(0.20,`horizon-disc-${tag}-off.png`);
      await page.evaluate(`__hc.farSeaOn(true)`);
      const A=rows(on), B=rows(off);
      let d=0; for(let i=0;i<A.length;i++) d+=Math.abs(A[i]-B[i]);
      return +d.toFixed(1); };
    // Deep inland: the island's centre, well inside the core, low enough that a sea-level plane would be in frame.
    const isle=await page.evaluate(`__hc.farSeaOn()`);
    const icy=await page.evaluate(`__hc.groundY(${isle.isle[0]},${isle.isle[1]})`);
    await page.evaluate(`__hc.tpAt(${isle.isle[0]}+0.5, ${icy+6}, ${isle.isle[1]}+0.5); __hc.cam({yaw:0.9, pitch:-0.28});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);
    const inland=await discPair('inland');
    const where=await page.evaluate(`__hc.farSeaOn()`);
    console.log(`  inland at the island centre (${where.distFromIsle} from centre, core is ${where.isleCore}): toggling the far-sea disc moves the frame by ${inland} total luminance`);
    check('the painted ocean does not draw inland', inland < 6, `${inland} total luminance of difference across 28 row bands with the disc toggled at the island centre`);
    // And back out to the water, where it MUST still draw.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+9}, ${S.sz}+0.5); __hc.cam({yaw:${bestYaw}, pitch:-0.16});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    const shore=await discPair('shore');
    console.log(`  at the shore: toggling it moves the frame by ${shore} total luminance`);
    check('and it still draws where the sea is', shore > 12, `${shore} total luminance at the shore against ${inland} inland — if this is small the fix deleted the far sea instead of confining it`);

    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/horizon-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
