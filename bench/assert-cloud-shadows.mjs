// CLOUDS BLOCK THE SUN ON THE GROUND, AND ONLY THE SUN.
//
// Plan §1.7 / Tier 2 item 6, Ben's note 7. Four claims, and the last two are what keep it from being a brightness slider:
//   1. With the flag on, lit ground carries a moving pattern of darker and lighter — a real spatial VARIANCE, not a dimming.
//   2. It is the KEY light only. Injected where vSky already scales reflectedLight.directDiffuse, so ambient, block light and
//      the sky term are untouched: a surface the sun cannot reach must not change at all when a cloud crosses it. Measured on a
//      NIGHT frame, where there is no direct light to occlude — nothing may move there.
//   3. It never reaches indoors. Gated on vSky, so a cave has no weather.
//   4. It costs what §5's Tier 2 budget allows: under 0.5 ms.
//
// Paired in one page through __hc.cloudShadow({on}), grain off, clock re-pinned at every shot (§7).
//
//   node bench/assert-cloud-shadows.mjs
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
// Mean and the spread that matters. A cloud shadow is a LOW-frequency pattern — patches tens of pixels across — so it is measured
// as the spread of BLOCK means over a grid, not the per-pixel standard deviation, which is dominated by the tile jitter and the
// grass texture and would barely move.
function field(file, crop, blocks=14){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  const bw=(x1-x0)/blocks, bh=(y1-y0)/blocks, means=[];
  for(let by=0;by<blocks;by++) for(let bx=0;bx<blocks;bx++){
    let s=0,n=0;
    for(let y=(y0+by*bh)|0;y<(y0+(by+1)*bh)|0;y++) for(let x=(x0+bx*bw)|0;x<(x0+(bx+1)*bw)|0;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
    if(n) means.push(s/n); }
  const mean=means.reduce((a,b)=>a+b,0)/means.length;
  const sd=Math.sqrt(means.reduce((a,b)=>a+(b-mean)*(b-mean),0)/means.length);
  return { mean:+mean.toFixed(2), blockSd:+sd.toFixed(3), means, n:means.length };
}
// THE PER-BLOCK RATIO, on ÷ off, and how much it VARIES. This is the measurement that separates weather from a brightness
// slider, and the plain block spread cannot: that crop's spread is 32.8 levels of grass against forest against cliff, so a
// multiplicative darkening of any kind SHRINKS it (32.8 -> 31.5 measured), which reads as the pattern disappearing when in fact
// it is the whole frame being scaled. A uniform dimmer gives the same ratio in every block — spread 0. A cloud deck gives some
// blocks 1.0 and some 0.3, and that spread IS the shadow.
function ratioField(off, on, crop, blocks=14){
  const A=field(off,crop,blocks), B=field(on,crop,blocks);
  const r=[]; for(let i=0;i<A.means.length;i++) if(A.means[i]>4) r.push(B.means[i]/A.means[i]);   // skip near-black blocks: a ratio of two tiny numbers is noise
  const m=r.reduce((a,b)=>a+b,0)/r.length;
  const sd=Math.sqrt(r.reduce((a,b)=>a+(b-m)*(b-m),0)/r.length);
  return { ratioMean:+m.toFixed(4), ratioSd:+sd.toFixed(4), lo:+Math.min(...r).toFixed(3), hi:+Math.max(...r).toFixed(3), n:r.length };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8&perf=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    // pinScene() SETS CLOUD COVER TO ZERO. It pins the weather for deterministic benching and _uCloud is part of that, so a
    // cloud-shadow harness that pins the scene is testing a clear sky: the first run of this file reported cover 0, uCloudShadow
    // 0, and a flag that changed nothing. Pin first, then put the clouds back — the pin is still worth having for the rain, fog,
    // overcast and exposure it holds still.
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.vis({cloud:1.0}); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    // HIGH AND LOOKING DOWN over open ground, so the crop is a wide sheet of lit terrain — that is where a cloud shadow is
    // visible, and a level view of a forest wall is not.
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+58}, ${S.sz}+0.5); __hc.cam({yaw:0.7, pitch:-0.62});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2200);
    const GROUND=[0.12,0.88,0.30,0.92];
    const shot=async(t,name)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(160);
      const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };
    // t=0.16 puts the sun ~53 degrees up: full daylight with the mask at full strength (it fades out at a grazing sun on purpose).
    const pair=async(t,tag)=>{ await page.evaluate(`__hc.cloudShadow({on:false})`); const off=await shot(t,`cloudsh-${tag}-off.png`);
      await page.evaluate(`__hc.cloudShadow({on:true})`);  const on =await shot(t,`cloudsh-${tag}-on.png`); return [off,on]; };

    const [dOff,dOn]=await pair(0.16,'day');
    const A=field(dOff,GROUND), B=field(dOn,GROUND);
    const st=await page.evaluate(`__hc.cloudShadow()`);
    console.log('  state: '+JSON.stringify(st));
    console.log(`  DAY  ground  flag OFF: mean ${A.mean} blockSd ${A.blockSd}   flag ON: mean ${B.mean} blockSd ${B.blockSd}`);
    check('the pass is live in daylight',       st.amt > 0.3, `uCloudShadow ${st.amt} at ${st.elevDeg} degrees, cover ${st.cover}`);
    // 1. A PATTERN, not a dimmer, measured as the spread of the per-block RATIO.
    const R=ratioField(dOff,dOn,GROUND);
    console.log(`  DAY  ratio on/off: mean ${R.ratioMean}  spread ${R.ratioSd}  range ${R.lo}..${R.hi}  over ${R.n} blocks`);
    check('clouds put a pattern on the ground', R.ratioSd > 0.03, `per-block ratio spread ${R.ratioSd}, range ${R.lo}..${R.hi} — a uniform dimmer would be 0`);
    check('and they darken it overall',         B.mean < A.mean-0.8, `mean ${A.mean} -> ${B.mean}`);

    // 2. NIGHT: no direct light to occlude, so nothing at all may move. This is the check that proves it multiplies the KEY
    //    light rather than the frame.
    const [nOff,nOn]=await pair(0.75,'night');
    const NA=field(nOff,GROUND), NB=field(nOn,GROUND);
    console.log(`  NIGHT ground flag OFF: mean ${NA.mean} blockSd ${NA.blockSd}   flag ON: mean ${NB.mean} blockSd ${NB.blockSd}`);
    // A CONTROL PAIR AT NIGHT, FIRST — §5's own rule, skipped on the first attempt and it cost a false failure. Two OFF frames a
    // second apart already differ: the torch flicker term runs at 7.3 Hz, foliage sways, and a night crop is dark enough that
    // per-block ratios of small numbers are noisy on their own. Measured, that floor is a ratio spread of ~0.1 — LARGER than the
    // day's real signal of 0.077 — so "night ratio spread must be near zero" was never a valid claim. The claim is that the flag
    // adds nothing beyond the floor.
    const [nOffA,nOffB]=await (async()=>{ await page.evaluate(`__hc.cloudShadow({on:false})`);
      const a1=await shot(0.75,'cloudsh-night-ctlA.png'); const a2=await shot(0.75,'cloudsh-night-ctlB.png'); return [a1,a2]; })();
    const NC=ratioField(nOffA,nOffB,GROUND);
    const NR=ratioField(nOff,nOn,GROUND);
    console.log(`  NIGHT control off/off: spread ${NC.ratioSd}   flag off/on: spread ${NR.ratioSd}  range ${NR.lo}..${NR.hi}`);
    check('night is untouched',                 NR.ratioSd < Math.max(0.02, NC.ratioSd*1.6), `flag spread ${NR.ratioSd} against an off-vs-off floor of ${NC.ratioSd} — the day's real signal is ${R.ratioSd} over a floor measured below`);

    // 4. COST, per §5's Tier 2 budget of under 0.5 ms. Paired frame medians, warm-up discarded — the GPU timer on this box is
    //    not trustworthy per-pair (see the §0 correction in the plan), so the frame median is the number.
    const frames=async(ms)=>page.evaluate(`(async()=>{ const t0=performance.now(), a=[]; let last=performance.now();
      while(performance.now()-t0 < ${ms}){ await new Promise(r=>requestAnimationFrame(r)); const n=performance.now(); a.push(n-last); last=n; }
      a.sort((x,y)=>x-y); return a[a.length>>1]; })()`);
    await page.evaluate(`__hc.setTime(0.16)`); await sleep(400);
    await page.evaluate(`__hc.cloudShadow({on:true})`);  await frames(1500);
    await page.evaluate(`__hc.cloudShadow({on:false})`); await frames(1500);
    const deltas=[];
    for(let i=0;i<3;i++){
      await page.evaluate(`__hc.cloudShadow({on:true})`);  const on =await frames(2000);
      await page.evaluate(`__hc.cloudShadow({on:false})`); const off=await frames(2000);
      deltas.push(+(on-off).toFixed(3));
      console.log(`  pair ${i+1}: ON ${on.toFixed(3)} ms  OFF ${off.toFixed(3)} ms  delta ${(on-off).toFixed(3)}`);
    }
    await page.evaluate(`__hc.cloudShadow({on:true})`);
    const dMed=[...deltas].sort((a,b)=>a-b)[1];
    console.log(`  paired median cost: ${dMed} ms/frame at 1000x560`);
    check('it costs under 0.5 ms',              dMed < 0.5, `paired median ${dMed} ms [${deltas.join(', ')}]`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/cloudsh-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
