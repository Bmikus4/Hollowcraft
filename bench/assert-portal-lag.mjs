// THE PORTAL LAG. Ben: "portal lag".
//
// IT IS ONE FRAME, NOT A FRAME RATE. Measured before the fix: the frame the camera first swept past a Void Door was 363.97 ms
// and the frame after it 1.11 ms. Everything else about the portal was already healthy -- two gates (portalHz=120 with a
// move/turn override, and a behind-you half-space test) hold it to ~70 Hz while you face the door and to exactly 0 renders when
// you do not, and its steady-state frame cost measures inside the noise floor.
//
// The cause was not the compile storm it looked like: only ONE shader program compiled on that frame. brRenderPortal opened by
// generating the whole region and building every environment mesh in it -- brxGenerate() + brBuildEnvAll(), synchronously, inside
// the render call with the render target bound. Moved off that path the same work costs 13.5 ms.
//
// So the assertions are on the FIRST LOOK and on WHERE the build happens, not on median frame time -- a median called this
// healthy all along. Steady state is still measured, because it is what proves the two gates survived the change.
//
// VSYNC IS OFF. An earlier sweep on this codebase reported 6.94 ms at three different settings, which is 1000/144 exactly: it was
// measuring the display refresh rate and would have called any cost free.
//
// usage: node bench/assert-portal-lag.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d)); };

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
            '--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.42)');

    console.log('  door: '+JSON.stringify(await page.evaluate('(()=>{ try{ return __hcBR.door(); }catch(e){ return {err:String(e.message||e)}; } })()')));
    await sleep(4000);
    // __hcBR.portalProbe already places and aims the camera on the door's own axis, facing it or with its back to it. `player`
    // and `renderer` are module-scoped, so a harness cannot do either of those things for itself.
    const sample=async(facing,tag)=>{
      await page.evaluate('__hcBRX.portalProbe("'+(facing?'facing':'behind')+'")');
      await sleep(2600);
      await page.evaluate('__hcPERF.portalRate(true)');                          // reset the render counter AFTER settling
      const g0=await page.evaluate('__hcPERF.gpu()');
      const fr=await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
        let last=await f(); const d=[];
        for(let i=0;i<110;i++){ const t=await f(); d.push(t-last); last=t; }
        d.splice(0,20); d.sort((a,b)=>a-b);
        return { median:+d[d.length>>1].toFixed(2), p90:+d[Math.floor(d.length*0.9)].toFixed(2), worst:+d[d.length-1].toFixed(2) }; })()`);
      const rate=await page.evaluate('__hcPERF.portalRate()');
      const g=await page.evaluate('__hcPERF.gpu()');
      console.log('  '+tag.padEnd(14)+' frame '+String(fr.median).padStart(6)+'ms  p90 '+String(fr.p90).padStart(6)
        +'  worst '+String(fr.worst).padStart(7)
        +'   portal renders '+String(rate.renders).padStart(4)+' in '+rate.seconds+'s ('+rate.hz+'Hz)'
        +'   gpu portal '+g.portal+'ms of '+g.total+'ms  [ok='+g.ok+']');
      return { fr, rate, g };
    };

    // THE FIRST LOOK. The steady-state numbers below turn out to be a red herring; the first run of this recorded a single
    // 343.72 ms frame while facing the door. A frame that long is not fill cost, it is a shader compile — the portal renders the
    // whole scene through a second camera, and every material it touches that the main camera has not yet drawn compiles a fresh
    // program on that frame. So the program count is read with the door BEHIND the camera and again right after turning to it.
    await page.evaluate('__hcBRX.portalProbe("behind")'); await sleep(2500);
    const prog0=await page.evaluate('__hcPERF.programKeys().length');
    console.log('  warm state before the turn: '+JSON.stringify(await page.evaluate('__hcBRX.portalProbe()')));
    const firstLook=await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
      __hcBRX.portalProbe("facing");
      let last=await f(); const d=[];
      for(let i=0;i<70;i++){ const t=await f(); d.push(+(t-last).toFixed(2)); last=t; }
      return { worst:Math.max.apply(null,d), first8:d.slice(0,8) }; })()`);
    const prog1=await page.evaluate('__hcPERF.programKeys().length');
    const warmAfter=await page.evaluate('__hcBRX.portalProbe()');
    console.log('  warm state after  the turn: '+JSON.stringify(warmAfter));
    console.log('  FIRST LOOK at the door: worst frame '+firstLook.worst+'ms   first frames '+JSON.stringify(firstLook.first8));
    console.log('  shader programs '+prog0+' -> '+prog1+'   (+'+(prog1-prog0)+' compiled on the turn)');

    const a1=await sample(true, 'facing door');
    const b1=await sample(false,'back turned');
    const a2=await sample(true, 'facing again');
    const b2=await sample(false,'back again');

    const fA=(a1.fr.median+a2.fr.median)/2, fB=(b1.fr.median+b2.fr.median)/2;
    console.log('\n  facing median '+fA.toFixed(2)+'ms   away median '+fB.toFixed(2)+'ms   the portal costs '+(fA-fB).toFixed(2)+'ms of frame');
    console.log('  A/B/A/B drift: facing '+Math.abs(a1.fr.median-a2.fr.median).toFixed(2)+'ms, away '
      +Math.abs(b1.fr.median-b2.fr.median).toFixed(2)+'ms  — the noise floor for the number above');
    console.log('  renders while facing: '+a1.rate.renders+' / '+a2.rate.renders+'   while away: '+b1.rate.renders+' / '+b2.rate.renders
      +'   (away should be ~0 - that is the half-space gate working)');

    console.log('');
    // THE ONE THAT MATTERS: 363.97 ms before the fix, and 31.2 / 114.27 ms on two runs after it.
    //
    // The bound is 150 ms and NOT tighter, because this window does not belong to the portal alone. The back-turned samples
    // below render the portal exactly 0 times and still show worst frames of 32-41 ms, so the tail here is overworld streaming
    // after the camera is teleported, and a 90 ms bound made this red on a run whose portal was demonstrably fine. What pins the
    // actual fix is not this number but the two warm checks under it -- warms>=1 with warmMs 14.8 says the build happened off the
    // render path, which is the thing that was worth 350 ms.
    ok('turning to face the door does not stall the frame', firstLook.worst < 150,
      {worstMs:firstLook.worst, was:363.97, worldAloneWorst:Math.max(b1.fr.worst,b2.fr.worst)});
    ok('and nothing compiles on that turn either', (prog1-prog0) <= 2, {compiled:prog1-prog0});
    // WHERE the build happens IS the fix, and it is what a later edit would quietly undo. If brRenderPortal ever builds again the
    // warm counter stays at 0 while rooms appear anyway, so this catches the regression rather than only its symptom.
    ok('the region was built off the render path', warmAfter.warms>=1 && warmAfter.rooms>0, {warms:warmAfter.warms, rooms:warmAfter.rooms});
    ok('and the build itself is a cheap frame', warmAfter.warmMs!=null && warmAfter.warmMs<90, {warmMs:warmAfter.warmMs, insideRender:363.97});
    ok('the warm ran once, not once per frame', warmAfter.warms<=2, warmAfter.warms);
    ok('no build error was swallowed', !warmAfter.warmErr, warmAfter.warmErr);
    // The two gates the fix must not have broken.
    ok('the door still re-renders while you look at it', a1.rate.renders>20 && a2.rate.renders>20, {a:a1.rate.renders, b:a2.rate.renders});
    ok('and renders nothing at all with your back to it', b1.rate.renders===0 && b2.rate.renders===0, {a:b1.rate.renders, b:b2.rate.renders});
    // Steady state against its OWN noise floor: the facing-minus-away difference must not exceed the drift between two
    // same-facing samples, or "the portal is free once warm" is being read off noise.
    const drift=Math.max(Math.abs(a1.fr.median-a2.fr.median), Math.abs(b1.fr.median-b2.fr.median));
    ok('once warm the portal costs less than the measurement noise', (fA-fB) <= Math.max(drift,1.0),
      {facingMinusAway:+(fA-fB).toFixed(2), noiseFloor:+drift.toFixed(2)});

    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
