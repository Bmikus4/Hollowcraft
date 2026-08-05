// THE NIGHT WASH REACHES THE SEA, AND THE TWO SEAS AGREE.
//
// Ben, 08-05: "the night wash pass, should also apply to the ocean."
//
// He is right that it did not. The global scotopic pass is patched into three's own LIT shader chunks, and both water surfaces are
// ShaderMaterials with their own lighting — so after dark the sea was the one large surface in frame keeping its full chroma while
// every solid thing around it washed out. A coloured sea against a grey world.
//
// TWO SURFACES, ONE EXPRESSION. `waterMat` is the chunk water you stand next to; `oceanMat` is the painted disc beyond the render
// wall. They must wash identically or the horizon tears exactly where they hand over — the same class of fault as the fog-parity
// item. Both read the SAME _scotG Float32Array the land does, so __hc.scot({amt}) moves all three at once, and this file asserts
// that: the A/B is the shared dial, not a water-only flag.
//
// NO DESCENT ON THE SEA. uScotH.y is the cave floor and open sea has full sky openness, so the land's own formula multiplies it by
// zero there. Asserted as "the sea desaturates but does not darken", because night water needed an in-scatter floor to stop it
// producing black texels (61fe516) and this must not undo it.
//
//   node bench/assert-ocean-wash.mjs
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
// SATURATION over the pixels bright enough to have a colour, and the MEDIAN luminance — the wash moves the first and must not move
// the second. Median because night water carries salt-and-pepper texels and a mean follows them (61fe516).
function sea(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const v=[]; let S=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    v.push(lum(P.data,i));
    if(lum(P.data,i)>=10){ const mx=Math.max(r,g,b), mn=Math.min(r,g,b); S+=mx>0?(mx-mn)/mx:0; n++; } }
  v.sort((a,b)=>a-b);
  return { sat:n?+(S/n).toFixed(3):0, med:+v[v.length>>1].toFixed(2), lit:+(100*n/v.length).toFixed(1) };
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
    page.on('console',m=>{ const t=m.text(); if(/ERROR: 0:|shader/i.test(t)){ errs.push(t); console.log('  GLSL:',t.slice(0,300)); } });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone();`);

    // OFFSHORE, LOOKING OUT TO SEA, from height: near chunk water in the lower frame, the painted disc beyond it, no land.
    const isle=await page.evaluate(`__hc.isleStats()`);
    const X=Math.round(isle.x)+isle.R+150, Z=Math.round(isle.z);
    await page.evaluate(`__hc.tpAt(${X}, 52, ${Z})`);
    for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2000);
    // face AWAY from the island so no coastline is in frame: the island is at -x from here, so look +x
    await page.evaluate(`__hc.cam({yaw:-1.5708, pitch:-0.30})`); await sleep(600);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(560); await page.evaluate(`__hc.setTime(${t})`); await sleep(260); };
    // NEAR = the lower band (chunk water at this pitch); FAR = just under the horizon line (the painted disc).
    const NEAR=[0.20,0.80,0.66,0.84], FAR=[0.20,0.80,0.46,0.54];
    const shot=async tag=>{ const f=path.join(OUT,`oceanwash-${tag}.png`); await page.screenshot({path:f}); return f; };

    await pin(0.94);
    const dials=await page.evaluate(`__hc.scot({})`);
    console.log(`  dials ${JSON.stringify(dials)}`);
    check('the wash is on by default', dials.amt>0.5, `amt ${dials.amt}`);

    await page.evaluate(`__hc.scot({amt:0})`); await sleep(420); await pin(0.94);
    const offF=await shot('night-off'); const nOff=sea(offF,NEAR), fOff=sea(offF,FAR);
    await page.evaluate(`__hc.scot({amt:0.85})`); await sleep(420); await pin(0.94);
    const onF=await shot('night-on'); const nOn=sea(onF,NEAR), fOn=sea(onF,FAR);
    await page.evaluate(`__hc.scot({amt:0})`); await sleep(420); await pin(0.94);
    const ctlF=await shot('night-off-again'); const nCtl=sea(ctlF,NEAR);
    await page.evaluate(`__hc.scot({amt:0.85})`); await sleep(200);
    console.log(`  NEAR chunk water  off ${JSON.stringify(nOff)}   on ${JSON.stringify(nOn)}   off again ${JSON.stringify(nCtl)}`);
    console.log(`  FAR  painted disc off ${JSON.stringify(fOff)}   on ${JSON.stringify(fOn)}`);
    // THE ARTEFACT FIRST: with the wash off, night sea has to be visibly coloured, or this file proves nothing.
    check('night sea is coloured with the wash off', nOff.sat>0.20, `near sat ${nOff.sat}`);
    const noise=Math.max(Math.abs(nOff.sat-nCtl.sat), 0.02);
    check('the near sea washes out at night', nOff.sat-nOn.sat > noise+0.03, `near sat ${nOff.sat} -> ${nOn.sat} (noise ${noise.toFixed(3)})`);
    check('the far disc washes out too', fOff.sat-fOn.sat > 0.03, `far sat ${fOff.sat} -> ${fOn.sat}`);
    // AND THEY AGREE: the horizon must not tear. Both are the same expression, so the drop should be within noise of each other.
    check('near and far wash by the same amount', Math.abs((nOff.sat-nOn.sat)-(fOff.sat-fOn.sat)) < 0.12,
      `near drop ${(nOff.sat-nOn.sat).toFixed(3)} vs far drop ${(fOff.sat-fOn.sat).toFixed(3)}`);
    // AND IT DESATURATES WITHOUT DARKENING — night water's black-texel floor must survive.
    check('the sea keeps its value', Math.abs(nOn.med-nOff.med)<=2.5, `near median ${nOff.med} -> ${nOn.med}`);

    // ---- DAYLIGHT IS UNTOUCHED --------------------------------------------------------------------------------------------
    // The gate is the day factor through the land's ramp (lo 0.01, hi 0.45), so by day the term is zero. This is also what keeps
    // the sea Ben signed off — the fresnel cap, the glades, the horizon anchor — exactly as it was.
    await pin(0.42);
    await page.evaluate(`__hc.scot({amt:0})`); await sleep(420); await pin(0.42);
    const dOffF=await shot('day-off'); const dOff=sea(dOffF,NEAR);
    await page.evaluate(`__hc.scot({amt:0.85})`); await sleep(420); await pin(0.42);
    const dOnF=await shot('day-on'); const dOn=sea(dOnF,NEAR);
    console.log(`  DAY near water off ${JSON.stringify(dOff)}   on ${JSON.stringify(dOn)}`);
    check('daylight sea is unchanged by the wash', Math.abs(dOn.sat-dOff.sat)<=0.02 && Math.abs(dOn.med-dOff.med)<=2.0,
      `sat ${dOff.sat} -> ${dOn.sat}, median ${dOff.med} -> ${dOn.med}`);

    check('no page errors and no shader compile errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/oceanwash-*.png   (__hc.scot({amt}) moves land and sea together)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
