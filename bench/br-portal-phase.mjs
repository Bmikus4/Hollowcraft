// WHICH PHASE OWNS THE PORTAL'S FRAME 0 — and whether it is a phase at all.
//
// br-portal-warm.mjs found a 16,309 ms frame 0 after a Void Door spawns, with dProgs 0, dTex 0, dGeom 1: no
// renderer-visible cause. Guessing the cause next (textures? geometry?) is how the three already-refuted hypotheses
// were born. The game already has the instrument that answers it: T.commit() stores, per frame, BOTH the rAF-to-rAF
// delta (frames[]) AND the loop body's own wall clock split across 24 scopes, with `misc` absorbing whatever the
// scopes did not account for. So the breakdown always sums to the CPU time actually spent inside loop().
//
// That gives one discriminating comparison, and it needs no new hypothesis:
//   frameMs ~= cpuSum  -> the 16 s is game work, and the named scope says which work.
//   frameMs >> cpuSum  -> the game spent nothing; the time is OUTSIDE the loop body (compositor, driver, GPU,
//                         or this headless environment's scheduler), and no amount of optimizing the Backrooms
//                         will move it.
//
// TWO ARMS IN ONE PAGE ON ONE SEED, control first — the arm I want to fail. If a 240-frame window with NO door
// spawned also carries a multi-second frame, then multi-second frames are a property of this harness and the
// portal number is not evidence about the portal. The overworld control in an earlier run showed 2962 ms and
// 623 ms uncorrelated, which is exactly why this arm runs at all, and why it runs FIRST.
//
// usage: node bench/br-portal-phase.mjs      (HC_ROOT=<pinned tree> to measure a pinned hash)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT=process.env.HC_ROOT||'D:/code/Minecraft';
const REPO='D:/code/Minecraft';

// T, TN and PERF are module-scoped consts, and __hcPERF exposes only aggregates (frameProf averages over n frames,
// which cannot describe ONE 16-second frame). So this needs one line of reach into the ring. It patches the tree it
// is pointed at rather than asking a human to remember to, and it REFUSES to patch the live repo checkout: three
// sessions share D:\code\Minecraft and a stray edit there gets swept into another session's whole-file `git add`.
// Point HC_ROOT at a pinned tree — `git archive <hash> | tar -x -C <dir>` — which is what a measurement wants anyway.
function ensureProbe(root){
  const f=path.join(root,'index.html'); let s=fs.readFileSync(f,'utf8');
  if(s.includes('window.__PT=')) return 'already patched';
  if(path.resolve(root).toLowerCase()===path.resolve(REPO).toLowerCase())
    throw new Error('refusing to patch the shared checkout — pin a tree and set HC_ROOT (git archive <hash> | tar -x -C <dir>)');
  const a='PERF.T = T; PERF.TID = TID; PERF.TN = TN;';
  if(!s.includes(a)) throw new Error('probe anchor missing — this tree predates PERF.T');
  fs.writeFileSync(f, s.replace(a, a+'\nwindow.__PT={T,TN,PERF};   // BENCH PROBE (br-portal-phase.mjs), pinned trees only'));
  return 'patched';
}
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const J=v=>JSON.stringify(v);

// Reads PERF's own ring for the window just observed. Frame indices are taken from T.idx() so nothing here has to
// assume the loop ran exactly N times.
const WINDOW=(n)=>`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(r));
  const T=window.__PT&&__PT.T; if(!T) return {err:'__PT probe missing — is the pinned tree patched?'};
  const R=4096, NS=T.NSYS, TN=__PT.TN, i0=T.idx();
  for(let i=0;i<${n};i++) await f();
  const i1=T.idx(), out=[]; let count=((i1-i0)%R+R)%R, sumFrame=0, sumCpu=0;
  for(let k=0;k<count;k++){ const fi=(i0+k)%R, ms=T.frames[fi];
    let cpu=0; const b={};
    for(let s=0;s<NS;s++){ const v=T.ring[fi*NS+s];
      // brPortal/brStream/brBuild/collision/brain/wretch/animals/props are NESTED inside other scopes — counting
      // them in the sum would double-count. Same exclusion list T.commit() uses to compute misc.
      if(['brPortal','brStream','brBuild','collision','brain','wretch','animals','props'].indexOf(TN[s])<0) cpu+=v;
      if(v>0.05) b[TN[s]]=+v.toFixed(2); }
    sumFrame+=ms; sumCpu+=cpu;
    // dProgs is the whole question: a hitch that STEPS the program count is a link, a hitch that does not is work.
    const prev=T.progs[((fi-1)%R+R)%R];
    if(ms>100) out.push({ frame:k, frameMs:+ms.toFixed(1), cpuMs:+cpu.toFixed(1),
      unaccounted:+(ms-cpu).toFixed(1), gpuMs:+T.gpuRing[fi*5].toFixed(2),
      progs:T.progs[fi], dProgs:T.progs[fi]-prev, phases:b }); }
  const pFirst=T.progs[i0%R], pLast=T.progs[((i1-1)%R+R)%R];
  return { frames:count, totalFrameMs:+sumFrame.toFixed(0), totalCpuMs:+sumCpu.toFixed(0),
           progsStart:pFirst, progsEnd:pLast, over100ms:out.slice(0,12), over100count:out.length }; })()`;

(async()=>{
  console.log('probe: '+ensureProbe(ROOT));
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,180)));
    const ev=async(js)=>{ try{ return await page.evaluate(js); }catch(e){ return {err:String(e.message||e).slice(0,150)}; } };

    await page.goto(base+'/index.html?perf=1&debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(7000);
    await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hc.setTime(0.42)');
    await ev('window.__benchInfo=1');
    await ev('__hcPERF.arm()');   // headless never acquires pointer lock, and PERF.on gates every T.begin/end
    console.log('perf on:          '+J(await ev('(()=>({on:!!(window.__PT&&__PT.PERF.on), frames:__PT.T.count()}))()')));

    // ARM A (runs first, and it is the arm I want to fail): identical window, NO door.
    console.log('\nCONTROL, no door: '+J(await ev(WINDOW(240))));

    // ARM B: same page, same seed, same window length, door spawned.
    const sp=await ev('(()=>{ const t0=performance.now(); __hcBR.door(); return {spawnMs:+(performance.now()-t0).toFixed(2)}; })()');
    console.log('\nspawn call:       '+J(sp));
    console.log('AFTER THE DOOR:   '+J(await ev(WINDOW(240))));
    console.log('\nwarm:             '+J(await ev('__hcBRX.portalProbe("facing")')));
    console.log('page errors: '+(errs.length?errs.slice(0,6).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
