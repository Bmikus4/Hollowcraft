// WHAT HAPPENS TO THE WHITEWASH IN THE FRAMES AFTER A LIGHT IS BROKEN?
//
// Ben, 08-05 (message truncated): "for the whitewash at night, I think ive solidly found an issue that will help a lot, which is
// that when a light source is broken".
//
// THE HYPOTHESIS, from the code. The scotopic gate is max(bakedBlockLight, sky*day, deliveredDirect, emissive), and breaking a
// lamp moves those inputs at DIFFERENT TIMES:
//   the pointPool PointLight goes the same frame the block does, so deliveredDirect drops instantly;
//   the BAKED volume does not. markRelight puts the neighbour ring into relightSet (~6051) and that set is drained under a TIME
//   BUDGET — `if(performance.now()-meshT0>meshMS) break` (~7556) — so a chunk can keep its old baked light for one or more frames.
// While it does, the gate still reads lit and the colour stays where it should already have washed out.
//
// WHAT THIS MEASURES, and it is deliberately not a pass/fail: the crop's saturation and warmth over the frames after the break,
// against the relight queue depth (__hc.editQ) at each sample. If saturation holds while relight > 0 and falls when it hits 0, the
// hypothesis is confirmed and the window is quantified. If the queue drains before the first sample, the hypothesis is WRONG at
// this scale and the artefact Ben is describing is something else — which is worth knowing before writing a fix.
//
// RESULT, 2026-08-05: THE HYPOTHESIS IS WRONG AT THIS SCALE. relightSet is 8 deep in the frame the lamp is broken, but by the
// first sample (~150 ms later) the crop has already fallen from sat 0.695 / lum 132.1 / warm 3.00 to sat 0.176 / lum 30.9 /
// warm 1.18 — the wash arrives with the light's disappearance, not frames behind it — and the queue reads 0 by the next sample.
// So the time-budgeted relight drain is NOT leaving stale baked light on screen long enough to see. Do not write that fix.
//
// WHAT THIS RUN DID TURN UP, unasked and unpursued: `pool lights lit before the break: 14` of 16 slots, with ONE lantern placed by
// this harness. The pool is nearly saturated by worldgen emitters at spawn, so breaking any light FREES a slot and another lamp is
// promoted into it — which would change the delivered light, and therefore the wash, on a lamp somewhere else entirely at the
// moment you break one. That is a candidate for what Ben is describing and it is NOT measured here.
//
//   node bench/tmp-break-light-wash.mjs
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
// saturation over the pixels bright enough to have a colour at all, plus the warm ratio — the two numbers the wash moves.
function stat(file,px,py,r){
  const P=decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,px-r)|0, x1=Math.min(P.w,px+r)|0, y0=Math.max(0,py-r)|0, y1=Math.min(P.h,py+r)|0;
  let S=0,n=0,R=0,G=0,B=0,L=0,tot=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r0=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const l=lum(P.data,i); tot++; L+=l; if(l<14) continue;
    const mx=Math.max(r0,g,b), mn=Math.min(r0,g,b);
    S+=mx>0?(mx-mn)/mx:0; R+=r0;G+=g;B+=b; n++; }
  return { sat:n?+(S/n).toFixed(3):0, lum:+(L/tot).toFixed(2), warm:n?+((R/n)/Math.max(1,B/n)).toFixed(2):0, lit:+(100*n/tot).toFixed(1) };
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
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true);`);
    const S=await page.evaluate(`__hc.st()`);
    const LX=Math.round(S.sx)+6, LZ=Math.round(S.sz), GY=await page.evaluate(`__hc.groundY(${Math.round(S.sx)+6},${Math.round(S.sz)})`);
    // planks under the lamp: a pale floor is where "what the lamp lights" is actually visible
    await page.evaluate(`(()=>{ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) __hc.cmdRun('/setblock '+(${LX}+dx)+' ${GY} '+(${LZ}+dz)+' planks');
      __hc.cmdRun('/setblock ${LX} ${GY+1} ${LZ} lantern'); })()`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    await page.evaluate(`__hc.tpAt(${LX}+0.5, ${GY}+3.0, ${LZ}+9.5)`); await sleep(800);
    // aim OFF-CENTRE so the crop cannot contain the crosshair (that trap is written into this bench twice over)
    let by=0,br=1e9;
    for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.24})`); await sleep(45);
      const p=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${GY}+0.5, ${LZ}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-320,p.py-350); if(r<br){ br=r; by=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${by}, pitch:-0.24})`); await sleep(400);
    const sp=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${GY}+0.5, ${LZ}+0.5)`);
    const R=60;
    console.log(`  lit floor at ${sp.px|0},${sp.py|0} (crosshair ${Math.hypot(sp.px-500,sp.py-280).toFixed(0)} px away, crop r ${R})`);
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.94)`); await sleep(520); await page.evaluate(`__hc.setTime(0.94)`); await sleep(240); };
    await pin();
    const shot=async tag=>{ const f=path.join(OUT,`brklight-${tag}.png`); await page.screenshot({path:f}); return stat(f,sp.px,sp.py,R); };

    // ---- BEFORE ---------------------------------------------------------------------------------------------------------
    const before=[]; for(let i=0;i<3;i++){ before.push(await shot('before-'+i)); await sleep(120); }
    const med=A=>{ const p=k=>{ const v=A.map(x=>x[k]).sort((a,b)=>a-b); return v[(v.length/2)|0]; };
      return { sat:p('sat'), lum:p('lum'), warm:p('warm'), lit:p('lit') }; };
    console.log(`  lamp burning              ${JSON.stringify(med(before))}`);
    const poolBefore=await page.evaluate(`(function(){ try{ const o=__hc.owShadow(); return (o.pool||[]).filter(p=>p&&p.i>0).length; }catch(e){ return null; } })()`);

    // ---- BREAK IT, and watch --------------------------------------------------------------------------------------------
    const brk=await page.evaluate(`__hc.cmdRun('/setblock ${LX} ${GY+1} ${LZ} air')`);
    const q0=await page.evaluate(`__hc.editQ()`);
    console.log(`  broke the lamp: ${JSON.stringify(brk).slice(0,60)}  queues right after ${JSON.stringify(q0)}`);
    for(let i=0;i<10;i++){
      const q=await page.evaluate(`__hc.editQ()`);
      const blk=await page.evaluate(`__hc.blockAt(${LX},${GY+1},${LZ})`);
      const s=await shot('after-'+i);
      console.log(`   +${String(i).padStart(2)}  queues ${JSON.stringify(q).padEnd(28)} block ${blk}  ${JSON.stringify(s)}`);
      await sleep(150);
    }
    await sleep(1500); await pin();
    const settled=[]; for(let i=0;i<3;i++){ settled.push(await shot('settled-'+i)); await sleep(120); }
    console.log(`  settled, well after       ${JSON.stringify(med(settled))}`);
    console.log(`  pool lights lit before the break: ${poolBefore}`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
