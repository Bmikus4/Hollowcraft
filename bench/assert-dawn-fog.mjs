// AT DAWN AND DUSK THE FOG THE LAND FADES INTO IS THE SAME COLOUR AS THE SKY BEHIND IT.
//
// Plan §4 Tier 1 item 3. The item is written as "fog colour from _uSky", and that source turns out to be the wrong one — see
// the note in updateSky. _uSky is a straight value ramp on `day`, setRGB(lerp(0.12,0.60,day), lerp(0.15,0.68,day),
// lerp(0.20,0.78,day)): a blue-grey with no dawn or dusk hue in it at all, and a NIGHT value of 0.12/0.15/0.20 against the fog's
// 0.0018 floor. Taking the fog from it would brighten night by two orders of magnitude — the one thing Ben has objected to four
// separate times — and still not fix the drift, because there is no warmth in it to inherit.
//
// The drift is a HUE difference at grazing sun: distant land fades toward a neutral value ramp while the sky above it is orange.
// So it is measured as warmth, (R-B)/(R+B), sampled from two crops in ONE frame:
//   - the sky just above the horizon on the sun's side
//   - the most distant land, just below it, which is fully fog-washed and therefore IS the fog colour
// A single frame means the sun cannot move between the two samples, which is the confound §7 warns about.
//
//   node bench/assert-dawn-fog.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// Mean RGB over a crop, and its WARMTH — (R-B)/(R+B). Warmth rather than hue angle because it is stable when a crop is nearly
// grey, which the fog is: a hue angle on a neutral colour is numerical noise.
function tone(file, crop){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  let r=0,g=0,b=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch; r+=P.data[i]; g+=P.data[i+1]; b+=P.data[i+2]; n++; }
  r/=n; g/=n; b/=n;
  return { rgb:[Math.round(r),Math.round(g),Math.round(b)], warmth:+((r-b)/Math.max(1,r+b)).toFixed(4), lum:+(0.2126*r+0.7152*g+0.0722*b).toFixed(1) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    // HIGH OVER LAND, so the lower half of the frame is distant fog-washed forest rather than nearby detail or sea.
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // HIGH ENOUGH THAT NOTHING STANDS ON THE HORIZON. At gy+34 the dawn sky crop came back rgb(49,40,31) against dusk's
    // rgb(220,189,167) at the same sun elevation — it was sampling a warm-lit hillside to the east, not the sky, because the
    // crop is fixed in screen space while the skyline is not. Terrain silhouettes drop below the horizon from up here.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+150}, ${S.sz}+0.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);

    // A GRAZING SUN, searched for rather than assumed. Mapped this world's clock against __hc.sunDir().elevDeg at 40 steps:
    // t=0 is SUNRISE (0.06 deg), t=0.25 is noon (70.7), t=0.5 is sunset (-0.05), t=0.75 is midnight. The comment on setTime says
    // "0=midnight, 0.5=noon" and it is wrong by a quarter turn, which is why the first version of this list sampled 0.24-0.76 and
    // found nothing lower than 63 degrees.
    const rows=[];
    for(const t of [0.004,0.010,0.016,0.022,0.480,0.487,0.493,0.497]){
      await page.evaluate(`__hc.setTime(${t})`); await sleep(450);
      const s=await page.evaluate(`__hc.sunDir()`);
      if(!(s.elevDeg>0.5 && s.elevDeg<9)) continue;
      await page.evaluate(`__hc.cam({yaw:${s.yawToSun}, pitch:0.03})`); await sleep(450);
      // THE SKY IS BAKED INTO A CUBEMAP AND THE BAKE IS NOT IMMEDIATE. With a 450ms settle the first samples after a clock jump
      // came back with the PREVIOUS sky still in the background: the dawn rows read a sky of rgb(49,40,31) against dusk's
      // rgb(220,189,167) at the same sun elevation, which is impossible in a world whose sky is a function of elevation alone —
      // and it showed up as a 0.09 dawn "gap" while the fog colour either side of it was identical to two digits.
      await page.evaluate(`__hc.setTime(${t})`); await sleep(1700); await page.evaluate(`__hc.setTime(${t})`); await sleep(300);
      const f=path.join(OUT,`dawnfog-t${String(t).replace('.','')}.png`);
      await page.screenshot({path:f});
      // THE FOG COLOUR ITSELF, from the uniform, against the sky band just above the horizon. Sampling distant LAND instead was
      // the first attempt and it does not isolate the claim: at a grazing sun that land is backlit, so it is legitimately dark
      // and legitimately lit by the blue sky rather than by the warm sun — measured rgb(73,85,101) against a fog colour whose
      // own value ramp was at 0.42 linear. Most of that gap was shading, not the fog's hue.
      const sky=tone(f,[0.32,0.68,0.28,0.40]);
      const hz=await page.evaluate(`__hc.horizonDbg()`);
      const fr=parseInt(hz.fogCol.slice(0,2),16), fg=parseInt(hz.fogCol.slice(2,4),16), fb=parseInt(hz.fogCol.slice(4,6),16);
      const fogWarm=+((fr-fb)/Math.max(1,fr+fb)).toFixed(4);
      rows.push({t, elev:s.elevDeg, sky, fog:[fr,fg,fb], fogWarm, gap:+(sky.warmth-fogWarm).toFixed(4)});
      console.log(`  t=${t} sun ${String(s.elevDeg).padStart(5)}deg   sky rgb(${sky.rgb}) warmth ${sky.warmth}   fog #${hz.fogCol} warmth ${fogWarm}   gap ${(sky.warmth-fogWarm).toFixed(4)}`);
    }
    if(!rows.length){ check('a grazing sun was found', false, 'no sampled hour put the sun between 0.5 and 9 degrees'); console.log(`\n${checks-fails}/${checks} checks pass`); process.exit(1); }
    const worst=rows.reduce((a,b)=>Math.abs(b.gap)>Math.abs(a.gap)?b:a);
    console.log(`  widest gap: ${worst.gap} at t=${worst.t} (sun ${worst.elev} deg)`);
    // THE CLAIM: at a grazing sun the land's fog must carry most of the sky's warmth. 0.03 of warmth is about 8 levels of R over
    // B at these luminances — visible as a grey band under an orange sky, which is the drift the item exists for.
    check('the fog carries the sky\'s dawn warmth', Math.abs(worst.gap) < 0.030, `widest sky-to-land warmth gap ${worst.gap}`);

    // THE TWO GUARDS THAT MATTER MORE THAN THE FEATURE. The grazing term is pow(clamp(1-|elev|/0.22),1.6), which clamps to
    // exactly 0 once the sun is more than 12.6 degrees from the horizon, so noon and midnight must be untouched to the digit.
    // Night especially: the fog's night floor is the subject of four separate rounds of Ben asking for black, and a tint applied
    // there would undo all of them.
    const at=async(t)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(900);
      const hz=await page.evaluate(`__hc.horizonDbg()`); const s=await page.evaluate(`__hc.sunDir()`);
      const r=parseInt(hz.fogCol.slice(0,2),16), g=parseInt(hz.fogCol.slice(2,4),16), b=parseInt(hz.fogCol.slice(4,6),16);
      return { hex:hz.fogCol, elev:s.elevDeg, warmth:+((r-b)/Math.max(1,r+b)).toFixed(4), lum:+(0.2126*r+0.7152*g+0.0722*b).toFixed(1) }; };
    const noon=await at(0.25), mid=await at(0.75);
    console.log(`  noon     sun ${noon.elev}deg  fog #${noon.hex} warmth ${noon.warmth} lum ${noon.lum}`);
    console.log(`  midnight sun ${mid.elev}deg  fog #${mid.hex} warmth ${mid.warmth} lum ${mid.lum}`);
    // ASSERTED AS "NOT WARMED", not as "neutral". The untinted ramp is not neutral at either hour and never was: noon measures
    // -0.0087 because the blue channel carries dcol*1.04, and midnight measures -0.294 because the night floor
    // (0.0018, 0.0022, 0.0034) is deliberately blue-dominant — that hair of blue is the reason there IS a floor, or distant
    // chunks read as void-black holes rather than unlit mass. Both were exactly these values before the tint existed. Since the
    // tint can only ADD warmth, "warmth is still negative" is the proof that it did not apply.
    check('noon fog is not warmed',     noon.warmth <= 0, `warmth ${noon.warmth} at ${noon.elev} degrees, the ramp's own -0.0087`);
    check('midnight fog is not warmed', mid.warmth <= 0, `warmth ${mid.warmth} at ${mid.elev} degrees, the night floor's own -0.294`);
    check('and night is still black',  mid.lum < 12, `night fog luminance ${mid.lum}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/dawnfog-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
