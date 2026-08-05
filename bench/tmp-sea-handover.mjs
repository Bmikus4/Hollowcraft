// IS THERE A STEP WHERE THE CHUNK WATER HANDS OVER TO THE PAINTED DISC?
//
// The last open item on docs/BACKLOG.md: "Fog parity: far-sea disc vs chunk water, step at the render wall." `oceanMat` gained
// uWx (14d736f) and waterMat's ring landing targets fogTo, so the two agree in a fog BANK — what has never been measured is the
// handover itself. waterMat's uMeshR is (RENDER_DIST-1)*CK, so the real water stops there and the disc carries on beyond it.
//
// AND IT MATTERS MORE NOW: the night wash was just added to both shaders (6f9afd8). The two washes measured drops of 0.711 and
// 0.743 saturation, close but not identical, so this run doubles as a check that the wash did not open a seam of its own.
//
// HOW: scan a VERTICAL column of the frame from offshore, looking level out to sea, and take the row-to-row luminance difference.
// A smooth handover means the largest single-row jump near the wall is of the same order as its neighbours' jumps. A step means one
// row difference stands well clear of the local distribution. Reported as a ratio against the median row-jump in the same band, so
// it is scale-free — the sea's own vertical gradient does not need to be modelled, only exceeded.
//
// Both hours: night (the wash is on, and the wash is the new thing) and day (where the fog and the ring were tuned).
//
// RESULT, 2026-08-05 — THERE IS NO STEP AT THE RENDER WALL, AT EITHER HOUR. rd 8 puts chunk water's end at 112 blocks and the eye
// 8 above the sea, so the wall projects to row ~285 of 560 and the horizon to ~254 (74-degree vertical fov, 7.57 px/degree).
// With the band TIGHT on the wall (rows 275-300):
//   night  worst jump 1.00 at row 283, median jump 0.213, RATIO 4.7
//   day    worst jump 3.06 at row 282, median jump 0.787, RATIO 3.9
// The largest single jump is of the same order as its neighbours' — which is the definition of a smooth handover, and the worst row
// is the wall's own (282-283 against a predicted 285), so the measurement is looking at the right place. Unchanged with the night
// wash off (0.86 and 2.85), so the wash added in 6f9afd8 opened nothing here either. The backlog item is answered.
//
// AND A SEPARATE ARTEFACT THE WIDER BANDS TURNED UP, recorded because it is real and is NOT the handover: by day a 37.7-level edge
// sits at row 320, thirty-five rows below the wall, identical with the wash off (37.66), and the frame reads 0 below it against
// 38-40 at night. Looking down at the near water from eight blocks up, the DAYTIME surface crushes to pure black at a steep view
// angle with a hard edge; the only reason the night frame does not is the night-only in-scatter floor from 61fe516. Different item.
//
// THREE DEAD BANDS, so nobody re-derives them: 0.44-0.70 straddles the HORIZON and its sky/sea edge (58 night, 94 day, always row
// 271) swamps everything; 0.52-0.72 starts six rows BELOW the wall and misses it; 0.495-0.62 covers the wall but also the row-320
// day edge, which then reads as the maximum and hides the wall's own 3.06.
//
// RESULT 2, 2026-08-05 — THE OTHER RENDER DISTANCES AND THE FOG BANK, and one of them is a REAL SEAM.
//   rd 12 clear      night worst 1.0 (ratio 1.3), day 3.6 — no step
//   rd 8  clear      night 1.0-1.07 at rows 283-288, day 3.0-3.49 at row 282, on three repeats each — no step, and this reproduces
//                    the original rd-8 numbers exactly
//   rd 8 / 12 in a FOG BANK of 0.8   worst jump 0 to 1.07 at every hour, wash on and off — the bank flattens it and the two shaders
//                    agree in weather, which is the parity the backlog item asked about
//   rd 4  clear, DAY  **worst 41.31 levels at rows 315-329, on all three shots, wash ON and wash OFF** — the wall is predicted at row
//                    326, so that IS the handover. Night at rd 4 is clean (worst 1.0). uMeshR is max(24,(rd-1)*16) = 48 blocks at rd 4,
//                    and at 48 blocks the fog has not yet converged the disc's colour with chunk water's, where at 112 and 176 it has.
//                    So the seam is not a bug in either shader's colour, it is that the handover is close enough to be seen.
// THIS ALSO EXPLAINS THE OLD "37.7-level edge at row 320" NOTE, which was recorded as a daytime steep-view crush and blamed on the
// water shader: bench/tmp-daywater-black.mjs later found no such crush at any pitch. It is this seam, seen when the run's render
// distance was not what it thought — and `?rd` does not hold (see the readback guard below), so it can easily have been 4.
// RD 4 IS NOT HYPOTHETICAL: the adaptive ladder drops the render distance on a slow machine, which is exactly when a player sees this.
// NOT FIXED HERE. The fix is to converge the disc's colour with chunk water's over the first stretch past uMeshR, which is a change to
// a sea Ben has tuned repeatedly (the neon-horizon episode), and it needs his eye rather than an unattended commit.
//
// WHAT WAS STILL UNMEASURED, and is what this file now also runs: the handover at any render distance OTHER than 8, and the handover
// inside a fog BANK. Both matter for the same reason — the wall is at (rd-1)*16 blocks, so rd moves it to a different part of the fog
// curve entirely, and a bank is where the two shaders' fog terms (waterMat's fogTo blend and oceanMat's uWx) have to agree or the seam
// appears in weather and nowhere else.
//   HC_RD=4|8|12   the render distance to boot at (default 8). The band follows the PREDICTED wall row, so it is not the rd-8 band.
//   HC_FOG=0.8     force a fog bank of that strength AFTER pinScene, which zeroes weather.
//
//   node bench/tmp-sea-handover.mjs
//   HC_RD=12 HC_FOG=0.8 node bench/tmp-sea-handover.mjs
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
// per-row median across a wide horizontal strip (a median so a whitecap or a star cannot carry a row), then the row-to-row jumps
function rowProfile(file,x0f,x1f,y0f,y1f){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*x0f)|0,x1=(P.w*x1f)|0,y0=(P.h*y0f)|0,y1=(P.h*y1f)|0;
  const rows=[];
  for(let y=y0;y<y1;y++){ const v=[]; for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch)); v.sort((a,b)=>a-b); rows.push({y, med:v[v.length>>1]}); }
  const jumps=[]; for(let i=1;i<rows.length;i++) jumps.push({ y:rows[i].y, d:Math.abs(rows[i].med-rows[i-1].med) });
  const sorted=jumps.map(j=>j.d).sort((a,b)=>a-b);
  const medJump=sorted[sorted.length>>1]||0, p90=sorted[(sorted.length*0.9)|0]||0;
  let worst=jumps[0]||{y:0,d:0}; for(const j of jumps) if(j.d>worst.d) worst=j;
  return { rows:rows.length, medJump:+medJump.toFixed(3), p90Jump:+p90.toFixed(3),
           worst:+worst.d.toFixed(2), worstRow:worst.y, ratio:+(worst.d/Math.max(medJump,0.05)).toFixed(1),
           top:+rows[0].med.toFixed(1), bottom:+rows[rows.length-1].med.toFixed(1) };
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
    const RD=+(process.env.HC_RD||8), FOG=+(process.env.HC_FOG||0);
    await page.goto(base+'/index.html?debug=1&rd='+RD,{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    // ?rd DOES NOT HOLD, and the first multi-rd run of this file did not notice: `?rd=4` and `?rd=12` both reported rd 8 and were
    // measured with an rd-8 band. CFG.RENDER_DIST is overwritten after the query by a saved localStorage value, and the ADAPTIVE
    // LADDER then climbs it back toward RD_MAX while the scene settles. So set it through the hook and pin the framerate the ladder
    // reads, then read it BACK and refuse to measure if it did not take.
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); try{__hc.fpsPin(240);}catch(e){} __hc.rd(${RD}); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone();`);
    const rdLive=await page.evaluate(`__hc.rd()`);
    if(rdLive!==RD){ console.log(`  RENDER DISTANCE DID NOT TAKE: asked ${RD}, got ${rdLive} — refusing to measure`); return; }
    const isle=await page.evaluate(`__hc.isleStats()`);
    const X=Math.round(isle.x)+isle.R+150, Z=Math.round(isle.z);
    // THE EYE HEIGHT SCALES WITH THE WALL'S DISTANCE. The wall sits atan(eyeHeight/meshR) below the horizon, so at a fixed eye of 8
    // over the sea it is 15 degrees down at rd 4 and only 2.6 at rd 12 — at the far end that is three rows, jammed against the sky/sea
    // edge this file already records as a dead band. Holding the ANGLE roughly constant instead keeps the same measurement at every
    // render distance, which is the whole point of running more than one.
    const EYE=40+Math.max(8,(RD-1)*16*0.07);
    await page.evaluate(`__hc.tpAt(${X}, ${EYE}, ${Z})`);
    for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2000);
    await page.evaluate(`__hc.cam({yaw:-1.5708, pitch:-0.06})`); await sleep(600);
    const hz=await page.evaluate(`__hc.horizonDbg()`);
    console.log(`  offshore at ${X},48,${Z}   horizon state ${JSON.stringify(hz).slice(0,150)}`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(560); await page.evaluate(`__hc.setTime(${t})`); await sleep(280); };
    // WHERE THE WALL SHOULD LAND, so a maximum can be judged instead of merely reported. waterMat's uMeshR is (RD-1)*CK, the eye is
    // at y=48 and the sea at CFG.SEA=40, and the camera is a 74-degree VERTICAL fov over 560 px = 7.57 px/degree. The horizon sits
    // pitch above centre; the wall sits atan(dy/uMeshR) below the horizon.
    const geom=await page.evaluate(`(function(){ const rd=__hc.rd(); return { rd, meshR:(rd-1)*16, camY:__hc.pos().y }; })()`);
    // THE BAND FOLLOWS THE WALL. Hard-coding rows 275-300 was right for rd 8 and only for rd 8: the wall is at (rd-1)*16 blocks, so at
    // rd 4 it is 48 blocks out and sits far lower in the frame, and a fixed band would measure open sea and report no step for the
    // trivial reason that the wall is not in it.
    let BAND=[0.491,0.536];
    { await pin(0.42);
      const PXDEG=560/74, pitchDeg=0.06*57.29578, dy=Math.max(1,geom.camY-40);
      const horizonRow=280-pitchDeg*PXDEG, wallRow=horizonRow+Math.atan(dy/geom.meshR)*57.29578*PXDEG;
      // THE HORIZON IS FOUND IN THE FRAME, NOT PREDICTED. Clamping the band's top to a hard row 274 worked at rd 8 and failed at rd 12,
      // where the band's first rows read median 168 by day against 42 at its bottom — sky. The sky/sea edge is the largest jump in the
      // upper frame, so measure it and start six rows under it; that also keeps the "band straddles the horizon" trap of this file's
      // header from coming back at any eye height.
      const probe=path.join(OUT,`handover-probe.png`); await page.screenshot({path:probe});
      const up=rowProfile(probe,0.25,0.75,0.30,0.62);
      const edgeRow=up.worstRow;
      BAND=[Math.max(edgeRow+6,wallRow-12)/560, Math.min(0.86*560,wallRow+13)/560];
      console.log(`  sky/sea edge found at row ${edgeRow} (jump ${up.worst})`);
      console.log(`  rd ${geom.rd}, chunk water ends at ${geom.meshR} blocks; eye ${geom.camY.toFixed(1)} over sea 40`);
      console.log(`  predicted horizon row ~${horizonRow.toFixed(0)}, render wall row ~${wallRow.toFixed(0)}; band rows ${(BAND[0]*560)|0}-${(BAND[1]*560)|0}`); }
    // A BANK IS FORCED BACK ON AFTER pinScene, WHICH ZEROED IT. This is the trap the resume records: pinScene() clears weather.fog,
    // cloud, rain and overcast, so a "fog" run that sets the weather before it measures clear air.
    if(FOG>0){ await page.evaluate(`__hc.fog(${FOG})`); await sleep(2500);
      const w=await page.evaluate(`(()=>{ try{ return { fog:+weather.fog.toFixed(3), tgt:+weather.fogTgt.toFixed(3) }; }catch(e){ return __hc.fog(); } })()`);
      console.log(`  fog bank forced: ${JSON.stringify(w)}`);
    }
    for(const [tag,t] of [['night',0.94],['day',0.42]]){
      await pin(t);
      if(FOG>0){ await page.evaluate(`__hc.fog(${FOG})`); await sleep(900); }   // setTime does not touch weather, but the lerp is slow enough to re-assert
      // THREE SHOTS AND THE MEDIAN OF THEM, NEVER ONE. The sea is animated, and worse, the frame immediately after a dial change plus
      // a setTime re-pin is a TRANSIENT: single shots produced a 42-level jump at row 287 in whichever condition happened to be
      // sampled first, wash on in one run and wash off in the next, while three repeats of the same condition read 3.0, 3.28 and 3.49
      // at row 282 every time. A seam sits in the same row at the same size on every shot; that 42 did not.
      const trio=async(name)=>{ const w=[];
        for(let k=0;k<3;k++){ const fk=path.join(OUT,`handover-rd${RD}${FOG>0?'-fog':''}-${tag}${name}-${k}.png`);
          await page.screenshot({path:fk}); await sleep(240); w.push(rowProfile(fk,0.25,0.75,BAND[0],BAND[1])); }
        w.sort((a,b)=>a.worst-b.worst); const m=w[1];
        console.log(`  ${tag.padEnd(6)}${name.padEnd(8)} worst ${String(m.worst).padStart(6)} at row ${m.worstRow}  median jump ${m.medJump}  ratio ${m.ratio}   (three shots: ${w.map(x=>x.worst+'@'+x.worstRow).join(' ')})`);
        return m; };
      await trio('');
      // and with the wash forced OFF, so any seam the wash itself opened is separable from one that was already there
      await page.evaluate(`__hc.scot({amt:0})`); await sleep(420); await pin(t);
      if(FOG>0){ await page.evaluate(`__hc.fog(${FOG})`); await sleep(700); }
      await trio(' nowash');
      await page.evaluate(`__hc.scot({amt:0.85})`); await sleep(300);
    }
    console.log(`\n  READ IT LIKE THIS: `+'`ratio`'+` is the largest single row-to-row jump over the median jump in the same band. A smooth`);
    console.log(`  handover keeps that in single figures; a hard step at the render wall stands well clear of it. Compare the wash`);
    console.log(`  and no-wash rows at the same hour to see whether the wash opened a seam or found one.`);
    console.log(`  frames: bench/results/handover-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
