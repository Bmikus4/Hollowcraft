// THE BACKROOMS, END TO END, AS NUMBERS. Ben 08-04: "make the backrooms generate with working lights, doors, all of its
// rooms, lighting, proper sounds (no drops, ambience other than backrooms allocated, and no wretch), also lag free. Also
// make the portal, and spawning the portal completely lag free."
//
// This is a DIAGNOSTIC, not an assert family. It fails nothing and it fixes nothing; it prints the state of every one of
// those seven requirements in one run so the broken-list is evidence rather than a reading of the code. The asserts come
// after, one per defect that this actually finds — writing them first would be writing tests for bugs I have imagined.
//
// EVERY RUN STAMPS HEAD. Three sessions share this checkout and index.html moved under me once already today (ce38c53 ->
// c5ff6e6 inside twenty minutes, neither commit mine). A frame time without a hash beside it cannot be compared to
// anything later, so the hash is printed first and belongs in any before/after I quote.
//
// VSYNC IS OFF, deliberately (--disable-gpu-vsync --disable-frame-rate-limit). An earlier sweep on this codebase reported
// 6.94 ms at three different settings, which is 1000/144 exactly: it was measuring the display and would have called any
// cost free.
//
// usage: node bench/br-baseline.mjs
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
  const dirty=execSync('git status --porcelain index.html',{cwd:ROOT}).toString().trim();
  console.log('HEAD '+HEAD+(dirty?'  (index.html DIRTY — this is a working-tree measurement, not a commit measurement)':'  (index.html clean)'));

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
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,220)));
    page.on('console',m=>{ const t=m.text(); if(/error|crash|backrooms/i.test(t)) errs.push('console: '+t.slice(0,220)); });
    const ev=async(js,tag)=>{ try{ return await page.evaluate(js); }catch(e){ return {err:String(e.message||e).slice(0,160), at:tag}; } };

    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(7000);
    await ev('__hc.cmdRun("/gamemode creative")');
    await ev('__hc.setTime(0.42)');

    // ---- frame time helper. 110 frames, first 20 discarded (the settle), sorted. worst is kept because the portal defect
    // that mattered was ONE 363 ms frame that no median could ever see.
    const FR=`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
      let last=await f(); const d=[];
      for(let i=0;i<110;i++){ const t=await f(); d.push(t-last); last=t; }
      d.splice(0,20); d.sort((a,b)=>a-b);
      return { median:+d[d.length>>1].toFixed(2), p90:+d[Math.floor(d.length*0.9)].toFixed(2),
               p99:+d[Math.floor(d.length*0.99)].toFixed(2), worst:+d[d.length-1].toFixed(2) }; })()`;

    hr('0 · OVERWORLD REFERENCE');
    // Without this the Backrooms frame time has nothing to be judged against — "9 ms" is only bad if the same machine
    // renders the island in 6.
    console.log('  overworld frame      '+J(await ev(FR,'fr-overworld')));
    console.log('  overworld buses      '+J(await ev('__hcAUD.buses()','buses-ow')));

    hr('1 · PORTAL — SPAWN COST AND FIRST LOOK');
    // The spawn itself. Ben names "spawning the portal" separately from the portal, so it is timed separately: this is the
    // one synchronous call, measured on the main thread the way the player pays for it.
    const spawnCost=await ev(`(()=>{ const t0=performance.now(); let r=null;
        try{ r=__hcBR.door(); }catch(e){ return {err:String(e.message||e)}; }
        return { ms:+(performance.now()-t0).toFixed(2), door:!!r }; })()`,'spawn');
    console.log('  brSpawnDoorNearPlayer  '+J(spawnCost));
    await sleep(3000);
    console.log('  door sited             '+J(await ev('__hcBR.doorAt()','doorAt')));
    // THE FIRST LOOK is the measurement that found the real portal defect last time; a steady-state median called it healthy
    // all along. Reset the counter only after settling, or the settle frames are counted as portal renders.
    await ev('__hcBRX.portalProbe("facing")');
    await sleep(600);
    const firstLook=await ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
        let last=await f(); let worst=0, at=-1;
        for(let i=0;i<90;i++){ const t=await f(); const d=t-last; last=t; if(d>worst){worst=d;at=i;} }
        return { worstMs:+worst.toFixed(2), atFrame:at }; })()`,'firstlook');
    console.log('  first look at the door '+J(firstLook));
    await sleep(2000);
    await ev('__hcPERF.portalRate(true)');
    console.log('  portal steady facing   '+J(await ev(FR,'fr-portal')));
    console.log('  portal render rate     '+J(await ev('__hcPERF.portalRate()','rate')));
    console.log('  gpu split              '+J(await ev('__hcPERF.gpu()','gpu')));

    hr('2 · ENTERING THE HALLS');
    await ev('__hcAUD.tap(true)');
    const enterCost=await ev(`(()=>{ const t0=performance.now(); try{ __hcBR.enter(); }catch(e){ return {err:String(e.message||e)}; }
        return { ms:+(performance.now()-t0).toFixed(2) }; })()`,'enter');
    console.log('  brEnter cost           '+J(enterCost));
    await sleep(9000);
    console.log('  inside                 '+J(await ev('(()=>{ try{ return {inside:!!BR.inside}; }catch(e){ return {err:String(e.message||e)}; } })()','inside')));

    hr('3 · DOES IT GENERATE — ROOMS, DOORS, FIXTURES');
    console.log('  roomCensus             '+J(await ev('__hcBR.roomCensus()','census')));
    console.log('  rooms/walls/doors      '+J(await ev('__hcBR.rooms()','rooms')));
    console.log('  doorFrames             '+J(await ev('__hcBR.doorFrames()','frames')));

    hr('4 · LIGHTS');
    // litNear is the number that matters and the one that has lied before: it sat pinned at 16 while 213 fixtures hung on
    // the ceilings. Read the pool size WITH it, or a saturated pool reads as a healthy one.
    console.log('  light pool             '+J(await ev('__hcPERF.lightPool()','pool')));
    console.log('  standing in a lit room '+J(await ev('__hcBR.goLit(0)','goLit')));
    await sleep(2500);
    console.log('  lights from in there   '+J(await ev('__hcPERF.lightPool()','pool2')));
    console.log('  buses from in there    '+J(await ev('__hcAUD.buses()','buses-lit')));

    hr('5 · DOORS ACTUALLY OPEN');
    // The REAL right-click path, not a direct state poke. faceOpening puts the player square-on to the nearest door first,
    // because useDoor's own ray is what is being tested and it needs something in front of it.
    console.log('  face a door            '+J(await ev('__hcBR.faceOpening("door",2.4)','face')));
    await sleep(900);
    console.log('  right-click it         '+J(await ev('__hcBR.useDoor()','use')));
    await sleep(1400);
    console.log('  and again (shut it)    '+J(await ev('__hcBR.useDoor()','use2')));

    hr('6 · FRAME TIME INSIDE THE HALLS');
    console.log('  standing               '+J(await ev(FR,'fr-br')));
    // WALKING is the honest number. Standing still never crosses a chunk boundary, and brxStream is where the Backrooms
    // spends: a standing median can be healthy while every doorway costs a hitch.
    const walk=await ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
        let last=await f(); const d=[];
        for(let i=0;i<200;i++){ try{ __hcBR.tp((i*3)%180, ((i*7)%180)); }catch(e){}
          const t=await f(); d.push(t-last); last=t; }
        d.splice(0,20); d.sort((a,b)=>a-b);
        return { median:+d[d.length>>1].toFixed(2), p90:+d[Math.floor(d.length*0.9)].toFixed(2),
                 p99:+d[Math.floor(d.length*0.99)].toFixed(2), worst:+d[d.length-1].toFixed(2) }; })()`,'fr-walk');
    console.log('  teleport-streaming     '+J(walk));

    hr('7 · SOUND — THE SEAL, AND WHAT IT LET THROUGH');
    console.log('  buses inside           '+J(await ev('__hcAUD.buses()','buses-in')));
    console.log('  emitter census         '+J(await ev('__hcAUD.census()','census-aud')));

    hr('8 · NO WRETCH');
    console.log('  wretch state           '+J(await ev(`(()=>{ try{ return { active:!!wretch.active, vis:!!(wretch.group&&wretch.group.visible),
        dist:+(wretch.dist||0).toFixed(1), state:String(wretch.state||''), extras:(typeof wretchExtra!=='undefined'?wretchExtra.length:null),
        grabbed:!!player.grabbed }; }catch(e){ return {err:String(e.message||e)}; } })()`,'wretch')));

    hr('9 · LEAVING, AND THE WAY BACK');
    console.log('  brExit cost            '+J(await ev(`(()=>{ const t0=performance.now(); try{ __hcBR.exit(); }catch(e){ return {err:String(e.message||e)}; }
        return { ms:+(performance.now()-t0).toFixed(2) }; })()`,'exit')));
    await sleep(4000);
    console.log('  buses back outside     '+J(await ev('__hcAUD.buses()','buses-out')));
    console.log('  overworld frame after  '+J(await ev(FR,'fr-after')));

    hr('PAGE ERRORS');
    console.log(errs.length? errs.slice(0,14).map(e=>'  '+e).join('\n') : '  none');
    console.log('\nHEAD '+HEAD+' — quote this hash with any number above.');
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
