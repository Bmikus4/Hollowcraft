// A CLOUD CROSSING THE SUN PUTS IT OUT (Ben 08-04: "when clouds cross the sun the sun should hide itself").
//
// The sky shader already multiplied its additive layer — sun disc, moon, stars — by (1 - cloud*0.92). That reads as near-total
// occlusion and is not: the disc is added at FORTY times white, so the 8% remaining is still 3.2x white, a blazing disc through
// solid cover which the bloom pass then spreads. Now pow(1-cloud, 1.8).
//
// Measured by holding the SUN STILL and letting the cloud field drift across it. Cover is noise, so at any one instant the sun may
// sit in a gap — the claim is not "the sun is dark" but "the sun's brightness varies hugely with cover on, and does not with cover
// off". So: the peak luminance in a crop around the sun's screen position, sampled across a run of world times, twice —
// once with cloud cover at zero (the control: it must barely move) and once at full cover.
//
//   node bench/assert-sun-behind-cloud.mjs
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
// The brightest thing in the crop, and how much of the crop is blown out. Peak alone saturates at 255 whenever any sliver of disc
// survives; the blown-out AREA is what actually collapses when cover moves over it.
function sun(file, crop){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  let peak=0, hot=0, n=0, sum=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const L=lum(P.data,(y*P.w+x)*P.ch); n++; sum+=L;
    if(L>peak)peak=L; if(L>240)hot++; }
  return { peak:+peak.toFixed(1), hotPct:+(100*hot/n).toFixed(3), mean:+(sum/n).toFixed(2) };
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
    // pinScene() zeroes cloud cover (it pins weather for benching) — set cover explicitly per phase below.
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    // FACE THE SUN, well above the horizon so the crop is pure sky with no terrain in it.
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // WELL ABOVE THE SKYLINE. At gy+20 the crop came back as a dark forested hill with the sun's glow leaking over the ridge —
    // the disc was simply behind terrain, and the "identical peak in all 18 frames" that followed was 18 photographs of the same
    // hillside. Same trap as the dawn-fog harness: a screen-space crop samples whatever the skyline puts there.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+170}, ${S.sz}+0.5); __hc.setTime(0.08);`);
    for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1600);
    const aim=await page.evaluate(`(()=>{ const s=__hc.sunDir(); __hc.cam({yaw:s.yawToSun, pitch:s.pitchToSun}); return s; })()`);
    console.log(`  sun ${aim.elevDeg} deg up, centred in frame`);
    await sleep(700);
    const CROP=[0.36,0.64,0.30,0.70];

    // MOVE THE SUN THROUGH THE FIELD; do not wait for the field to move. The sky's cloud uv scrolls on uTime — REAL elapsed
    // seconds — at 0.006 per second, so nine samples 0.42 s apart advance it by 0.0025 of a field whose features are about a whole
    // uv unit across. The first version of this sweep stepped the game clock by 0.00025 of a day per sample and photographed the
    // SAME GAP nine times, then reported cover 1.6 as indistinguishable from a clear sky. Stepping across the morning instead
    // points the sun at nine genuinely different parts of the field, and the cover-0 control absorbs the fact that the disc's own
    // size and brightness change with elevation.
    const TIMES=[0.045,0.06,0.08,0.10,0.12,0.14,0.16,0.19,0.22];
    const sweep=async(cover,tag)=>{
      await page.evaluate(`__hc.vis({cloud:${cover}})`); await sleep(400);
      const out=[];
      for(let k=0;k<TIMES.length;k++){
        const t=TIMES[k];
        await page.evaluate(`__hc.setTime(${t})`); await sleep(300);
        await page.evaluate(`(()=>{ const s=__hc.sunDir(); __hc.cam({yaw:s.yawToSun, pitch:s.pitchToSun}); })()`);
        await page.evaluate(`__hc.setTime(${t})`); await sleep(320);
        const f=path.join(OUT,`suncloud-${tag}-${k}.png`); await page.screenshot({path:f});
        out.push(sun(f,CROP));
      }
      const peaks=out.map(o=>o.peak), hots=out.map(o=>o.hotPct);
      console.log(`  cover ${cover}: peak ${Math.min(...peaks)}..${Math.max(...peaks)}   blown-out area ${Math.min(...hots)}..${Math.max(...hots)}%   per sample [${hots.join(', ')}]`);
      return { peaks, hots, minHot:Math.min(...hots), maxHot:Math.max(...hots) };
    };

    const clear=await sweep(0,'clear');     // CONTROL FIRST: no cloud, so nothing may vary but noise
    const heavy=await sweep(1.6,'heavy');

    const clearSpan=clear.maxHot-clear.minHot;
    const heavySpan=heavy.maxHot-heavy.minHot;
    check('a clear sky holds the sun steady',    clearSpan < 0.35, `blown-out area varied by ${clearSpan.toFixed(3)}% of the crop with no cloud`);
    check('cover makes the sun come and go',     heavySpan > clearSpan*3, `varied by ${heavySpan.toFixed(3)}% under full cover, against ${clearSpan.toFixed(3)}% clear`);
    // AND AT ITS MOST COVERED THE DISC IS GONE, not merely dimmed. The old line left 3.2x white behind solid cloud; blown-out
    // area is the measure that collapses when it is truly occluded.
    check('at its most covered the disc is out',  heavy.minHot < Math.max(0.02, clear.minHot*0.25), `blown-out area bottoms at ${heavy.minHot.toFixed(3)}% under cover, against ${clear.minHot.toFixed(3)}% clear`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/suncloud-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
