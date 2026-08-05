// THE SHAFTS ARE STRONGEST WITH A LOW SUN, AND THE PASS COSTS WHAT IT COSTS.
//
// Plan §4 Tier 1 item 5: "the pass is gated by quality only; shafts should be strongest at low sun, absent at noon". It was
// uStrength = 0.6*day, which peaks with the sun overhead — backwards. Crepuscular rays are a grazing-light phenomenon, and
// `day` measures only 0.5 at the horizon, so the old curve ran at HALF strength at the hour the effect is about and FULL at the
// hour it is not.
//
// Two claims, and the second is there because of the correction to §0. The plan's "a fragment effect costs hundredths" was
// re-measured on this box and is false at the water sites — GPU reads 4.83 ms of a 7.14 ms budget at the shore — so a
// full-screen pass gets priced rather than assumed, with a paired A/B in ONE page through __hc.godrays({on}). Disabling the
// pass is the right toggle: the composer skips a disabled pass entirely, where a uniform set to zero still pays for it.
//
//   node bench/assert-godray-elevation.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const med=a=>{ const s=[...a].sort((x,y)=>x-y); return s[s.length>>1]; };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    // HIGH QUALITY, or the pass is never built at all (it is gated to High/Ultra in buildComposer).
    await page.goto(base+'/index.html?debug=1&rd=8&perf=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const st0=await page.evaluate(`__hc.godrays()`);
    console.log('  pass state: '+JSON.stringify(st0));
    if(!st0.pass){ check('the god-ray pass exists at this quality', false, `quality ${st0.quality} — the pass is only built on High/Ultra`);
      console.log(`\n${checks-fails}/${checks} checks pass`); process.exit(1); }

    // THE CURVE, read off the live uniform at hours found by ELEVATION rather than by the clock. setTime's own comment is wrong
    // by a quarter turn on this world: t=0 is sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight.
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+6}, ${S.sz}+0.5)`); await sleep(1500);
    const samples=[];
    for(const t of [0.002,0.01,0.03,0.08,0.16,0.25,0.49,0.52,0.60,0.75]){
      // PIN THE PASS ON AT EVERY SAMPLE. Adaptive quality sheds god rays when fpsAvg drops (it does, during chunk streaming) and
      // restores them one ladder rung at a time only once fpsAvg recovers — and fpsAvg in a harness is throttled by the harness's
      // own awaits, so it never climbed back and all ten samples read enabled:false. That is an artefact of measuring, not a
      // statement about anyone's frame rate, so it must not be reported as one.
      await page.evaluate(`__hc.godrays({on:true}); __hc.setTime(${t});`); await sleep(320);
      const g=await page.evaluate(`(()=>{ const s=__hc.sunDir(); __hc.cam({yaw:s.yawToSun, pitch:0.05}); return __hc.godrays(); })()`);
      await sleep(220);
      const g2=await page.evaluate(`__hc.godrays()`);
      samples.push({t, elev:g2.elevDeg, day:g2.day, strength:g2.strength, enabled:g2.enabled, front:g2.front, z:g2.sunProjZ});
      console.log(`  t=${String(t).padEnd(5)} sun ${String(g2.elevDeg).padStart(7)}deg  day ${String(g2.day).padEnd(5)}  strength ${g2.strength}  enabled ${g2.enabled}  front ${g2.front} (projZ ${g2.sunProjZ}, camFar ${g2.camFar})  dayGate ${g2.dayGate}`);
    }
    const grazing=samples.filter(s=>s.elev>0 && s.elev<8);
    const high=samples.filter(s=>s.elev>55);
    const below=samples.filter(s=>s.elev<-4);
    const gMax=Math.max(...grazing.map(s=>s.strength));
    const hMax=high.length?Math.max(...high.map(s=>s.strength)):0;
    check('the pass exists and runs by day',     samples.some(s=>s.enabled), `enabled at ${samples.filter(s=>s.enabled).length} of ${samples.length} sampled hours`);
    check('shafts are strongest at a low sun',   gMax > hMax*2.5, `${gMax} at grazing against ${hMax} with the sun over 55 degrees`);
    check('noon is a floor, not a peak',         hMax > 0.05 && hMax < gMax*0.45, `${hMax} at noon — deliberately a floor rather than zero, see the note in the source`);
    check('nothing at all once the sun is down', below.every(s=>s.strength<0.01 || !s.enabled), below.map(s=>`${s.elev}deg:${s.strength}`).join(' '));

    // COST. Paired, in one page, alternating, at the forest — the site with canopy for the shafts to break through. The pass is
    // ENABLED/DISABLED rather than dialled to zero, because the composer skips a disabled pass and that is the real saving.
    const frames=async(ms)=>{ await page.evaluate(`__hc.setTime(0.03)`); await sleep(260);
      return page.evaluate(`(async()=>{ const t0=performance.now(), a=[]; let last=performance.now();
        while(performance.now()-t0 < ${ms}){ await new Promise(r=>requestAnimationFrame(r)); const n=performance.now(); a.push(n-last); last=n; }
        return a; })()`); };
    // WARM-UP PAIR DISCARDED, the same rule bench/perf-flag-ab.mjs states: first-encounter compiles and the adaptive ladder both
    // land on it. Measured here at +6.035 ms against -0.135 and -0.105 for the pairs after it, which is that effect exactly.
    await page.evaluate(`__hc.godrays({on:true})`); await frames(1500);
    await page.evaluate(`__hc.godrays({on:false})`); await frames(1500);
    const pairs=[];
    for(let i=0;i<3;i++){
      await page.evaluate(`__hc.godrays({on:true})`);  const on =med(await frames(2200));
      await page.evaluate(`__hc.godrays({on:false})`); const off=med(await frames(2200));
      pairs.push({on:+on.toFixed(3), off:+off.toFixed(3), delta:+(on-off).toFixed(3)});
      console.log(`  pair ${i+1}: rays ON ${on.toFixed(3)} ms  OFF ${off.toFixed(3)} ms   delta ${(on-off).toFixed(3)}`);
    }
    await page.evaluate(`__hc.godrays({on:true})`);
    const dMed=med(pairs.map(p=>p.delta));
    console.log(`  paired median cost of the pass: ${dMed.toFixed(3)} ms/frame at 1000x560`);
    // A CEILING, not a measurement. This rAF-delta method cannot resolve the pass: two of three pairs come back with the pass ON
    // running FASTER than OFF, which is what noise looks like, so the honest reading is "under the resolution of this method"
    // rather than the negative median it prints. The real number comes from the tool §5 names, with GPU timers and a discarded
    // warm-up pair:
    //   node bench/perf-flag-ab.mjs --onjs "window.__hc.godrays({on:true})" --offjs "window.__hc.godrays({on:false})" --site forest --pairs 4
    // which read frame 7.04 -> 7.21 ms, a paired median of +0.015 ms — free, in frame-time terms, at the forest. Its GPU column is
    // NOT quotable on this box: it swung 3.99->4.18 in one pair and 7.49->18.40 in the next, within the same condition.
    check('the pass is not a frame-time cost',   dMed < 0.7, `paired median ${dMed.toFixed(3)} ms across 3 pairs [${pairs.map(p=>p.delta).join(', ')}] — a ceiling, see the note above`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
