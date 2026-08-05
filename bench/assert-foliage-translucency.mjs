// A LANTERN ON ONE SIDE OF A BUSH LIGHTS THE WHOLE BUSH.
//
// Ben, 08-05: "foliage that is illuminated on one side should show through to the entire piece of foliage."
//
// A cross block is two quads at right angles and a leaf block is six faces of one cell, and every one of them was shaded by
// saturate(N·L): a face pointing away from the lamp kept only ambient, so the plant read half-dead — and on the DoubleSide
// material three flips the normal toward the VIEWER, so which half looked lit depended on which side you walked round to.
//
// The fix is transmission: a leaf is thin, so light that would hit the far face scatters through, and the term is
// uFolTrans * saturate(-N·L). It is ZERO wherever saturate(N·L) is nonzero, which is what makes it safe — the lit side is
// bit-identical at every value of the dial, so this can only change the dark side.
//
// THE MEASUREMENT: a leaf block with a lantern on one side, photographed from the OTHER side, with __hc.folTrans({amt:0}) as the
// A/B. amt 0 is the shipped shader with the term switched off, so the harness has to show the artefact before it shows the fix.
// The crop is the block's own pixels, found by projecting its centre with the game's own screenOf — never a guessed rectangle.
//
//   node bench/assert-foliage-translucency.mjs
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
// GREEN pixels only, and a median. A crop centred on a leaf block still catches sky, ground and, at night, the lantern's own
// bloom; the leaf is the green thing in it. Median so one bright pixel cannot carry the result.
//
// THE PIXEL SET IS FIXED ONCE AND REUSED — classify on one frame, read that SAME SET out of the others. Reclassifying per frame
// silently changes what is being averaged: with the lamp on, a leaf goes warm, G>R stops holding, and the green share fell 53% to
// 22% between the two conditions of the same measurement. The median then compares the whole leaf against whichever slivers of it
// stayed green. This is the lesson c7c813d already paid for on the night-chroma work: classify once, read the set.
function leafMask(file,px,py,r){
  const P=decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,px-r)|0, x1=Math.min(P.w,px+r)|0, y0=Math.max(0,py-r)|0, y1=Math.min(P.h,py+r)|0;
  const idx=[]; let n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, R=P.data[i],G=P.data[i+1],B=P.data[i+2];
    n++; if(G>R && G>B) idx.push(i); }
  return { idx, n, share:+(100*idx.length/Math.max(1,n)).toFixed(1) };
}
function leafStat(file,mask){
  const P=decodePNG(fs.readFileSync(file));
  const v=[]; for(const i of mask.idx) v.push(lum(P.data,i));
  v.sort((a,b)=>a-b);
  return { lum:v.length?+v[v.length>>1].toFixed(2):0, px:v.length };
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
    page.on('console',m=>{ const t=m.text(); if(/leafTrans|ERROR: 0:/i.test(t)){ errs.push(t); console.log('  LOG:',t.slice(0,220)); } });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.holdNone();`);

    const T=await page.evaluate(`__hc.folTrans({})`);
    console.log(`  dial ${JSON.stringify(T)}`);
    check('transmission is on by default', T.amt>0.1, `amt ${T.amt}`);
    check('and the patch reached the compiled shader', T.patched===true, `patched ${T.patched}`);

    const S=await page.evaluate(`__hc.st()`);
    const X=Math.round(S.sx)+10, Z=Math.round(S.sz), GY=await page.evaluate(`__hc.groundY(${Math.round(S.sx)+10},${Math.round(S.sz)})`);
    // THE SUBJECT IS `leaves`, NOT `leaves_core`, and that mistake cost this file its first run. leaves_core is cat:'solid' — it
    // is the opaque interior of a canopy and renders on opaqueMat, which is deliberately NOT patched: stone and planks and gun
    // metal are on that material and none of them are thin. The transmission lives on leafMat (the canopy shell, `leaves`) and
    // foliageMat (cross-block plants). Testing the core measured a block with no transmission in it and read 17.22 -> 17.44.
    // 17 was not "nearly nothing", either: it is FOL_UNLIT_FLOOR, the 20%-of-own-albedo floor an unlit atlas fragment already
    // gets. A dark leaf sits ON that floor, so anything this term adds has to be read against it.
    // A lantern two blocks to +x, two blocks of air between, camera on -x: the lamp is a light in the scene rather than a bright
    // object inside the crop.
    const LY=GY+3;
    await page.evaluate(`(()=>{
      __hc.cmdRun('/setblock ${X} ${LY} ${Z} leaves');
      __hc.cmdRun('/setblock ${X+2} ${LY} ${Z} lantern');
    })()`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    const built=await page.evaluate(`({ leaf:__hc.blockAt(${X},${LY},${Z}), lamp:__hc.blockAt(${X+2},${LY},${Z}) })`);
    check('the leaf block and its lantern are both placed', built.leaf>0 && built.lamp>0, JSON.stringify(built));

    // Stand on the DARK side, six blocks out, and aim by the game's own projection.
    await page.evaluate(`__hc.tpAt(${X}-6.5, ${LY}-0.4, ${Z}+0.5)`); await sleep(900);
    let bestYaw=0,bestR=1e9;
    for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:0.06})`); await sleep(50);
      const p=await page.evaluate(`__hc.screenOf(${X}+0.5, ${LY}+0.5, ${Z}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-280); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:0.06})`); await sleep(500);
    const sp=await page.evaluate(`__hc.screenOf(${X}+0.5, ${LY}+0.5, ${Z}+0.5)`);
    console.log(`  leaf projects to ${sp.px|0},${sp.py|0} (r ${bestR.toFixed(0)})`);
    check('the leaf block is on screen and near centre', sp.onScreen && bestR<260, `r ${bestR.toFixed(0)}`);
    const R=42;   // the block is ~1 block at 6 blocks on a 74-degree frame: a 42-px box holds it with a little margin

    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(520); await page.evaluate(`__hc.setTime(${t})`); await sleep(240); };
    // MEDIAN OF FIVE per condition: a lantern's flame flickers 12% on real elapsed time, and a single pair puts that on the fix.
    const sample=async(tag,mask)=>{ const F=[];
      for(let i=0;i<5;i++){ const f=path.join(OUT,`foltrans-${tag}-${i}.png`); await page.screenshot({path:f}); F.push(leafStat(f,mask)); await sleep(150); }
      const p=k=>{ const v=F.map(x=>x[k]).sort((a,b)=>a-b); return v[2]; };
      return { lum:p('lum'), px:F[2].px }; };

    // ---- 1. NIGHT: the lamp is the only light, so this is the whole claim ------------------------------------------------
    await pin(0.94);
    await page.evaluate(`__hc.folTrans({amt:0})`); await sleep(420); await pin(0.94);
    // the mask comes from the OFF frame — the leaf as it is BEFORE the fix, so the fix cannot choose its own pixels
    const mf=path.join(OUT,'foltrans-night-mask.png'); await page.screenshot({path:mf});
    const mask=leafMask(mf,sp.px,sp.py,R);
    console.log(`  leaf mask: ${mask.idx.length} px of ${mask.n} in the box (${mask.share}%)`);
    check('the crop holds a leaf to measure', mask.idx.length>400, `${mask.idx.length} px, ${mask.share}%`);
    const off=await sample('night-off',mask);
    await page.evaluate(`__hc.folTrans({amt:0.45})`); await sleep(420); await pin(0.94); const on=await sample('night-on',mask);
    await page.evaluate(`__hc.folTrans({amt:0})`); await sleep(420); await pin(0.94); const ctl=await sample('night-off-again',mask);
    await page.evaluate(`__hc.folTrans({amt:0.45})`); await sleep(200);
    console.log(`  dark side, transmission OFF  ${JSON.stringify(off)}`);
    console.log(`  dark side, transmission ON   ${JSON.stringify(on)}`);
    console.log(`  dark side, OFF again         ${JSON.stringify(ctl)}`);
    const flick=Math.max(Math.abs(off.lum-ctl.lum), 1.5);
    check('the far side of the leaf is lit by a lamp on the near side', on.lum > off.lum+flick+1.0,
      `lum ${off.lum} -> ${on.lum} (flicker ${flick.toFixed(2)})`);

    // ---- 2. DAYLIGHT: THE LIT SIDE MUST NOT MOVE -------------------------------------------------------------------------
    // saturate(-N·L) is zero wherever the light reaches the face, so a sunlit leaf is arithmetically identical at any dial value.
    // This is the check that would catch a wrap-lighting implementation (abs(N·L)) sneaking in — that one brightens both sides and
    // would blow out every daylit canopy in the game.
    //
    // SAME VANTAGE, LAMP REMOVED, sun on this side. The sun direction in this game is (cos(ang), sin(ang), 0.35) normalised, so its
    // azimuth is always in +z and its x is cos(ang): at t=0.42, ang=2.64 rad and cos=-0.88, so the sun is on the -x side — the very
    // face the night vantage above is already looking at. Two earlier versions of this check walked round to the +x side instead and
    // measured nothing: at (X+6.5, ., Z+0.5) the lantern sits between the lens and the leaf, and even offset three blocks in z the
    // crop came back with 0 green pixels of 7056. Standing still and taking the lamp out is the whole test.
    await page.evaluate(`__hc.cmdRun('/setblock ${X+2} ${LY} ${Z} air')`); await sleep(600);
    for(let i=0;i<12;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(350); }
    const lampGone=await page.evaluate(`__hc.blockAt(${X+2},${LY},${Z})`);
    check('the lantern is gone, so only the sun lights the leaf', lampGone===0, `blockAt ${JSON.stringify(lampGone)}`);
    const sp2=sp;   // the camera has not moved
    const sampleAt=async(tag,mask)=>{ const F=[];
      for(let i=0;i<3;i++){ const f=path.join(OUT,`foltrans-${tag}-${i}.png`); await page.screenshot({path:f}); F.push(leafStat(f,mask)); await sleep(140); }
      const q=k=>{ const v=F.map(x=>x[k]).sort((a,b)=>a-b); return v[1]; };
      return { lum:q('lum') }; };
    await pin(0.42);
    await page.evaluate(`__hc.folTrans({amt:0})`); await sleep(420); await pin(0.42);
    const dmf=path.join(OUT,'foltrans-day-mask.png'); await page.screenshot({path:dmf});
    const dmask=leafMask(dmf,sp2.px,sp2.py,R);
    console.log(`  daylit leaf mask: ${dmask.idx.length} px (${dmask.share}%)`);
    // THE PRECONDITION IS PART OF THE CHECK. The first run read lum 0 and green 0 here — the crop held no leaf at all — and an
    // "unchanged" assertion passed on 0 vs 0. A check that cannot tell an unchanged leaf from a missing one is not a check.
    check('there is a daylit leaf in the crop at all', dmask.idx.length>400, `${dmask.idx.length} px, ${dmask.share}%`);
    const dOff=await sampleAt('day-off',dmask);
    await page.evaluate(`__hc.folTrans({amt:0.45})`); await sleep(420); await pin(0.42); const dOn=await sampleAt('day-on',dmask);
    await page.evaluate(`__hc.folTrans({amt:0.45})`); await sleep(200);
    console.log(`  daylight, transmission OFF ${JSON.stringify(dOff)}`);
    console.log(`  daylight, transmission ON  ${JSON.stringify(dOn)}`);
    check('a daylit leaf is unchanged by the dial', dOff.lum>20 && Math.abs(dOn.lum-dOff.lum)<=2.5, `lum ${dOff.lum} -> ${dOn.lum}`);

    check('no page errors and no missing-token warning', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/foltrans-*.png   (__hc.folTrans({amt}) is the dial)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
