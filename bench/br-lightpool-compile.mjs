// WHAT THE LIGHT POOL COSTS TO COMPILE. A trade for Ben, measured rather than argued.
//
// THE SITUATION. PERF.brPrecompile ships OFF, and its own note says why: turning it on moved first-interactive from
// 9.7 s to 26.9 s, the pass itself spending 15.8 s, and that 15.8 s is not the slicing loop — it is simply what a
// many-point-light MeshStandard shader costs to build through ANGLE. With it off, the player pays the same cost in
// chunks on first entry instead. I measured that payment directly: spawning a Void Door produces one frame of
// ~10 s while the renderer links 29-32 programs. Both halves of the trade are real; neither is free.
//
// THE NOTE ALSO NAMES THE REAL FIX — "a smaller light pool, and that is a visual decision, so it goes to Ben". But the
// note was written against a SIXTEEN-light pool, and PERF.brLightPool is now 32 ("Ben's call to bump it"). Every light
// is a per-fragment loop iteration in every material, so the compile cost that made precompile unaffordable was measured
// at half the pool the game now ships. Nobody has re-measured it since.
//
// So this produces the curve, not an opinion: for each pool size, a FRESH PAGE (the program cache is per WebGL context,
// so re-using one page would measure only the first arm), then spawn a door and record the worst frame, the programs
// linked on it, and how many fixtures actually end up lit — because the whole point is that the cheaper pool must still
// light the room, and a trade Ben cannot see both sides of is not a trade.
//
// usage: node bench/br-lightpool-compile.mjs
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

const POOLS=[8,16,32];

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const rows=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-gpu-vsync','--disable-frame-rate-limit'] });

    for(const pool of POOLS){
      const ctx=await browser.newContext({viewport:{width:1280,height:720}});   // fresh context => fresh GL context => empty program cache
      ctx.setDefaultTimeout(180000);                                            // a cold context on the third arm boots far slower than the 30 s default allows
      const page=await ctx.newPage();
      const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,140)));
      const ev=async(js)=>{ try{ return await page.evaluate(js); }catch(e){ return {err:String(e.message||e).slice(0,140)}; } };
      await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
      try{ await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000}); }
      catch(e){
        console.log('  DID NOT START. diagnostics:');
        console.log('   pageerrors: '+J(errs.slice(0,5)));
        console.log('   probe:      '+J(await ev('(()=>({ hasHc:typeof window.__hc!=="undefined", st:(window.__hc&&__hc.st)?__hc.st():null }))()')));
        throw e; }
      await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
      await sleep(7000);
      await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hc.setTime(0.42)');
      const set=await ev('__hcPERF.lightPool('+pool+')');

      const r=await ev(`(async()=>{ const f=()=>new Promise(r2=>requestAnimationFrame(t=>r2(t)));
        window.__benchInfo=1; await f(); await f();
        const S=()=>Object.assign({progs:0,tex:0,geoms:0,calls:0}, window.__benchInfoSnap||{});
        __hcBR.door();
        let last=await f(); let p=S(); let worst=0, at=-1, dp=0, totalOver100=0;
        for(let i=0;i<200;i++){ const t=await f(); const ms=t-last; last=t; const s=S();
          if(ms>100) totalOver100+=ms;
          if(ms>worst){ worst=ms; at=i; dp=s.progs-p.progs; }
          p=s; }
        return { worstMs:+worst.toFixed(1), atFrame:at, progsOnWorst:dp, progsEnd:S().progs,
                 msLostToFramesOver100:+totalOver100.toFixed(0) }; })()`);
      // the other half of the trade: does the room still look lit
      await ev('__hcBR.enter()'); await sleep(7000); await ev('__hcBR.goLit(0)'); await sleep(2500);
      const lit=await ev('__hcPERF.lightPool()');
      rows.push({pool, set, ...r, lit, errs:errs.length});
      console.log('pool '+String(pool).padStart(2)+'  worst '+String(r.worstMs).padStart(8)+'ms'
        +'  progs on that frame '+String(r.progsOnWorst).padStart(3)
        +'  total ms lost to >100ms frames '+String(r.msLostToFramesOver100).padStart(6)
        +'  litNear '+J(lit));
      await ctx.close();
    }

    console.log('\n=== THE TRADE ===');
    const b=rows.find(r=>r.pool===32);
    for(const r of rows){
      if(!b||!b.msLostToFramesOver100) continue;
      const save=b.msLostToFramesOver100-r.msLostToFramesOver100;
      console.log('  pool '+String(r.pool).padStart(2)+'  costs '+String(r.msLostToFramesOver100).padStart(6)+'ms of stall'
        +(r.pool===32?'   <- what ships today':'   ('+(save>0?'-':'+')+Math.abs(save)+'ms vs shipping, litNear '+(r.lit&&r.lit.litNear)+')'));
    }
    console.log('\nlitNear is the number that must not collapse — a pool that compiles fast and leaves the room dark is not a win.');
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
