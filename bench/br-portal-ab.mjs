// THE PORTAL. Ben 08-04: "make the portal, and spawning the portal completely lag free."
//
// TWO SEPARATE COSTS, and they need separate evidence:
//
//  1. THE FIRST LOOK — one frame of 1124.65 ms the first time the camera sweeps past a Void Door. brSpawnDoorNearPlayer
//     itself costs 0.47 ms, so the cost is DEFERRED to first render, not paid at spawn. The hypothesis is a shader compile
//     storm: the portal renders the whole scene through a second camera with the Backrooms' dressing and its sixteen-point
//     light pool, so every material it touches that the main camera has not drawn compiles a fresh program. This samples
//     renderer.info.programs.length EVERY FRAME and reports the program delta on the worst frame. If the spike frame is
//     also where the program count jumps, the diagnosis is closed by measurement rather than by argument.
//     (renderer.info.render.calls cannot be used for this — it resets per frame, so reading it outside the render loop
//     returns 1 and an earlier draw-call ratio of "1.00x" was meaningless.)
//
//  2. THE STEADY COST — 13.51 ms facing the door vs 6.72 ms overworld, at 73 portal renders/sec. brRenderPortal calls
//     renderer.render(scene,_brPortalCam) into a target the size of the whole drawing buffer, so facing a door costs
//     nearly two frames of fill for one frame of picture. BR_PORTAL_SCALE makes that a dial; this A/Bs 1.0 against 0.5.
//
// BOTH ARMS IN ONE PAGE against ONE door, because the Backrooms seed re-rolls per door and two runs are two worlds.
// Arm order is 0.5 FIRST, then 1.0 — the adversarial order for the change I want to land, so a win is not warm-up.
//
// usage: node bench/br-portal-ab.mjs   (HC_ROOT to pin a tree)
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT=process.env.HC_ROOT||'D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const J=v=>JSON.stringify(v);

// THE ONE NUMBER THAT PICKS BETWEEN TWO FIXES. Every frame records its duration AND the shader-program count, and every
// frame over 100 ms is reported WITH the number of programs linked on that frame.
//   progs steps on the hitch frame  -> it is synchronous shader compilation, and the fix is to compile that set at load
//                                      or on entry, off the render path (renderer.compile + KHR_parallel_shader_compile).
//                                      The same fix then also covers the portal's first look.
//   progs does NOT step             -> it is generation, and BR_X0=100000 means the observed hitch at x=100024.6 sat ~25
//                                      blocks off the Backrooms origin, on the first BRX chunk seam with stacked storeys.
// Writing either fix before doing this correlation would be guessing.
//
// Programs must come from window.__benchInfoSnap, NOT from renderer.info read outside the loop: info.autoReset clears it
// every frame, so an out-of-loop read reports the composer's final quad pass alone. The game sets up this accumulator
// itself when __benchInfo is set (index.html, end of the draw block).
const SWEEP=(frames)=>`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
  window.__benchInfo=1; await f(); await f();
  const snap=()=>(window.__benchInfoSnap||{progs:0,calls:0});
  let prev=snap().progs; const p0=prev;
  let last=await f(); let worst=0, at=-1, progAt=0; const d=[], hitches=[];
  for(let i=0;i<${frames};i++){ const t=await f(); const ms=t-last; last=t; d.push(ms);
    const s=snap(), pn=s.progs, dp=pn-prev;
    if(ms>100) hitches.push({frame:i, ms:+ms.toFixed(1), programsLinkedThisFrame:dp, calls:s.calls});
    if(ms>worst){ worst=ms; at=i; progAt=dp; }
    prev=pn; }
  d.sort((a,b)=>a-b); const n=d.length;
  return { worstMs:+worst.toFixed(2), atFrame:at, programsLinkedOnWorstFrame:progAt,
           programsStart:p0, programsEnd:snap().progs, drawCallsNow:snap().calls,
           median:+d[n>>1].toFixed(2), p90:+d[Math.floor(n*0.9)].toFixed(2), hitchesOver100ms:hitches }; })()`;

