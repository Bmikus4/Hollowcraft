// A THUNDERSTORM HAS DARK CLOUDS IN IT, AND ITS RAIN IS NOT THE BRIGHTEST THING IN THE FRAME.
//
// Plan §1 note 6 / Tier 2 item 7. Ben: "dark/overcast clouds on thunderstorms". updateSky already dims the sun, the hemi and
// the ambient by weather.overcast and greys the sun's colour, so the WORLD goes dark in rain — but the clouds' own value never
// saw it, so a storm read as a dim scene under a cheerful white sky. And the rain streaks drew at a fixed 0x9fb0c4 at every
// hour, so at night falling water was brighter than the sky behind it.
//
// Four claims:
//   1. Overcast darkens the clouds.
//   2. It darkens them MORE than the sky behind them — otherwise it is a brightness slider, not weather. This is the claim that
//      separates the two, and it is measured as the cloud-to-sky contrast, not as either one alone.
//   3. Clear weather is untouched, bit for bit: uOvercast is 0 there.
//   4. The rain streaks follow the air's value instead of a constant, and at night they are not brighter than the daytime air.
//
//   node bench/assert-storm-clouds.mjs
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
// THE CLOUDS AND THE SKY ARE SEPARATED BY VALUE, per frame, not by a fixed crop. A cloud crop cannot be chosen in advance: the
// field scrolls on real seconds and pinScene zeroes the cover, so where the cloud IS changes between runs. In a crop of sky
// with cloud in it the bright half is cloud and the dark half is air, so the split is that crop's own median: the mean of the
// pixels above it is the cloud, the mean below it is the sky, and their difference is the contrast that has to grow in a storm.
function cloudVsSky(file, crop){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  const v=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch));
  v.sort((a,b)=>a-b);
  const mid=v[v.length>>1];
  let hi=0,hn=0,lo=0,ln=0;
  for(const L of v){ if(L>=mid){ hi+=L; hn++; } else { lo+=L; ln++; } }
  return { cloud:+(hi/Math.max(1,hn)).toFixed(2), sky:+(lo/Math.max(1,ln)).toFixed(2),
           contrast:+((hi/Math.max(1,hn))-(lo/Math.max(1,ln))).toFixed(2), mid:+mid.toFixed(1) };
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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    // pinScene zeroes the cloud cover AND the overcast (plan §7), so both go back afterwards or this measures a clear sky and
    // reports the feature as inert.
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.vis({cloud:1.3});`);
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // High up, looking UP at the deck: the crop has to be cloud and air and nothing else — no terrain, no sea, no HUD.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+120}, ${S.sz}+0.5); __hc.cam({yaw:0.6, pitch:0.55});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);
    const SKY=[0.20,0.80,0.10,0.62];
    const shot=async(t,name)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(420); await page.evaluate(`__hc.setTime(${t})`); await sleep(220);
      const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };

    // ---- 1+2. THE DECK GOES DARK, AND MORE THAN THE AIR DOES --------------------------------------------------------------
    const at=async(oc,tag)=>{ await page.evaluate(`__hc.overcast(${oc})`); await sleep(300);
      const f=await shot(0.22,`storm-oc${String(oc).replace('.','p')}.png`);
      const r=cloudVsSky(f,SKY); const st=await page.evaluate(`__hc.overcast()`);
      console.log(`  overcast ${oc}:  cloud ${r.cloud}  sky ${r.sky}  contrast ${r.contrast}   (uOvercast ${st.uOvercast}, rain ${st.rainColor})`);
      return r; };
    const clear=await at(0,'clear');
    const storm=await at(0.9,'storm');
    await page.evaluate(`__hc.overcast(0)`);
    check('overcast darkens the clouds', storm.cloud < clear.cloud-6, `cloud side of the crop ${clear.cloud} -> ${storm.cloud} luminance`);
    // THE CLAIM THAT MAKES IT WEATHER. A global dimmer moves cloud and sky together and leaves the contrast alone; a storm deck
    // is darker THAN THE AIR, so the bright side has to fall toward the dark side.
    check('and it darkens them more than the sky behind them', storm.contrast < clear.contrast*0.75,
      `cloud-to-sky contrast ${clear.contrast} -> ${storm.contrast}; sky itself ${clear.sky} -> ${storm.sky}, which is deliberately barely touched`);

    // ---- 3. CLEAR WEATHER IS UNTOUCHED -----------------------------------------------------------------------------------
    const st0=await page.evaluate(`__hc.overcast()`);
    check('clear weather is bit-identical', st0.uOvercast===0, `uOvercast ${st0.uOvercast} with no storm — every term above multiplies by it`);

    // ---- 4. THE RAIN TAKES THE AIR'S VALUE -------------------------------------------------------------------------------
    // The streaks were a constant 0x9fb0c4 = rgb(159,176,196), luminance 175, at every hour. Read the material's colour at two
    // very different hours: it has to move, and the night value has to be well under the daytime air.
    const rainAt=async t=>{ await page.evaluate(`__hc.setTime(${t}); __hc.fog(0.1); __hc.overcast(0.8);`); await sleep(500);
      await page.evaluate(`__hc.setTime(${t})`); await sleep(600);
      const st=await page.evaluate(`__hc.overcast()`);
      const hex=st.rainColor.slice(1), r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16);
      const L=+(0.2126*r+0.7152*g+0.0722*b).toFixed(1);
      console.log(`  t=${t}: rain ${st.rainColor} (luminance ${L}), air ${st.fogColor}`);
      return L; };
    const dayRain=await rainAt(0.22), nightRain=await rainAt(0.75);
    await page.evaluate(`__hc.overcast(0); __hc.fog(0);`);
    check('the rain follows the hour instead of a constant', Math.abs(dayRain-nightRain)>25, `daytime streaks ${dayRain} luminance, night ${nightRain} — it was a fixed 175 at both`);
    // AN ABSOLUTE CEILING AT NIGHT, not a ratio to the day: at midnight the air itself reads luminance 7, so any visible streak
    // is a large multiple of it and a ratio test passes while the rain is still a white line. 60 is dim enough to read as water
    // catching what little light there is.
    check('and at night the streaks are not near-white', nightRain < 60, `${nightRain} luminance at midnight against ${dayRain} by day; it was a fixed 175 at both, and 111.6 at the first attempt`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/storm-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
