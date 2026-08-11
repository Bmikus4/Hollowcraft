// DO THE HANDS HAVE PHYSICS? (Ben 08-11: "when jumping around hands and items have no physics, jumping should bounce the
// hand, strafing should do the same.") Every claim here is a signed number off the hand spring, sampled per FRAME in the
// page — the effect is a half-second ring-down, so a screenshot cannot see it and a once-per-second poll would miss the
// peak entirely. The signs are the real test: a bounce that goes the wrong way is still a bounce.
//   BASELINE FIRST. The hands are never still (there is a breath term), so "it moved" proves nothing on its own; every
// amplitude below is judged against the same spring standing still in the same session.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d===undefined?null:d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d===undefined?null:d)); };

// Sample the spring for `frames` frames, holding `key` down for `holdFrames` of them. Returns the extremes of each channel.
// A REAL FUNCTION, NOT A STRING. Passed as a string, Playwright evaluates it as an expression, gets a function back,
// cannot serialise it, and hands you `undefined` — a sampler that appears to run and reports nothing.
/* eslint-disable no-undef */
const SAMPLER = (cfg)=>new Promise(res=>{
  const rows=[]; let i=0;
  if(cfg.key) __hc.key(cfg.key,true);
  const tick=()=>{ const h=__hc.handProbe();
    rows.push([h.y,h.sx,h.armX,h.armY,h.pvy,h.lat]);
    if(cfg.key && i===cfg.hold) __hc.key(cfg.key,false);
    if(++i<cfg.frames) requestAnimationFrame(tick);
    else { if(cfg.key) __hc.key(cfg.key,false);
      // PER PHASE, NOT OVER THE WHOLE WINDOW. Releasing the key decelerates the body, which kicks the spring the OTHER
      // way — so extremes taken across both phases are symmetric by construction and say nothing about direction. `acc`
      // is the frames the key was held; iMin/iMax carry the ORDER, which is the whole of "it bounces down FIRST".
      const ex=(k,a,b)=>{ const s=rows.slice(a,b).map(r=>r[k]);
        let mn=Infinity,mx=-Infinity,imn=-1,imx=-1;
        for(let j=0;j<s.length;j++){ if(s[j]<mn){mn=s[j];imn=j;} if(s[j]>mx){mx=s[j];imx=j;} }
        return { min:+mn.toFixed(4), max:+mx.toFixed(4), iMin:imn, iMax:imx }; };
      const hold=cfg.hold||rows.length;
      res({ n:rows.length, y:ex(0,0,rows.length), sx:ex(1,0,rows.length),
            accY:ex(0,0,hold), accSx:ex(1,0,hold),
            armX:ex(2,0,rows.length), armY:ex(3,0,rows.length), vy:ex(4,0,rows.length), lat:ex(5,0,rows.length) }); } };
  requestAnimationFrame(tick); });

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await sleep(3000);
    // physics() only runs while `locked`, which headless Chrome can never really acquire; and a held item is what the
    // report is about, so put something in the hand rather than measuring an empty fist.
    await page.evaluate('__hc.lock(true)');
    await page.evaluate('__hc.hold("stone_pickaxe")').catch(()=>{});
    await sleep(600);

    console.log('  probe  '+JSON.stringify(await page.evaluate('__hc.handProbe()')));
    const base0=await page.evaluate(SAMPLER,{frames:70,hold:0,key:null});
    console.log('  still  '+JSON.stringify(base0));
    const quietY=Math.max(Math.abs(base0.y.min),Math.abs(base0.y.max));
    const quietX=Math.max(Math.abs(base0.sx.min),Math.abs(base0.sx.max));
    ok('standing still, the spring is quiet', quietY<0.02 && quietX<0.006, {quietY,quietX});

    // ---- JUMP: the body's velocity goes UP, so the hands must lag DOWN first, then ring back ----
    const jump=await page.evaluate(SAMPLER,{frames:100,hold:6,key:'Space'});
    console.log('  jump   '+JSON.stringify(jump));
    ok('the jump kicks the hand spring',   Math.abs(jump.y.min)>Math.max(0.008,quietY*3), {min:jump.y.min, quietY});
    ok('and it bounces DOWN first',        jump.y.iMin < jump.y.iMax, {iMin:jump.y.iMin, iMax:jump.y.iMax});
    ok('it rings back the other way',      jump.y.max > 0.004,  {max:jump.y.max});
    ok('the arm actually carries it',      (jump.armY.max-jump.armY.min) > 0.02, jump.armY);
    ok('the player left the ground',       jump.vy.max > 3, jump.vy);

    // ---- STRAFE: accelerate right, and a carried load lags LEFT (-x). Then the mirror case, which is what proves it is
    //      inertia and not just "the hands move when you press a key".
    await sleep(700);
    const right=await page.evaluate(SAMPLER,{frames:80,hold:26,key:'KeyD'});
    console.log('  right  '+JSON.stringify(right));
    ok('strafing right moves the hands',   Math.abs(right.accSx.min)>Math.max(0.004,quietX*3), {min:right.accSx.min, quietX});
    ok('...and it moves them LEFT',        right.accSx.min < -0.008 && Math.abs(right.accSx.min)>right.accSx.max*2, right.accSx);
    ok('the lateral velocity was real',    right.lat.max > 1.5, right.lat);
    ok('both hands take it un-mirrored',   (right.armX.max-right.armX.min) > 0.008, right.armX);

    await sleep(900);
    const left=await page.evaluate(SAMPLER,{frames:80,hold:26,key:'KeyA'});
    console.log('  left   '+JSON.stringify(left));
    ok('strafing left moves them RIGHT',   left.accSx.max > 0.008 && left.accSx.max>Math.abs(left.accSx.min)*2, left.accSx);
    ok('the two strafes are opposite',     left.accSx.max>0 && right.accSx.min<0 && (left.lat.min<-1.5),
       {rightMin:right.accSx.min, leftMax:left.accSx.max, leftLat:left.lat.min});

    // ---- AND IT MUST NOT DRIFT. An impulse written into a spring that is never zeroed walks the hands off the screen;
    //      after everything above, the rest position has to be back where it started.
    await sleep(1600);
    const rest=await page.evaluate('__hc.handProbe()');
    console.log('  rest   '+JSON.stringify(rest));
    ok('the spring returns to rest', Math.abs(rest.sx)<0.004 && Math.abs(rest.y)<0.02, {sx:rest.sx,y:rest.y});
    ok('the arm is back at its base', Math.abs(rest.armX-0.32)<0.02, {armX:rest.armX});

    // ---- ADS: SLOWER, AND SMOOTH AT BOTH ENDS (Ben 08-11) ----
    // Sampled per frame, because the two properties asked for are properties of the CURVE and not of its endpoints: the
    // duration says "slower", and the shape of the per-frame steps says "smoother". An exponential approach spends its
    // largest step on frame ONE (a fifth of the travel) and crawls at the end; smoothstep's peak step is 1.5x its mean and
    // its first is near zero. So peak/mean is the number that separates the two, and it cannot be faked by slowing down.
    await page.evaluate('__hc.hold("ar15")').catch(()=>{});
    await sleep(500);
    const ads=await page.evaluate((()=>new Promise(res=>{
      const rows=[]; let i=0;
      __hc.aim(true);
      // TIMESTAMPS, NOT A FRAME COUNT. Headless Chrome has no vsync, so its rAF runs at whatever the GPU will give (measured
      // ~135 fps here) — counting frames and dividing by 60 reported a 0.42 s ramp as 0.95 s and would have had me "fixing"
      // a duration that was already right.
      const t0=performance.now();
      const tick=()=>{ rows.push([+(performance.now()-t0).toFixed(1), __hc.handProbe().ads]);
        if(++i<220) requestAnimationFrame(tick);
        else { __hc.aim(false); res(rows); } };
      requestAnimationFrame(tick); })));
    if(Array.isArray(ads) && ads.length>10){
      // Per-frame steps are normalised by their own frame time, so the shape test is a test of the CURVE and not of the
      // frame rate: at 135 fps every raw step is half what it is at 60, while step/dt is the same number on both.
      const steps=[]; for(let i=1;i<ads.length;i++){ const dv=ads[i][1]-ads[i-1][1], dtm=(ads[i][0]-ads[i-1][0])/1000;
        if(dv>0 && dtm>0 && ads[i-1][1]<0.99) steps.push(dv/dtm); }
      const full=ads.findIndex(r=>r[1]>=0.995);
      // THE 90th PERCENTILE, NOT THE MAXIMUM. The rate is dv/dt off two rAF timestamps, and one hitchy frame — a GC pause,
      // a chunk build — puts a single sample well above the curve however correct the curve is: measured 1.80 on one run and
      // 2.28 on the next from the same code. A percentile keeps the discrimination this test exists for (smoothstep peaks at
      // 1.5x its mean, the exponential approach it replaced peaked near 5x) without being decided by one frame.
      const sorted=steps.slice().sort((a,b)=>a-b);
      const mean=steps.reduce((a,b)=>a+b,0)/Math.max(1,steps.length), peak=sorted[Math.floor(sorted.length*0.9)]||0;
      const secs=full<0?null:+((ads[full][0]-ads[0][0])/1000).toFixed(2);
      console.log('  ads    '+JSON.stringify({secs, frames:full, fps:Math.round(1000*ads.length/(ads[ads.length-1][0]||1)),
        meanRate:+mean.toFixed(3), peakRate:+peak.toFixed(3), firstRate:+(steps[0]||0).toFixed(3),
        head:ads.slice(0,8).map(r=>+r[1].toFixed(3))}));
      ok('ADS takes longer than it did (>0.33 s)', secs!=null && secs>0.33, {secs});
      ok('...but is not sluggish (<0.60 s)',       secs!=null && secs<0.60, {secs});
      ok("the ramp has no snap: p90 step < 1.9x mean", peak < mean*1.9, {peak, mean, ratio:+(peak/mean).toFixed(2)});
      ok('and it eases IN, not from a standing jolt', (steps[0]||1) < mean*0.6, {first:steps[0], mean});
    } else ok('the ADS ramp was sampled', false, {ads:Array.isArray(ads)?ads.length:ads});

    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  if(errs.length) console.log('  page errors: '+JSON.stringify(errs.slice(0,5)));
  console.log((fails||errs.length?'FAIL ':'PASS ')+(checks-fails)+'/'+checks+' checks');
  process.exit(fails||errs.length?1:0);
})();
