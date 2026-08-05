// THE ATTRIBUTABLE RUN. Everything before this measured a working tree carrying two other sessions' uncommitted work
// (19172's coloured per-chunk light, a third session's ICBM), so no number from it could be pinned to a cause.
//
// HC_ROOT points at a `git archive <hash>` extraction plus MY PROBES ONLY. That is the whole point: the tree is a commit
// with instrumentation, not a shared working copy that changes under the measurement.
//
// THE ARM ORDER IS DELIBERATELY ADVERSARIAL. The earlier run walked the overworld first, so the Backrooms inherited a warm
// engine — warm shader cache, warm GPU clocks, allocated buffers — and "the halls are faster" could have been nothing but
// that. Here the BACKROOMS GO FIRST and pay every cold cost, and the overworld inherits the warm engine. If the halls still
// win in that order the result is real; if they lose, the earlier claim was an order effect and I withdraw it.
// Each arm additionally discards its first 5 s.
//
// usage: HC_ROOT=<pinned> node bench/br-pinned.mjs
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
const hr=t=>console.log('\n=== '+t+' '.repeat(Math.max(0,56-t.length))+'===');

// 5 s of every arm is thrown away INSIDE the page, not trimmed afterwards, so the discarded frames never enter the sort.
const WALK=(secs)=>`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
  __hcBR.walk(true,true); let last=await f(); const d=[], hitch=[]; const t0=performance.now();
  let yaw=0;
  while(performance.now()-t0 < ${secs*1000}){
    yaw += 0.004; __hcBR.face(yaw);
    const t=await f(); const ms=t-last; last=t;
    if(performance.now()-t0 < 5000) continue;                 // the warm-up is discarded, not merely down-weighted
    d.push(ms);
    if(ms>20){ const s=(__hcBR.stat2&&__hcBR.stat2())||{}; hitch.push({ms:+ms.toFixed(1), x:s.x, z:s.z, loaded:s.loaded}); } }
  __hcBR.walk(false);
  const n=d.length; if(!n) return {err:'no frames'};
  d.sort((a,b)=>a-b); const q=f2=>+d[Math.min(n-1,Math.floor(n*f2))].toFixed(2);
  return { frames:n, median:q(0.5), p90:q(0.9), p99:q(0.99), worst:+d[n-1].toFixed(2),
           over20:hitch.length, over100:hitch.filter(h=>h.ms>100).length, hitches:hitch.slice(0,6) }; })()`;

(async()=>{
  const HEAD=execSync('git rev-parse --short HEAD',{cwd:'D:/code/Minecraft'}).toString().trim();
  console.log('pinned tree: '+ROOT);
  console.log('extracted from: 69ccdea   (live checkout HEAD is now '+HEAD+')');
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
            '--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,220)));
    const ev=async(js,tag)=>{ try{ return await page.evaluate(js); }catch(e){ return {err:String(e.message||e).slice(0,160), at:tag}; } };

    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(6000);
    await page.mouse.click(640,360); await sleep(1200);          // real gesture → the AudioContext exists
    await ev('__hc.cmdRun("/gamemode creative")');

    hr('ARM 1 · THE HALLS, COLD');
    await ev('__hcBR.enter()'); await sleep(9000);
    console.log('  state                '+J(await ev('__hcBR.stat2()','st')));
    await ev('__hcAUD.tap(true)'); await ev('__hcBR.fluorLog(true)');
    console.log('  walk 40s             '+J(await ev(WALK(40),'br')));
    console.log('  draws inside         '+J(await ev('__hcBR.draws()','dbr')));

    hr('FLUORESCENTS — HOW MANY DISTINCT TUBES');
    console.log('  fluor census         '+J(await ev('__hcBR.fluorCensus()','fc')));
    console.log('  emitter census       '+J(await ev('__hcAUD.census()','ec')));
    console.log('  buses inside         '+J(await ev('__hcAUD.buses()','bi')));

    hr('DOORS — THE POPULATION BEHIND THE DISAGREEMENT');
    console.log('  doorPop              '+J(await ev('__hcBR.doorPop()','dp')));
    console.log('  doorFrames           '+J(await ev('__hcBR.doorFrames()','df')));

    hr('NO WRETCH');
    console.log('  wretch               '+J(await ev('__hcBR.wretchState()','wr')));

    hr('ARM 2 · THE OVERWORLD, WARM');
    await ev('__hcBR.exit()'); await sleep(6000);
    console.log('  walk 20s             '+J(await ev(WALK(20),'ow')));
    console.log('  draws outside        '+J(await ev('__hcBR.draws()','dow')));
    console.log('  buses outside        '+J(await ev('__hcAUD.buses()','bo')));

    hr('THE PORTAL — IS IT A SECOND FULL RENDER PASS');
    // Draw calls with the door OUT of view, then IN view. Doubling closes the diagnosis without any guessing.
    await ev('__hcBR.door()'); await sleep(3500);
    await ev('__hcBRX.portalProbe("behind")'); await sleep(2500);
    const behind=await ev('__hcBR.draws()','db');
    console.log('  draws, door behind   '+J(behind));
    await ev('__hcBRX.portalProbe("facing")'); await sleep(2500);
    const facing=await ev('__hcBR.draws()','df2');
    console.log('  draws, door facing   '+J(facing));
    if(behind&&facing&&behind.calls&&facing.calls)
      console.log('  RATIO facing/behind  '+(facing.calls/behind.calls).toFixed(2)+'x calls, '
        +(facing.tris/Math.max(1,behind.tris)).toFixed(2)+'x triangles');
    console.log('  portal rate          '+J(await ev('__hcPERF.portalRate()','pr')));

    hr('PAGE ERRORS');
    console.log(errs.length? errs.slice(0,12).map(e=>'  '+e).join('\n') : '  none');
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
