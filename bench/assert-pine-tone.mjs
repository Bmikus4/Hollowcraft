// THE HORIZON PINES ARE DARKER THAN THE PALETTE BEN REJECTED, AND NOTHING ELSE IN THE FRAME MOVED.
//
// Ben, 08-05: "you need to be very careful about skybox pines. Thier color pallets both the green and brown is MUCH too light,
// it needs to be made darker." The third such ask — 07-20 (vibrancy), 08-04 ("the actual colors they use need to be slightly
// darker, not some pass over them"), and now this one — and every one of them was a scale on the same six numbers, so the
// palette is PINE_GREEN / PINE_BAND and the scale is _pineTone (index.html, __hc.pineTone).
//
// TWO CLAIMS, and the second is the one that makes this careful rather than merely darker:
//   1. the treeline is measurably darker at the shipped tone than at the palette he rejected (dial 1.0), and
//   2. the SKY ABOVE IT DID NOT MOVE. That is the whole reason this is a constant and not a pass: _uPine also feeds the fog
//      wash, the tip gradient and the undertree seam, and a darkening pass over the top would have taken the sky's own
//      gradient and the horizon anchor with it.
//
// THE VANTAGE IS THE ONE THE TREELINE WORK WAS MEASURED FROM — the 'blob' station of bench/assert-treeline-mouth.mjs, offshore
// looking back at the island, hard-coded on purpose: rederiving a vantage is how a check quietly starts measuring the sea.
// t=0.42 is full daylight (uDay 1.0), which is where the colour is most visible and where Ben is looking; setTime(0.5) is NOT
// noon on this map and would compare two twilights.
//
//   node bench/assert-pine-tone.mjs
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
function band(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const v=[]; let R=0,G=0,B=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch; v.push(lum(P.data,i)); R+=P.data[i];G+=P.data[i+1];B+=P.data[i+2];n++; }
  v.sort((a,b)=>a-b);
  return { med:+v[v.length>>1].toFixed(2), p10:+v[(v.length*0.1)|0].toFixed(2), p90:+v[(v.length*0.9)|0].toFixed(2),
           rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)] };
}
// TOGGLE AND DIFFERENCE THE TWO FRAMES, AND LET THE DIFFERENCE SAY WHERE THE PINES ARE. Two crops guessed by hand have already
// measured the wrong thing in this file — sea at the offshore station, sky at the land one (median 163.6, identical either side of
// the toggle) — and the treeline's own column-to-column variation is ~20 levels, the same order as the change, so no hand-placed
// crop statistic can be trusted. The toggle moves the pine layer and NOTHING else in the frame, so the rows where the frame
// changed ARE the band, by construction. That is also the discriminator plan §7 asks for: toggle the feature and difference.
function rowProfile(aF,bF){
  const A=decodePNG(fs.readFileSync(aF)), B=decodePNG(fs.readFileSync(bF));
  const rows=[];
  for(let y=0;y<A.h;y++){ let s=0;
    for(let x=0;x<A.w;x++){ const i=(y*A.w+x)*A.ch; s+=lum(A.data,i)-lum(B.data,i); }
    rows.push(s/A.w); }
  return rows;
}
// The band is the contiguous run of rows whose mean drop is at least a quarter of the peak row's — its own half-height, so a
// single bright row cannot stand in for a band.
function bandOf(rows){
  let peak=-1e9, at=0;
  for(let y=0;y<rows.length;y++) if(rows[y]>peak){ peak=rows[y]; at=y; }
  const thr=peak*0.25; let y0=at, y1=at;
  while(y0>0 && rows[y0-1]>=thr) y0--;
  while(y1<rows.length-1 && rows[y1+1]>=thr) y1++;
  const inBand=rows.slice(y0,y1+1).slice().sort((a,b)=>a-b);
  return { peak:+peak.toFixed(2), peakRow:at, y0, y1, h:y1-y0+1, med:+inBand[inBand.length>>1].toFixed(2) };
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
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    const T0=await page.evaluate(`__hc.pineTone({})`);
    console.log(`  shipped tone ${JSON.stringify(T0)}`);
    check('the shipped tone is a cut on both halves', T0.green<=0.75 && T0.band<=0.75, `green ${T0.green} band ${T0.band}`);
    check('the band shares the canopy colour uniform by reference', T0.shared===true, `shared ${T0.shared}`);

    // OFFSHORE, LOOKING BACK AT THE ISLAND — the 'blob' station of bench/assert-treeline-mouth.mjs, hard-coded, and this is the
    // second vantage this file went through. Standing ON the island (0.45R inland at y=92, facing out) reads push 1 and hide 0,
    // which LOOKS like the ideal station and is useless: the island's own hills fill that horizon, so toggling the whole palette
    // moved the frame by 2.2 levels against a same-condition control of 4.53. It is the same trap the mouth harness recorded —
    // "at the shore the backdrop is behind real island terrain that fills the frame".
    // The pine layer is only against open SKY from out at sea, and it is drawn there: uHide 1.0 does not remove the layer (the
    // toggle moves this frame by eleven levels at hide 1), so a push/hide precondition is the wrong gate for a claim about COLOUR.
    const isle=await page.evaluate(`__hc.isleStats()`);
    await page.evaluate(`__hc.tpAt(-359, 46, 645)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2400);
    const HOLD=`__hc.setTime(0.42);`;   // re-pinned at every shot: over a run this long the sun moves several levels
    await page.evaluate(HOLD+`__hc.cam({yaw:-0.785, pitch:-0.01})`); await sleep(700);
    await page.evaluate(HOLD); await sleep(300);
    const anchor=await page.evaluate(`__hc.treelineAnchor()`);
    console.log(`  station -359,46,645 (island ${isle.x},${isle.z} R ${isle.R})   treeline push ${anchor.push} hide ${anchor.hide}`);

    // MEDIAN OF THREE SHOTS PER CONDITION. The same-condition control at the first vantage moved its median column by 15.9 levels
    // on its own — the cloud field scrolls on REAL elapsed time and the sea animates, so a single pair puts that noise on the
    // palette. Three shots and a per-statistic median leaves the control near zero.
    const shots=async tag=>{ const F=[];
      for(let i=0;i<3;i++){ const f=path.join(OUT,`pinetone-${tag}-${i}.png`); await page.evaluate(HOLD); await sleep(260); await page.screenshot({path:f}); F.push(f); }
      return F; };
    await page.evaluate(`__hc.pineTone({amt:1.0})`); await sleep(400); const Af=await shots('rejected');
    await page.evaluate(`__hc.pineTone({green:${T0.green}, band:${T0.band}})`); await sleep(400); const Bf=await shots('shipped');
    await page.evaluate(`__hc.pineTone({amt:1.0})`); await sleep(400); const Cf=await shots('rejected-again');
    await page.evaluate(`__hc.pineTone({green:${T0.green}, band:${T0.band}})`); await sleep(200);
    const A=Af[1], B=Bf[1], C=Cf[1];
    const D=bandOf(rowProfile(A,B)), N=bandOf(rowProfile(A,C));
    console.log(`  the toggle darkens rows ${D.y0}-${D.y1} (${D.h} rows), peak ${D.peak} at row ${D.peakRow}, band median ${D.med}`);
    console.log(`  same-condition control: rows ${N.y0}-${N.y1}, peak ${N.peak}, band median ${N.med}`);
    check('the palette change reaches the screen', D.peak > Math.max(N.peak,0.5)*3 && D.peak > 2.0, `peak drop ${D.peak} vs control ${N.peak}`);
    check('and it darkens a BAND, not one row', D.h >= 4, `${D.h} rows`);
    // Where the band turned out to be, read as colour, so the log carries the actual before/after Ben is judging.
    const TREE=[0.10,0.90,D.y0/560,(D.y1+1)/560], SKY=[0.10,0.90,0.02,Math.max(0.04,(D.y0-30)/560)];
    const mid=(F,c)=>{ const S=F.map(f=>band(f,c)); const p=k=>{ const v=S.map(s=>s[k]).sort((a,b)=>a-b); return v[1]; };
      return { med:p('med'), p10:p('p10'), p90:p('p90'), rgb:S[1].rgb }; };
    const aT=mid(Af,TREE), bT=mid(Bf,TREE), cT=mid(Cf,TREE);
    const aS=mid(Af,SKY),  bS=mid(Bf,SKY);
    console.log(`  treeline band  rejected ${JSON.stringify(aT)}`);
    console.log(`  treeline band  shipped  ${JSON.stringify(bT)}`);
    console.log(`  treeline band  control  ${JSON.stringify(cT)}`);
    console.log(`  sky above it   rejected ${JSON.stringify(aS)}`);
    console.log(`  sky above it   shipped  ${JSON.stringify(bS)}`);
    check('the band itself is darker', aT.med - bT.med > Math.abs(aT.med-cT.med)+1.0, `median ${aT.med} -> ${bT.med} (control ${cT.med})`);
    check('the sky above it did not move', Math.abs(aS.med-bS.med)<=0.6, `sky median ${aS.med} -> ${bS.med}`);
    // HUE HELD: the change is a scale on all three channels, so the band's own R:G ratio must survive it. A drop that also
    // shifts the hue would be a different colour, and Ben approved this one.
    const rg=x=>x.rgb[0]/Math.max(x.rgb[1],0.001);
    check('the hue is held, only the value moved', Math.abs(rg(aT)-rg(bT))<0.06, `R/G ${rg(aT).toFixed(3)} -> ${rg(bT).toFixed(3)}`);

    const live=await page.evaluate(`__hc.pineTone({})`);
    console.log(`  live colours ${JSON.stringify(live)}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/pinetone-*.png   (__hc.pineTone({amt}) is the live dial for Ben's eye)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
