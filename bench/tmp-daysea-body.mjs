// IS THE DAYLIGHT SEA'S BLACK MONOTONIC IN uBody? — one BOOT per condition, because the frame does not return.
//
// tmp-daysea-cause established that the black comes through uBody (raising it takes 49.29% of the sea band to 0.00%) and that the
// Fresnel cap is innocent. It also produced one incoherent reading: a value DARKER than shipped ALSO read zero black — which cannot
// be true of a black caused by the body being dark. That reading came after `body up` in the same session, and after `body up`
// nothing in that session comes back, so it was contaminated by construction.
//
// THE ONLY WAY TO READ THIS IS A FRESH WORLD PER VALUE. Each condition below gets its own page, its own load, its own teleport and
// its own three shots, and the dial is written exactly once. That is slow — a minute a row — and it is the difference between a
// series that means something and the one this replaces.
//
// RESULT, 2026-08-05. THE CONTROL HOLDS — shipped 49.56% at the top of the run and 48.97% at the bottom, two separate boots — so the
// table can be read:
//   uBody                        black     med    p90
//   zero    0,0,0                65.54%     2.7    6.4
//   darker  0.004,0.015,0.019     0.00%    22.8   26.5     <- THE OUTLIER
//   shipped 0.004,0.034,0.052    49.56%    36.4   45.4
//   1.5x    0.006,0.051,0.078     0.04%    54.1   59.1
//   3x      0.012,0.102,0.156     0.00%    83.2   89.0
//   bright  0.05,0.10,0.12        0.00%    86.9   93.4
//   shipped again                48.97%    37.3   45.4
// So it IS monotonic where it matters — zero is blacker than shipped, and everything brighter than shipped is clean — and the
// "darker also reads zero" reading from tmp-daysea-cause REPRODUCES on its own boot, so it was not contamination after all.
//
// AND THE DISTRIBUTION IS THE ANSWER, NOT THE MEDIAN. Look at the pairs: shipped has a median of 36 and a p90 of 45 while HALF its
// pixels are under luminance 3. That is BIMODAL — half the sea is at 45 and the other half is at zero, with nothing in between. The
// `darker` row is unimodal: median 22.8, p90 26.5, nothing black at all. Zero is bimodal again (median 2.7, 65% black).
// A curve cannot do that. Two populations of pixels can, and only one of them is following uBody. So the question is no longer "how
// dark is the water" — it is WHICH PIXELS ARE THE OTHER POPULATION, and the shipped value is simply where the two happen to sit far
// enough apart to read as black beside blue.
// THAT SPLIT WAS RUN ON THESE FRAMES AND IT IS DECISIVE. Median and MAXIMUM of each half of the band:
//   shipped   dark half n=33304  med 0.00  MAX 0.00   |   light half n=33896  med 42.81
//   zero      dark half n=44043  med 1.07  max 2.93   |   light half n=23157  med  5.44
//   darker    dark half n=0                            |   light half n=67200  med 22.77
//   1.5x      dark half n=32     med 0.00  MAX 0.00   |   light half n=67168  med 54.12
//   3x/bright dark half n=0                            |   light half n=67200  med 83.21 / 86.92
// AT THE SHIPPED VALUE 33,304 PIXELS ARE EXACTLY ZERO — median 0.00 AND maximum 0.00, not 1, not 0.4. Nothing that is shaded lands on
// exactly zero across 33k pixels; a genuinely dark sea does not (the `zero` row's dark half is 1.07 with a max of 2.93, which is what
// dim water looks like). These pixels are NOT DARK WATER, they are pixels nothing wrote — a discard, or a NaN, which most drivers
// resolve to zero. That is also why brighter uBody values "fix" it and why the fix would have been a lie: the population does not
// brighten, it stops being produced.
// SO THE FIX IS NOT A FLOOR, AND THE FLOOR I WAS ABOUT TO WRITE WOULD HAVE PAINTED OVER A NaN. The next session should hunt the NaN or
// the discard: it is value-dependent (shipped triggers it, 0.004,0.015,0.019 does not, 32 pixels survive at 1.5x), which points at an
// expression that goes non-finite for particular uBody inputs rather than at geometry. NOTE THE TRAP FROM THE LAND-SIDE WORK: a NaN
// packed through a Math.round or a bit shift arrives as ZERO silently, so search for the value going non-finite, never for NaN itself.
//
//   node bench/tmp-daysea-body.mjs
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
const SEA=[0.35,0.95,0.52,0.72];
function seaStat(file){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*SEA[0])|0,x1=(P.w*SEA[1])|0,y0=(P.h*SEA[2])|0,y1=(P.h*SEA[3])|0;
  const v=[]; let b3=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch;
    const l=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2]; v.push(l); n++; if(l<3)b3++; }
  v.sort((a,b)=>a-b);
  return { black:+(100*b3/n).toFixed(2), med:+v[v.length>>1].toFixed(1), p90:+v[(v.length*0.9)|0].toFixed(1) };
}
// SHIPPED FIRST AND SHIPPED LAST. Two boots of the identical build, at the top and the bottom of the list: if they disagree the run
// is telling you about the machine, not about uBody.
const CONDS=[
  ['shipped',      null],
  ['zero',         [0,0,0]],
  ['darker',       [0.004,0.015,0.019]],
  ['1.5x',         [0.006,0.051,0.078]],
  ['3x',           [0.012,0.102,0.156]],
  ['bright',       [0.05,0.10,0.12]],
  ['shipped again',null],
];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    for(const [tag,body] of CONDS){
      const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
      await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
      const page=await ctx.newPage();
      page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,140)));
      await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
      await page.evaluate(`__hc.lock(true); __hc.pinScene(); try{__hc.fpsPin(240);}catch(e){} __hc.rd(8); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone();`);
      const isle=await page.evaluate(`__hc.isleStats()`);
      await page.evaluate(`__hc.tpAt(${Math.round(isle.x)+isle.R+150}, 48, ${Math.round(isle.z)})`);
      for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2000);
      await page.evaluate(`__hc.cam({yaw:-1.5708, pitch:-0.06})`); await sleep(600);
      if(body) await page.evaluate(`__hc.seaLook({body:[${body.join(',')}]})`);
      await sleep(500);
      await page.evaluate(`__hc.setTime(0.42)`); await sleep(600); await page.evaluate(`__hc.setTime(0.42)`); await sleep(400);
      const R=[]; for(let k=0;k<3;k++){ const f=path.join(OUT,`dsbody-${tag.replace(/\W/g,'')}-${k}.png`); await page.screenshot({path:f}); R.push(seaStat(f)); await sleep(260); }
      R.sort((a,b)=>a.black-b.black);
      const live=await page.evaluate(`__hc.seaLook({}).body`);
      console.log(`  ${tag.padEnd(14)} uBody ${JSON.stringify(live).padEnd(24)} black ${String(R[1].black).padStart(6)}%   med ${String(R[1].med).padStart(6)}   p90 ${R[1].p90}    (${R.map(r=>r.black).join(' ')})`);
      await ctx.close();
    }
    console.log(`\n  READ IT LIKE THIS: if black falls as uBody rises and rises as it falls, the term is monotonic and a floor is the fix.`);
    console.log(`  If the two "shipped" boots disagree, nothing else in the table can be read. frames: bench/results/dsbody-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
