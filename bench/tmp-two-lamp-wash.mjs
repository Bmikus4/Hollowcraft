// BREAKING ONE OF TWO LAMPS IN A CHUNK MUST NOT WASH OUT THE OTHER ONE'S LIGHT.
//
// Ben, 08-05: "when two light sources are placed in a chunk, and the first one placed is broken, the entire chunk becomes white
// washed again."
//
// THE SUSPECT is a stale read in bakeLight (index.html ~2984). The scratch level buffer is cleared LAZILY, inside a test that reads
// that same buffer — `if(_lv[pi]<lvl){ if(!_lvLit){ _lv.fill(0); ... } ... }` — so the first emitter is compared against whatever the
// PREVIOUS chunk's bake left there. A stale level >= this emitter's own rejects it; reject every emitter in range and _lvLit stays
// false, bakeLight returns false, and buildLightTexture runs `c.light3D.dispose(); c.light3D=null`. The chunk's whole volume is gone,
// `_bl` is 0 for every fragment in it, the scotopic gate reads unlit, and THE ENTIRE CHUNK WASHES.
//
// THE MEASUREMENT IS LAMP B'S OWN POOL, before and after breaking lamp A. B is untouched, so its pool must stay lit and coloured.
// If the chunk's volume was destroyed, B's pool loses its BAKED light and greys — which is the reported symptom.
// Both lamps go in the SAME chunk (world coords floored to a 16-grid) because that is the case Ben reported; the existing
// tmp-break-light-wash.mjs uses ONE lamp and is blind to this by construction.
//
// STATUS: tmp-, NOT assert-. THE VANTAGE IS WRONG AND ITS OWN PRECONDITION CAUGHT IT. First run: B's pool read sat 0.243 / warm
// 1.32 / lum 30.4 BEFORE anything was broken, where a real lamp pool on planks measures sat 0.66-0.70 / warm 3.0 / lum 90-132
// (bench/tmp-break-light-wash.mjs). Looking at bench/results/twolamp-both-0.png says why: the spawn chunk here is a wooded hillside,
// so the crop landed on dark foliage and terrain in shade while lamp B sat half-occluded behind trunks further up the frame. The
// numbers after the break (0.145 / 1.02) are therefore NOT evidence of the bug — they are two readings of the wrong pixels.
// FIX THE SITE BEFORE TRUSTING ANY NUMBER HERE: pick a chunk with clear flat ground (or build the platform in the AIR at a known y,
// as bench/assert-cave-black.mjs does with its carved room), take GY from the CAMERA's column rather than from lamp A's, and keep the
// "B's pool is lit and coloured to begin with" check as the gate — it is the only reason this run did not report a false positive.
// The suspected root cause is unchanged and is written up in fleet/resume: the lazy `_lv.fill(0)` in bakeLight (~2984) reads the
// scratch buffer before clearing it, so a stale level from the previous chunk's bake can reject an emitter, and if every emitter in
// range is rejected the chunk's light volume is DISPOSED and the whole chunk washes.
//
//   node bench/assert-two-lamp-wash.mjs
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
function stat(file,px,py,r){
  const P=decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,px-r)|0,x1=Math.min(P.w,px+r)|0,y0=Math.max(0,py-r)|0,y1=Math.min(P.h,py+r)|0;
  let S=0,n=0,R=0,B=0,L=0,tot=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r0=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const l=lum(P.data,i); tot++; L+=l; if(l<12) continue;
    const mx=Math.max(r0,g,b), mn=Math.min(r0,g,b); S+=mx>0?(mx-mn)/mx:0; R+=r0; B+=b; n++; }
  return { sat:n?+(S/n).toFixed(3):0, lum:+(L/tot).toFixed(2), warm:n?+((R/n)/Math.max(1,B/n)).toFixed(2):0, lit:+(100*n/tot).toFixed(1) };
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
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true);`);
    const S=await page.evaluate(`__hc.st()`);
    // SAME CHUNK for both lamps: floor to the 16-grid and place well inside it.
    const CBX=(Math.round(S.sx)>>4)<<4, CBZ=(Math.round(S.sz)>>4)<<4;
    const AX=CBX+4, AZ=CBZ+4, BX=CBX+11, BZ=CBZ+11;
    const GY=await page.evaluate(`__hc.groundY(${AX},${AZ})`);
    await page.evaluate(`(()=>{ for(let dx=0;dx<16;dx++) for(let dz=0;dz<16;dz++) __hc.cmdRun('/setblock '+(${CBX}+dx)+' ${GY} '+(${CBZ}+dz)+' planks');
      __hc.cmdRun('/setblock ${AX} ${GY+1} ${AZ} lantern');   // A, placed FIRST
      __hc.cmdRun('/setblock ${BX} ${GY+1} ${BZ} lantern'); })()`);   // B, placed second
    for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1600);
    const built=await page.evaluate(`({ a:__hc.blockAt(${AX},${GY+1},${AZ}), b:__hc.blockAt(${BX},${GY+1},${BZ}),
      sameChunk:((${AX}>>4)===(${BX}>>4))&&((${AZ}>>4)===(${BZ}>>4)) })`);
    console.log(`  chunk ${CBX>>4},${CBZ>>4}: A at ${AX},${AZ}  B at ${BX},${BZ}  ${JSON.stringify(built)}`);
    check('both lamps placed, in the SAME chunk', built.a>0 && built.b>0 && built.sameChunk===true, JSON.stringify(built));

    // Stand off B and look at its pool, off-centre so the crop cannot hold the crosshair.
    await page.evaluate(`__hc.tpAt(${BX}+0.5, ${GY}+3.2, ${BZ}+10.5)`); await sleep(900);
    let by=0,br=1e9;
    for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.26})`); await sleep(45);
      const p=await page.evaluate(`__hc.screenOf(${BX}+0.5, ${GY}+0.5, ${BZ}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-330,p.py-350); if(r<br){ br=r; by=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${by}, pitch:-0.26})`); await sleep(500);
    const sp=await page.evaluate(`__hc.screenOf(${BX}+0.5, ${GY}+0.5, ${BZ}+0.5)`);
    const R=55;
    check('lamp B is on screen, clear of the crosshair', sp.onScreen && Math.hypot(sp.px-500,sp.py-280)>R+14,
      `crosshair ${Math.hypot(sp.px-500,sp.py-280).toFixed(0)} px away`);
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.94)`); await sleep(540); await page.evaluate(`__hc.setTime(0.94)`); await sleep(260); };
    const sample=async tag=>{ const F=[]; for(let i=0;i<5;i++){ const f=path.join(OUT,`twolamp-${tag}-${i}.png`); await page.screenshot({path:f}); F.push(stat(f,sp.px,sp.py,R)); await sleep(140); }
      const p=k=>{ const v=F.map(x=>x[k]).sort((a,b)=>a-b); return v[2]; };
      return { sat:p('sat'), lum:p('lum'), warm:p('warm'), lit:p('lit') }; };

    await pin();
    const both=await sample('both');
    console.log(`  both lamps burning        ${JSON.stringify(both)}`);
    check("B's pool is lit and coloured to begin with", both.sat>0.35 && both.warm>1.5, JSON.stringify(both));

    // BREAK A — the one placed FIRST — and leave B alone.
    await page.evaluate(`__hc.cmdRun('/setblock ${AX} ${GY+1} ${AZ} air')`);
    for(let i=0;i<16;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(350); }
    await sleep(1600); await pin();
    const gone=await page.evaluate(`({ a:__hc.blockAt(${AX},${GY+1},${AZ}), b:__hc.blockAt(${BX},${GY+1},${BZ}) })`);
    check('A is gone and B is still there', gone.a===0 && gone.b>0, JSON.stringify(gone));
    const after=await sample('after-break-A');
    console.log(`  A broken, B untouched     ${JSON.stringify(after)}`);
    // THE CLAIM. B never moved, so its pool must still be lit and warm. If the chunk's light volume was destroyed, the baked light
    // is gone from every fragment in the chunk and B's pool greys out — that is Ben's "the entire chunk becomes white washed".
    check("B's pool is STILL coloured after A is broken", after.sat > both.sat*0.7,
      `sat ${both.sat} -> ${after.sat}`);
    check('and still warm', after.warm > 1.5, `warm ${both.warm} -> ${after.warm}`);
    check('and still lit', after.lum > both.lum*0.6, `lum ${both.lum} -> ${after.lum}`);

    check('no page errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/twolamp-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
