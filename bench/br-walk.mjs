// WALKING THE HALLS, HONESTLY — and with the audio engine actually running.
//
// WHY THIS EXISTS. br-baseline.mjs reported a median of 43 ms and one 8444 ms frame while "walking". It was not walking.
// It drove __hcBR.tp, which jumps up to 180 blocks per call and forces six streamChunks every frame — a teleport storm no
// player performs. That number measures the harness. This one sets the real input flag (__hcBR.walk) so the real physics
// integrator moves the player at the real speed and chunk streaming happens on exactly the schedule play produces.
//
// AND THE AUDIO IS REAL HERE. The baseline ran with --mute-audio and no user gesture, so no AudioContext ever existed and
// every bus read null — a void measurement that could easily have been reported as "the beds are silent, the seal works".
// Here the mute flag is gone and a real click starts the context before anything is read.
//
// A HITCH IS LOCATED, NOT JUST COUNTED. Every frame over 20 ms records the player's position and the loaded-chunk count with
// it, because "the halls hitch" and "the halls hitch every time the loaded set changes" are different bugs with different fixes.
//
// usage: node bench/br-walk.mjs
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT=process.env.HC_ROOT||'D:/code/Minecraft';   // HC_ROOT pins the measurement to an extracted clean tree — three sessions share this checkout and the working copy is almost never attributable
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const J=v=>JSON.stringify(v);
const hr=t=>console.log('\n=== '+t+' '.repeat(Math.max(0,58-t.length))+'===');

(async()=>{
  const HEAD=execSync('git rev-parse --short HEAD',{cwd:ROOT}).toString().trim();
  console.log('HEAD '+HEAD+(execSync('git status --porcelain index.html',{cwd:ROOT}).toString().trim()?'  (index.html DIRTY)':'  (clean)'));
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      // NO --mute-audio. autoplay-policy lets the context start without a gesture, and the click below supplies one anyway.
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
            '--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,220)));
    const ev=async(js,tag)=>{ try{ return await page.evaluate(js); }catch(e){ return {err:String(e.message||e).slice(0,160), at:tag}; } };

    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(6000);
    // a REAL gesture, so the AudioContext exists. Without this every bus reads null and the silence is the harness's.
    await page.mouse.click(640,360); await sleep(1200);
    await ev('__hc.cmdRun("/gamemode creative")');
    console.log('  audio outside          '+J(await ev('__hcAUD.buses()','ow')));

    hr('WALKING THE OVERWORLD (the control)');
    // The same walk, outside. Without it a 12 ms hall is being compared to nothing and any claim about the Backrooms
    // specifically is unfounded — the walk itself costs something everywhere.
    const WALK=(secs)=>`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
      __hcBR.walk(true,true); let last=await f(); const d=[], hitch=[]; const t0=performance.now();
      let yaw=0;
      while(performance.now()-t0 < ${secs*1000}){
        yaw += 0.004; __hcBR.face(yaw);                       // a slow constant turn, so new geometry keeps entering the frustum
        const t=await f(); const ms=t-last; last=t; d.push(ms);
        if(ms>20){ const s=(__hcBR.state&&__hcBR.state())||{}; hitch.push({ms:+ms.toFixed(1), x:s.x, z:s.z, loaded:s.loaded, rooms:s.rooms}); } }
      __hcBR.walk(false);
      d.splice(0,20); const n=d.length; d.sort((a,b)=>a-b);
      const q=f2=>+d[Math.min(n-1,Math.floor(n*f2))].toFixed(2);
      return { frames:n, median:q(0.5), p90:q(0.9), p99:q(0.99), worst:+d[n-1].toFixed(2),
               over20:hitch.length, over100:hitch.filter(h=>h.ms>100).length, hitches:hitch.slice(0,10) }; })()`;
    console.log('  overworld walk 20s     '+J(await ev(WALK(20),'walk-ow')));

    hr('WALKING THE HALLS');
    await ev('__hcBR.enter()'); await sleep(9000);
    console.log('  state                  '+J(await ev('__hcBR.state()','st')));
    await ev('__hcAUD.tap(true)');
    console.log('  backrooms walk 40s     '+J(await ev(WALK(40),'walk-br')));

    hr('WHAT IT SOUNDED LIKE');
    console.log('  buses inside           '+J(await ev('__hcAUD.buses()','buses')));
    console.log('  emitter census         '+J(await ev('__hcAUD.census()','census')));

    hr('AND NO WRETCH');
    console.log('  wretch                 '+J(await ev('__hcBR.wretchState()','wr')));

    hr('DOORFRAMES, RE-MEASURED AFTER MESHES EXIST');
    console.log('  doorFrames             '+J(await ev('__hcBR.doorFrames()','df')));

    hr('PAGE ERRORS');
    console.log(errs.length? errs.slice(0,12).map(e=>'  '+e).join('\n') : '  none');
    console.log('\nHEAD '+HEAD);
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