// Draw calls come from the in-frame accumulator too, so "is the portal a second full render pass" is answerable directly:
// with the door in view the calls should roughly double against the same view with the door behind you.
const STEADY=`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
  window.__benchInfo=1; await f(); await f();
  let last=await f(); const d=[], calls=[];
  for(let i=0;i<150;i++){ const t=await f(); d.push(t-last); last=t;
    const s=window.__benchInfoSnap; if(s) calls.push(s.calls); }
  d.splice(0,30); d.sort((a,b)=>a-b); const n=d.length;
  calls.sort((a,b)=>a-b);
  return { median:+d[n>>1].toFixed(2), p90:+d[Math.floor(n*0.9)].toFixed(2), p99:+d[Math.floor(n*0.99)].toFixed(2),
           drawCalls:calls.length?calls[calls.length>>1]:null }; })()`;

(async()=>{
  const HEAD=execSync('git rev-parse --short HEAD',{cwd:'D:/code/Minecraft'}).toString().trim();
  console.log('tree: '+ROOT+'   live HEAD '+HEAD);
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
            '--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    const ev=async(js,tag)=>{ try{ return await page.evaluate(js); }catch(e){ return {err:String(e.message||e).slice(0,150), at:tag}; } };

    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(7000);
    await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hc.setTime(0.42)');

    console.log('\n=== NO DOOR — the reference ===');
    console.log('  overworld steady     '+J(await ev(STEADY,'ref')));
    console.log('  programs before door '+J(await ev('__hcBR.draws()','p0')));

    console.log('\n=== THE FIRST LOOK (once per page — it can only happen once) ===');
    console.log('  portal scale         '+J(await ev('__hcBR.portalScale()','ps')));
    const spawn0=await ev(`(()=>{ const t0=performance.now(); __hcBR.door(); return {ms:+(performance.now()-t0).toFixed(2)}; })()`,'sp');
    console.log('  spawn cost           '+J(spawn0));
    await sleep(3500);
    await ev('__hcBRX.portalProbe("facing")'); await sleep(400);
    console.log('  first look           '+J(await ev(SWEEP(120),'fl')));

    const arm=async(scale,label)=>{
      await ev('__hcBR.portalScale('+scale+')');
      await ev('__hcBRX.portalProbe("behind")'); await sleep(1800);
      const behind=await ev(STEADY,'b');
      await ev('__hcBRX.portalProbe("facing")'); await sleep(1800);
      await ev('__hcPERF.portalRate(true)');
      const facing=await ev(STEADY,'f');
      const rate=await ev('__hcPERF.portalRate()','r');
      console.log('\n--- '+label);
      console.log('  door behind you      '+J(behind));
      console.log('  door in front of you '+J(facing));
      console.log('  portal renders       '+J(rate));
      if(behind.median&&facing.median) console.log('  COST OF THE PORTAL   +'+(facing.median-behind.median).toFixed(2)+'ms/frame');
      return {behind,facing};
    };
    // adversarial order: the change I want to land goes FIRST and pays the colder engine
    const half=await arm(0.5,'B · HALF RESOLUTION (the proposed default)');
    const full=await arm(1.0,'A · FULL RESOLUTION (what shipped)');

    console.log('\n=== VERDICT ===');
    if(half.facing.median&&full.facing.median){
      const hc=half.facing.median-half.behind.median, fc=full.facing.median-full.behind.median;
      console.log('  portal cost/frame    full '+fc.toFixed(2)+'ms  ->  half '+hc.toFixed(2)+'ms'
        +(fc>0? '   ('+(100*(fc-hc)/fc).toFixed(0)+'% cheaper)':''));
      console.log('  facing median        full '+full.facing.median+'ms  ->  half '+half.facing.median+'ms');
    }
    console.log('\npage errors: '+(errs.length?errs.slice(0,8).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
