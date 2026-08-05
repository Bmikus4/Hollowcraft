// THE MOON LAYS A GLINTING PATH ON THE WATER, AND IT SURVIVES DEEP WATER.
//
// Plan §4 Tier 1 item 1. Two faults, both already written down in the plan and both invisible without a measurement:
//   1. THE SIGN. uMoonDir points FROM the surface TOWARD the moon, so the arriving ray is -uMoonDir and the mirror direction is
//      reflect(-uMoonDir, N). The shader had reflect(-normalize(-uMoonDir), N) — a double negative that cancels — so the lobe
//      pointed down into the water, dot(Rm,V) was negative for any camera above the surface, max(...,0) zeroed it, and night
//      water had no specular at all. The sun's version had the same bug (dc71963).
//   2. THE ORDER. It was added BEFORE the Beer-Lambert absorption, which mixes 97% of the way to near-black in deep water. A
//      reflection lives ON the surface and does not care how deep the water under it is; added before, the deep sea erases it.
//
// Measured as a PAIRED LOOK in one page: the same water, the same second, the same clock, once with the camera aimed at the
// moon's reflection and once 90 degrees away in yaw. The glade is a view-dependent lobe, so that difference IS the feature,
// and it needs no PERF flag to toggle. A same-yaw pair is taken FIRST as the floor, because ripples move between any two
// frames.
//
//   node bench/assert-moonglade.mjs
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
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
// The water in the lower middle of the frame: its mean, and its BRIGHT TAIL. A glitter path is a scatter of bright ripple
// faces, so the 98th percentile moves far more than the mean and is what separates a track from a wash.
function water(file){
  const P=decodePNG(fs.readFileSync(file));
  // JUST THE WATER AROUND THE CROSSHAIR, where the mirror direction lands when pitch = -elevation. The first crop reached to
  // 0.92 of the frame height and swallowed the hotbar, the compass and the held item: those are static, so all three frames
  // reported an identical mean, p98 and max, and the run produced a red that was really a crop of the HUD.
  // Starting at 0.54 rather than 0.50 keeps the CROSSHAIR out of it — a static white glyph at frame centre, which is why the
  // baseline run reported an identical `max` of 218.6 in all three frames.
  const x0=(P.w*0.32)|0,x1=(P.w*0.68)|0,y0=(P.h*0.54)|0,y1=(P.h*0.80)|0;
  const v=[]; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch));
  v.sort((a,b)=>a-b);
  const mean=v.reduce((a,b)=>a+b,0)/v.length;
  return { mean:+mean.toFixed(2), p98:+v[(v.length*0.98)|0].toFixed(1), max:+v[v.length-1].toFixed(1), n:v.length };
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
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });   // §7: grain alone moves a sixth of the screen
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    // A NIGHT WITH THE MOON ACTUALLY UP. uDay is a daylight amount, not the clock (§7), and the moon is not simply opposite the
    // sun at every hour, so the hour is SEARCHED for one where the moon is well above the horizon rather than assumed.
    let T=null, sd=null;
    for(const t of [0.0,0.04,0.08,0.92,0.96,0.86,0.12,0.16]){
      await page.evaluate(`__hc.setTime(${t})`); await sleep(500);
      const s=await page.evaluate(`__hc.sunDir()`);
      if(s.moonElevDeg!=null && s.moonElevDeg>12 && s.day<0.10){ T=t; sd=s; break; } }
    if(T===null){ check('a night with the moon up exists', false, 'no sampled hour had the moon above 12 degrees with uDay under 0.10'); console.log(`\n${checks-fails}/${checks} checks pass`); process.exit(1); }
    console.log(`  t=${T}: uDay ${sd.day}, moon ${sd.moonElevDeg} deg up, yawToMoon ${sd.yawToMoon}`);
    const HOLD=`__hc.setTime(${T});`;

    // DEEP OPEN WATER, so the claim covers the fault that the absorption erased the highlight. Out past the coast on the
    // wettest bearing, a few blocks above the surface.
    const isle=await page.evaluate(`__hc.isleStats()`);
    const spot=await page.evaluate(`(()=>{ const s=__hc.isleStats(); const sea=__hc.probe().sea;
      for(let d=s.R+40; d<s.R+900; d+=40){ for(let k=0;k<12;k++){ const a=k/12*6.2832;
        const x=Math.round(s.x+Math.cos(a)*d), z=Math.round(s.z+Math.sin(a)*d);
        if(__hc.groundY(x,z) < sea-6) return {x,z,sea}; } } return null; })()`);
    if(!spot){ check('deep water was found', false, 'no cell more than 6 below sea level within 900 of the coast'); console.log(`\n${checks-fails}/${checks} checks pass`); process.exit(1); }
    console.log(`  deep water at (${spot.x}, ${spot.z}), sea ${spot.sea}`);
    await page.evaluate(`__hc.tpAt(${spot.x}+0.5, ${spot.sea}+7, ${spot.z}+0.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2200);

    // PITCH = MINUS THE ELEVATION (§7). The reflection of a body 30 degrees up lies 30 degrees DOWN.
    const look=async(yaw,pitch,name)=>{ await page.evaluate(HOLD+`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(420);
      await page.evaluate(HOLD); await sleep(120); const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };
    const yawM=sd.yawToMoon, pitchM=-sd.pitchToMoon;

    // CONTROL FIRST: the same aim twice. Ripples drift and the water animates, so this is the floor every claim below is
    // measured against.
    const a1=await look(yawM, pitchM, 'moonglade-a1.png');
    const a2=await look(yawM, pitchM, 'moonglade-a2.png');
    const A1=water(a1), A2=water(a2);
    const floorMean=Math.abs(A2.mean-A1.mean), floorP98=Math.abs(A2.p98-A1.p98);
    console.log(`  control, same aim twice:  mean ${A1.mean} vs ${A2.mean}   p98 ${A1.p98} vs ${A2.p98}   → floor ${floorMean.toFixed(2)} / ${floorP98.toFixed(1)}`);

    const away=await look(yawM+Math.PI/2, pitchM, 'moonglade-away.png');
    const AW=water(away);
    console.log(`  aimed AT the reflection: mean ${A1.mean}  p98 ${A1.p98}  max ${A1.max}`);
    console.log(`  aimed 90 deg away:       mean ${AW.mean}  p98 ${AW.p98}  max ${AW.max}`);

    const dMean=A1.mean-AW.mean, dP98=A1.p98-AW.p98;
    check('the water is brighter toward the moon',   dMean > Math.max(0.5, floorMean*3), `${dMean.toFixed(2)} levels of mean against a floor of ${floorMean.toFixed(2)}`);
    // A TRACK, NOT A WASH: the bright tail has to move more than the mean, because a glitter path is a scatter of lit ripple
    // faces rather than a uniform lift. This is also what tells a specular lobe from the sky simply being brighter that way.
    check('and it is a glitter track, not a wash',   dP98 > Math.max(1.0, dMean*1.5), `p98 up ${dP98.toFixed(1)} against a mean of ${dMean.toFixed(2)}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/moonglade-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
