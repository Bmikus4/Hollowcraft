// THE MOTION BLUR AND THE HELD ITEM — A DIAGNOSTIC THAT CANNOT YET MEASURE ITS CLAIM. Read this before writing a fourth version.
//
// Ben, 08-05, ordered last of his asks: motion blur must not touch hands, held items or guns, "especially on thier edges".
//
// THE MECHANISM, which is arithmetic and not in doubt. `uNear` rejects the blur for any pixel within 2.6 units of the camera —
// the viewmodel — so the gun itself stays sharp. But this is a GATHER blur: every WORLD pixel beside the gun samples backwards
// along its own velocity, those samples land ON the gun, and the gun is smeared outward into the world along its silhouette.
// Classifying the destination pixel cannot fix that. The fix tests each TAP against uNearD and drops the ones that hit the
// viewmodel (index.html, MotionBlurShader). __hc.mbGuard({on:false}) sets uNearD to 0, which rejects nothing and IS the old gather.
//
// WHY THIS FILE IS tmp- AND NOT assert-: IT NEVER CAPTURES A BLURRED FRAME. The blur exists only on the frame immediately after
// the camera moves — the pass reprojects against the last RENDERED frame, and `vl<0.0008` takes a settled camera down the
// single-tap early-out. A Playwright screenshot waits for a stable frame, so by the time it lands the velocity is gone. The proof
// is in the numbers: with fixed yaws, the band's p10 came back 6.72 in all THREE conditions, identical to two decimals.
//
// THREE DESIGNS, ALL DEAD, so nobody pays for them again:
//   1. free-running rAF spin, camera pitched 0.55 — the same-condition control moved 117 LEVELS, because the terrain behind the
//      band changed between conditions. A spin means the two conditions never see the same scene.
//   2. same, pitched 1.30 at the zenith with a low sun — control median noise fell to 1.0 (the vantage is right), but the p10 still
//      swung 47 -> 14 -> 9 on the control alone.
//   3. fixed yaw list, one step of velocity per shot, so both conditions see pixel-identical backgrounds — control noise 1.71 and
//      the guard reads as doing nothing, because no captured frame has any blur in it at all.
//
// WHAT WOULD WORK: read the pixels back INSIDE the page on the frame after the move, from a rAF callback, instead of screenshotting
// from outside. Note that the game's own grabFrame() is NOT that: it calls renderer.render directly, bypassing the composer, so it
// has no post chain and therefore no motion blur in it.
//
// The silhouette/band machinery below is sound and worth keeping: the held item's own pixels come from differencing a held frame
// against an empty-handed one with the camera PARKED, and the band is that mask dilated by 7 px.
//
//   node bench/tmp-mblur-viewmodel.mjs
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
// the held item's own pixels: where the two parked frames differ by more than noise
function silhouette(heldF,emptyF){
  const A=decodePNG(fs.readFileSync(heldF)), B=decodePNG(fs.readFileSync(emptyF));
  const w=A.w, h=A.h, m=new Uint8Array(w*h); let n=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=(y*w+x)*A.ch;
    if(Math.abs(lum(A.data,i)-lum(B.data,i))>6){ m[y*w+x]=1; n++; } }
  return { m, w, h, n };
}
// the band of NOT-item pixels within r of an item pixel — where a smear of the item would land
function band(sil,r){
  const {m,w,h}=sil, b=new Uint8Array(w*h); const idx=[];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    if(m[y*w+x]) continue;
    let near=false;
    for(let dy=-r;dy<=r && !near;dy++){ const yy=y+dy; if(yy<0||yy>=h) continue;
      for(let dx=-r;dx<=r;dx++){ const xx=x+dx; if(xx<0||xx>=w) continue; if(m[yy*w+xx]){ near=true; break; } } }
    if(near){ b[y*w+x]=1; idx.push((y*w+x)); } }
  return idx;
}
function bandStat(file,idx,ch){
  const P=decodePNG(fs.readFileSync(file));
  const v=[]; for(const p of idx){ v.push(lum(P.data,p*P.ch)); }
  v.sort((a,b)=>a-b);
  return { med:+v[v.length>>1].toFixed(2), p10:+v[(v.length*0.1)|0].toFixed(2), n:v.length };
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
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); localStorage.setItem('hollowcraft_mb','1'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true);`);

    const G=await page.evaluate(`__hc.mbGuard({})`);
    console.log(`  guard ${JSON.stringify(G)}`);
    check('the blur is on and the tap guard is on by default', G.on===true && G.mbMode===true && G.uNearD>0.5, JSON.stringify(G));

    const S=await page.evaluate(`__hc.st()`);
    // STRAIGHT UP AT THE ZENITH, AND WITH A LOW SUN. The band has to be a smooth bright background or the measurement is of
    // whatever the camera happens to be pointing at: the first version used pitch 0.55, which keeps terrain in frame, and since the
    // camera SPINS while the shots are taken the same-condition control moved 117 levels — the world behind the band had simply
    // changed. The zenith is where the sky gradient is flattest, so yaw barely moves it, and t=0.05 puts the sun low and far from
    // the crop (setTime is a quarter turn out from its comment: t=0 is sunrise, 0.25 noon).
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, __hc.groundY(${Math.round(S.sx)},${Math.round(S.sz)})+14, ${S.sz}+0.5); __hc.cam({yaw:0, pitch:1.30});`);
    for(let i=0;i<16;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(350); }
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.05)`); await sleep(500); await page.evaluate(`__hc.setTime(0.05)`); await sleep(240); };
    await pin();

    // ---- the silhouette, camera PARKED so there is no blur at all -------------------------------------------------------
    await page.evaluate(`__hc.hold('field_guide')`); await sleep(700); await pin();
    const heldF=path.join(OUT,'mbvm-held.png'); await page.screenshot({path:heldF});
    await page.evaluate(`__hc.holdNone()`); await sleep(700); await pin();
    const emptyF=path.join(OUT,'mbvm-empty.png'); await page.screenshot({path:emptyF});
    const sil=silhouette(heldF,emptyF);
    console.log(`  held item silhouette: ${sil.n} px`);
    check('the held item has a silhouette to measure', sil.n>3000, `${sil.n} px`);
    const idx=band(sil,7);
    check('and there is a band of world pixels around it', idx.length>2000, `${idx.length} px`);

    // ---- now hold it and TURN --------------------------------------------------------------------------------------------
    await page.evaluate(`__hc.hold('field_guide')`); await sleep(600); await pin();
    // a page-side loop that keeps turning: 0.02 rad/frame is a brisk look-around, and it never stops, so every screenshot below
    // lands on a frame that has real camera velocity
    // FIXED YAWS, ONE STEP OF VELOCITY EACH — not a free-running spin. A page-side rAF loop turns the camera to an unknown angle by
    // the time a screenshot lands, so the two conditions saw different skies: the first version's same-condition control moved 117
    // levels with terrain in frame and its p10 still swung 47 -> 14 -> 9 at the zenith. Here each shot is taken at the SAME list of
    // yaws in both conditions, so the background is pixel-identical and only the blur can differ. The step before the shot is what
    // gives the pass its velocity (it reprojects against the last rendered frame).
    // Conservative by construction: if a frame renders twice before the capture, that shot has no velocity and reads identically in
    // both conditions, which can only dilute the result toward "no effect" — never manufacture one.
    const YAWS=[0.30,0.62,0.94,1.26,1.58,1.90,2.22];
    const sample=async tag=>{ const F=[];
      for(let k=0;k<YAWS.length;k++){
        await page.evaluate(`__hc.cam({yaw:`+(YAWS[k]-0.02)+`, pitch:1.30})`); await sleep(150);   // settle at the previous angle
        await page.evaluate(`__hc.cam({yaw:`+YAWS[k]+`, pitch:1.30})`);                          // ONE step -> this frame has velocity
        const f=path.join(OUT,'mbvm-'+tag+'-'+k+'.png'); await page.screenshot({path:f}); F.push(bandStat(f,idx)); }
      const p=k=>{ const v=F.map(x=>x[k]).sort((a,b)=>a-b); return v[3]; };
      return { med:p('med'), p10:p('p10') }; };

    await page.evaluate(`__hc.mbGuard({on:false})`); await sleep(300); const off=await sample('guardoff');
    await page.evaluate(`__hc.mbGuard({on:true})`);  await sleep(300); const on =await sample('guardon');
    await page.evaluate(`__hc.mbGuard({on:false})`); await sleep(300); const ctl=await sample('guardoff-again');
    await page.evaluate(`__hc.mbGuard({on:true})`);
    console.log(`  band around the item, guard OFF  ${JSON.stringify(off)}`);
    console.log(`  band around the item, guard ON   ${JSON.stringify(on)}`);
    console.log(`  band around the item, OFF again  ${JSON.stringify(ctl)}`);
    // The held item is DARK against sky, so dragging it outward DARKENS the band. The guard must leave the band brighter.
    const noise=Math.max(Math.abs(off.med-ctl.med), 1.0);
    check('the guard stops the held item smearing into the world', on.med > off.med + noise + 0.5,
      `band median ${off.med} -> ${on.med} (same-condition noise ${noise.toFixed(2)})`);
    check('and the darkest tenth of the band recovers too', on.p10 > off.p10 + 0.5, `p10 ${off.p10} -> ${on.p10}`);

    check('no page errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/mbvm-*.png   (__hc.mbGuard({on}) is the A/B)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
