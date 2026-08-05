// WHERE THE PORTAL'S FIRST-LOOK FRAME ACTUALLY GOES.
//
// The compile hypothesis is DEAD: on the worst frame of a first look the renderer linked ZERO programs (87 -> 88 across
// 120 frames). So the spike is work, not compilation, and brPortalWarm is the only synchronous work on that path —
// `brxGenerate(); brBuildEnvAll();` in one call, on the frame after the door appears. It already times itself into
// BR._warmMs, and __hcBRX.portalProbe reports it along with how many frames the door painted flat black waiting.
//
// This does not sample or estimate. It reads the number the game recorded for its own build, next to the worst frame
// observed over the same window, so "the hitch IS the region build" is a comparison of two measured values rather than
// an inference from their coincidence.
//
// usage: node bench/br-portal-warm.mjs
import { spawn } from 'node:child_process';
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

(async()=>{
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

    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(7000);
    await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hc.setTime(0.42)');

    // DID THE LOAD-TIME PRECOMPILE EVEN RUN? If it did not, the 28-32 programs linked in play are simply the work it
    // was meant to have done, and the fix is "make it run" rather than "extend it". That is a much cheaper answer and
    // it has to be ruled out before touching brPrecompileStep.
    console.log('precompile state: '+J(await ev('(()=>{ try{ return __hcPERF.precompile(); }catch(e){ return {err:String(e.message||e)}; } })()')));
    console.log('prewarm state:    '+J(await ev('(()=>{ try{ return __hcBRX.prewarm(); }catch(e){ return {err:String(e.message||e)}; } })()')));
    console.log('before the door:  '+J(await ev('__hcBRX.portalProbe("far")')));
    // Spawn, then watch EVERY frame across the window in which brPortalWarm is expected to run.
    const t=await ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
      window.__benchInfo=1;
      const spawnT0=performance.now(); __hcBR.door(); const spawnMs=+(performance.now()-spawnT0).toFixed(2);
      // THE SAME CORRELATION, WIDENED. progs alone said "not compilation" for frame 0 but could not say what it WAS.
      // __benchInfoSnap also carries memory.textures and memory.geometries, so a 16-second frame that uploads textures
      // and a 16-second frame that builds geometry are distinguishable without guessing. Deltas, not totals: the
      // question is what that FRAME did, not what the scene holds.
      const S=()=>Object.assign({progs:0,tex:0,geoms:0,calls:0}, window.__benchInfoSnap||{});
      let last=await f(); let worst=0, at=-1; const over=[]; let p=S();
      for(let i=0;i<240;i++){ const t2=await f(); const ms=t2-last; last=t2;
        const s=S();
        if(ms>worst){ worst=ms; at=i; }
        if(ms>60) over.push({frame:i, ms:+ms.toFixed(1),
          dProgs:s.progs-p.progs, dTex:s.tex-p.tex, dGeom:s.geoms-p.geoms, calls:s.calls});
        p=s; }
      return { spawnMs, worstMs:+worst.toFixed(2), atFrame:at, framesOver60ms:over, finalCounts:S() }; })()`);
    console.log('spawn + watch:    '+J(t));
    console.log('after the warm:   '+J(await ev('__hcBRX.portalProbe("facing")')));
    console.log('\npage errors: '+(errs.length?errs.slice(0,6).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
