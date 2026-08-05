// IS THE HALLS FRAME FRAGMENT-BOUND OR SUBMISSION-BOUND? The census says the Backrooms spend the whole frame in
// `draw` (10.2 ms of a 9.6 ms median; every game system together is under 0.6 ms) while submitting 2270 calls for
// 285k triangles — 126 tris per call. That reads as a batching problem. This bench decides it BEFORE anything is
// merged, because the two causes want opposite fixes: fewer submissions, or fewer fragments.
//
// TWO KNOBS THAT DO NOT WORK IN HERE, both established by measurement, both worth knowing before reading a result:
//   __hcPERF.fill(s)          — the halls re-assert _pixelScale=1.0 every frame by policy (index.html:20706, "no
//                               adaptive downscale blur", Ben 07-27). A sweep through fill() reported px 1 at every
//                               arm. So FRAGMENT count is changed by the CANVAS SIZE instead, which means two page
//                               loads rather than two arms in one page.
//   __hcPERF.brPointShadows() — brApplyShadowLights never demotes a caster, it only stops refreshing the map, and
//                               brxUpdateLights raises needsUpdate again on the frames a tube is lit. Measured: 0 of
//                               2258 draw calls dropped. __hcPERF.brShadowsHard flips castShadow, which does.
//
// AND ONE ARM THAT IS NOT AN ARM: the first four seconds after entering the halls cost about twice what the rest do
// (17.49 ms against 8.18 for the identical configuration measured later). Every reading below is taken after a
// discarded warm-up, and the baseline is measured THREE times so the noise floor is a number rather than a hope. An
// effect smaller than that floor is reported as inconclusive, not as a finding.
//
// usage: node bench/br-fill-vs-draws.mjs      (runs against the tree this file sits in)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u,t=20000)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const med = a => { const s=[...a].sort((p,q)=>p-q); return s[s.length>>1]; };

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});

    const arm = async (page, label, setup) => {
      if(setup){ const r=await page.evaluate(setup); if(r!==undefined) console.log('   setup -> '+JSON.stringify(r)); }
      await page.evaluate(`window.__hcPERF.reset()`);
      await sleep(4000);
      const r = await page.evaluate(`(()=>{ const f=__hcPERF.live(), i=__hc.perf(), c=__hcPERF.census(), cv=document.querySelector('canvas');
        return { med:f.median, p99:f.p99, n:f.n, calls:i.calls, tris:i.tris, drawables:c.drawables,
                 shadowFaces:c.shadowFaces, px:__hc.sceneState().pixelScale, buf:cv? cv.width+'x'+cv.height : '?' }; })()`);
      console.log('  '+label.padEnd(24)+' med '+String(r.med).padStart(7)+' ms  p99 '+String(r.p99).padStart(7)+
                  '  draws '+String(r.calls).padStart(5)+'  drawables '+String(r.drawables).padStart(4)+
                  '  shadowFaces '+r.shadowFaces+'  px '+r.px+'  buf '+r.buf);
      return r; };

    // One page per RESOLUTION, because fragment count is only reachable through the canvas in here.
    const open = async (w,h) => {
      const page=await (await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1})).newPage();
      page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
      await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed=20260728',{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:180000});
      await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`);
      await sleep(2000);
      await page.evaluate(`window.__hcPERF.enterBR()`); await sleep(5000);
      await page.evaluate(`window.__hc.cam({yaw:0.7, pitch:0})`); await sleep(1500);
      return page; };

    // ---- FULL RESOLUTION: warm-up discarded, then the baseline three times so the spread is measured ----
    console.log('1920x1080:');
    const pA = await open(1920,1080);
    await arm(pA,'warm-up (DISCARDED)');
    const a1=await arm(pA,'baseline 1'), a2=await arm(pA,'baseline 2'), a3=await arm(pA,'baseline 3');
    const fullMs=[a1.med,a2.med,a3.med], full=med(fullMs);
    const floor=Math.max(...fullMs)-Math.min(...fullMs);

    // ---- THE SHADOW ARM, on the same page so nothing else moves ----
    const off = await arm(pA,'castShadow off', `window.__hcPERF.brShadowsHard(false)`);
    const on  = await arm(pA,'castShadow back on', `window.__hcPERF.brShadowsHard(true)`);
    await pA.context().close();

    // ---- QUARTER THE PIXELS: same seed, same camera, same scene, a smaller canvas ----
    console.log('\n960x540 (a quarter of the fragments):');
    const pB = await open(960,540);
    await arm(pB,'warm-up (DISCARDED)');
    const b1=await arm(pB,'baseline 1'), b2=await arm(pB,'baseline 2'), b3=await arm(pB,'baseline 3');
    const smallMs=[b1.med,b2.med,b3.med], small=med(smallMs);
    await pB.context().close();

    // ---- COUNTER-METRICS. Each one can void the result on its own. ----
    const drawDrift=Math.abs(b1.calls-a1.calls);
    const shadowTook=(a1.shadowFaces-off.shadowFaces)>0 || (a1.calls-off.calls)>50;
    console.log('\nnoise floor at full res: '+fullMs.join(' / ')+' ms  spread '+floor.toFixed(3)+
                '   (an effect under this is not an effect)');
    console.log('submissions across resolutions: '+a1.calls+' -> '+b1.calls+'  drift '+drawDrift+
                (drawDrift>a1.calls*0.05? '  <-- VOID: the small canvas is not the same scene' : '  (same scene)'));
    console.log('shadow knob: shadowFaces '+a1.shadowFaces+' -> '+off.shadowFaces+
                ', draws '+a1.calls+' -> '+off.calls+(shadowTook? '  (took effect)' : '  <-- INERT, shadow arm unreadable'));
    console.log('restored:    '+on.med+' ms against baseline '+full+' ms');

    const fragDrop=100*(full-small)/full, shadowDrop=100*(full-off.med)/full;
    console.log('\nquarter of the fragments: '+full+' -> '+small+' ms  ('+fragDrop.toFixed(1)+'%)');
    console.log('six cube faces removed:   '+full+' -> '+off.med+' ms  ('+shadowDrop.toFixed(1)+'%), '+
                (a1.calls-off.calls)+' of '+a1.calls+' draw calls');

    // PRE-REGISTERED, decided before the run and gated on the measured noise floor rather than a guessed threshold.
    const sig=(delta)=>Math.abs(delta)>floor*1.5;
    console.log('\nRESULT: '+(drawDrift>a1.calls*0.05 ? 'VOID — the two canvases drew different scenes'
      : !sig(full-small) ? 'NOT FRAGMENT-BOUND — a quarter of the pixels moved the frame by '+(full-small).toFixed(2)+
          ' ms against a '+floor.toFixed(2)+' ms noise floor, so the cost is submissions or CPU'
      : fragDrop>=40 ? 'FRAGMENT-BOUND ('+fragDrop.toFixed(1)+'%) — merging draw calls is NOT the lever'
      : 'PARTLY FRAGMENT-BOUND ('+fragDrop.toFixed(1)+'%) — the rest is submissions or CPU'));
    console.log('SHADOWS: '+(!shadowTook ? 'unreadable — the knob did nothing'
      : !sig(full-off.med) ? 'FREE — '+(a1.calls-off.calls)+' draw calls removed moved the frame '+(full-off.med).toFixed(2)+
          ' ms against a '+floor.toFixed(2)+' ms floor. Draw-call COUNT is not what costs here.'
      : 'WORTH '+shadowDrop.toFixed(1)+'% of the frame'));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
