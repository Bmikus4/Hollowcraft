// THE WHITE-SCREEN FREEZE ON LEAVING WATER.
//
// Ben 08-18: "when walking forward and exiting water, flying or swimming the game freezes and screen turns white."
// This drives the actual transition — hold W in the sea and walk up the beach — while watching three things a
// screenshot alone cannot separate: whether the page THREW, whether the frame went WHITE, and whether the frame
// clock STALLED. A freeze with a white frame is usually a dead frame, not a slow one: a shader that fails to
// compile draws nothing and its throw takes the rest of the update chain with it, which this file has been bitten
// by twice (the 08-12 sea/sky loss, and the `outc` undeclared case that failed assert-daylight-black).
//
//   node bench/tmp-water-exit-freeze.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
// ONE CASE PER PROCESS, because the stall is a FIRST-TIME cost: the first walk out of the sea took 1168ms and
// every later one in the same page took 49. Any bisect that runs the candidates as later cases in one session
// has already paid the cost in case one and will clear every suspect. --q adds query flags to the page URL.
const ARGV=process.argv.slice(2);
const QEXTRA=(()=>{ const i=ARGV.indexOf('--q'); return i<0?'':'&'+ARGV[i+1]; })();
const LABEL=(()=>{ const i=ARGV.indexOf('--label'); return i<0?'default':ARGV[i+1]; })();
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[];
    page.on('pageerror',e=>errs.push('THROW: '+String(e.message||e).slice(0,300)));
    page.on('console',m=>{ const t=m.text(); if(/error|shader|program|VALIDATE|compil|undeclared/i.test(t)) errs.push('CONSOLE: '+t.slice(0,300)); });
    await page.goto(base+'/index.html?debug=1&rd=10'+QEXTRA,{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.freezeAnimals(true); __hc.setTime(0.25); __hc.hzRuler(0);`);

    // A FRAME CLOCK ON THE PAGE. Sampling from node measures the round trip, not the game's own loop; this counts
    // rAF ticks and remembers the worst gap between them, which is what "freezes" has to mean.
    await page.evaluate(`(()=>{ window.__ft={n:0,worst:0,last:performance.now()};
      const tick=()=>{ const t=performance.now(); const d=t-window.__ft.last;
        if(window.__ft.n>0 && d>window.__ft.worst) window.__ft.worst=d;
        window.__ft.last=t; window.__ft.n++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick); })()`);

    // Find a beach and put the player in the SEA a little way off it, facing land.
    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    const spot=await page.evaluate(`(()=>{ for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){
        const x=Math.round(${IC.x}-d), z=${IC.z};
        if(__hc.groundY(x,z)>${SEA}) return {shoreX:x, z, g:__hc.groundY(x,z)}; } return null; })()`);
    console.log('shore', JSON.stringify(spot), 'sea', SEA);
    { const L=await page.evaluate('__hc.loadState()');
      console.log('warm  prewarm', L.prewarmMs+'ms', 'mat', L.matWarmMs+'ms', 'body', L.bodyWarmMs+'ms', 'bodyWarmRan', L.bodyWarm); }

    // walk-out is the case that stalls (1370ms). The last two are the bisect: the submerged branch of _ocean3
    // flips material.side and alpha and sets needsUpdate, which forces a synchronous program recompile at exactly
    // the moment Ben describes, and waterMat's colorWrite flips on the same transition.
    for(const [tag, startOff, extra] of [[LABEL, -14, '']]){
      // Reset: dry land first, then into the water, so each case makes the transition itself.
      await page.evaluate(`__hc.key('KeyW',false); __hc.tpAt(${spot.shoreX}+0.5, ${spot.g}+2, ${spot.z}+0.5); __hc.cam({yaw:0,pitch:0});`);
      await sleep(1200);
      if(extra) await page.evaluate(extra);
      await page.evaluate(`__hc.tpAt(${spot.shoreX}+(${startOff})+0.5, ${SEA}+0.5, ${spot.z}+0.5); __hc.cam({yaw:-1.5708,pitch:0});`);
      await sleep(1500);
      await page.evaluate('window.__ft.n=0; window.__ft.worst=0; window.__ft.last=performance.now();');
      const before=await page.evaluate('__hc.pos()');
      const nerr=errs.length;
      // WHICH PROGRAMS GET BUILT. The profile says the stall is three.js program setup (getParameters 1.34s +
      // getProgram 0.62s of a 9.2s recording); the cache keys say WHICH materials, which is what a warm-up has
      // to cover.
      const progBefore=await page.evaluate('window.__hcPERF.programKeys()');
      const lightsBefore=await page.evaluate('window.__hcPERF.lightCensus()');

      // WALK. yaw -pi/2 faces +X, which is toward the shore from a point at shoreX-14.
      await page.evaluate(`__hc.key('KeyW',true)`);
      let whiteAt=-1, worstSeen=0;
      for(let i=0;i<26;i++){
        await sleep(300);
        const s=await page.evaluate(`(()=>{ const c=document.querySelector('canvas');
          const g=document.createElement('canvas'); g.width=64; g.height=36;
          const x=g.getContext('2d'); x.drawImage(c,0,0,64,36);
          const d=x.getImageData(0,0,64,36).data; let s=0,n=0,mn=255,mx=0;
          for(let i=0;i<d.length;i+=4){ const L=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; s+=L; n++; if(L<mn)mn=L; if(L>mx)mx=L; }
          return { lum:+(s/n).toFixed(1), min:+mn.toFixed(1), max:+mx.toFixed(1),
                   ft:window.__ft.worst, frames:window.__ft.n, y:__hc.pos().y, x:__hc.pos().x }; })()`);
        worstSeen=Math.max(worstSeen,s.ft);
        // WHITE means bright AND flat: a sunlit beach is bright but has range in it.
        if(whiteAt<0 && s.lum>215 && (s.max-s.min)<26) whiteAt=i;
      }
      await page.evaluate(`__hc.key('KeyW',false)`);
      const after=await page.evaluate('__hc.pos()');
      const progAfter=await page.evaluate('window.__hcPERF.programKeys()');
      const lightsAfter=await page.evaluate('window.__hcPERF.lightCensus()');
      console.log('      lights before', JSON.stringify(lightsBefore).slice(0,300));
      console.log('      lights after ', JSON.stringify(lightsAfter).slice(0,300));
      const added=progAfter.filter(k=>!progBefore.includes(k));
      console.log(`      programs ${progBefore.length} -> ${progAfter.length}  (+${added.length})`);
      // WHICH FIELDS DIFFER. A three cacheKey is a comma-joined list of the material's program parameters, so the
      // nearest existing key of the same type plus the indices that differ names the FEATURE that is new, which is
      // far more use than 300 characters of mostly-identical booleans.
      for(const k of added.slice(0,6)){
        const f=k.split(','), type=f[0];
        let best=null, bestD=1e9;
        for(const o of progBefore){ const g=o.split(',');
          if(g[0]!==type || g.length!==f.length) continue;
          let d=0; for(let i=0;i<f.length;i++) if(f[i]!==g[i]) d++;
          if(d<bestD){ bestD=d; best=g; } }
        if(!best){ console.log(`        + ${type}: no same-shape ${type} program existed before`); continue; }
        const diffs=[];
        for(let i=0;i<f.length;i++) if(f[i]!==best[i]) diffs.push(`[${i}] ${best[i]||"''"} -> ${f[i]||"''"}`);
        console.log(`        + ${type}: ${bestD} field(s) differ from the nearest existing ${type}`);
        diffs.slice(0,8).forEach(d=>console.log('            '+d));
      }
      const f=path.join(OUT,`wexit-${tag}.png`); await page.screenshot({path:f});
      const newErrs=errs.slice(nerr);
      console.log(`  ${tag.padEnd(9)} x ${before.x.toFixed(1)} -> ${after.x.toFixed(1)}  y ${before.y.toFixed(1)} -> ${after.y.toFixed(1)}`
                + `  worstFrameGap ${worstSeen.toFixed(0)}ms  white ${whiteAt<0?'no':'at step '+whiteAt}  errors ${newErrs.length}`);
      newErrs.slice(0,4).forEach(e=>console.log('      '+e));
    }
    if(!errs.length) console.log('no page errors at all');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
