// THE TIME-OF-DAY GRADE — that the three anchors are real, that noon did not move, and that none of them crushes.
//
// Ben asked for "eye adaptation and a time-of-day grade". Adaptation is guarded by assert-daylight-black's exposure
// sweep. This is the grade half: noon, a low sun and midnight are three graded looks rather than one curve at three
// brightnesses, and the three things that can go wrong with that are all cheap to assert.
//
// 1. THE DAY ANCHOR MUST BE `nordic` TO THE DIGIT. The whole claim that this is safe rests on a noon frame being
//    bit-identical to the look Ben has signed off four times. If the day anchor drifts, that claim is gone and no
//    amount of "it looks fine" recovers it, so it is compared against the preset table itself rather than a literal
//    copied into this file — a copy would agree with a typo.
// 2. THE ANCHORS MUST ACTUALLY DIFFER. A grade that resolves to nearly the same numbers at all hours is the build
//    this replaced, and it would pass every check that only looks at noon. So the three are required to be far apart
//    on the dial that carries the look — temperature — and in the right ORDER: a low sun is warm, midnight is cold.
// 3. IT MUST NOT MANUFACTURE BLACK PIXELS, at any hour. Measured as an A/B against the pre-feature build rather than
//    against an invented ceiling: `__hc.tod({k:0})` is the old look live in the same page, so the control and the
//    treatment are the same vantage in the same second, which no recorded baseline can be. isoBlack — a black pixel
//    with a lit neighbour — is the artefact Ben named; pureBlack at night is a shadow he asked for by name.
//
// Grain OFF (a per-pixel noise dominates an isolated-black count). Weather pinned. Adaptation OFF for the crops, for
// the reason d32e8b0 records: it writes toneMappingExposure every frame and turns a controlled comparison into one.
//
//   node bench/assert-tod-grade.mjs
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
// Same crop statistic as assert-daylight-black, kept deliberately identical so the two guards' numbers are comparable:
// isoBlack is a crushed pixel in a lit neighbourhood, pureBlack is contiguous black, and sat is what a grade moves.
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  let pure=0, iso=0, n=0, satSum=0, rS=0, bS=0; const v=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const i=(y*P.w+x)*P.ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    satSum += mx>0 ? (mx-mn)/mx : 0; rS+=r; bS+=b;
    const l=L(x,y); v.push(l); n++;
    if(l<=1){ pure++;
      let bright=false;
      for(let dy=-1;dy<=1&&!bright;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; if(L(xx,yy)>14){ bright=true; break; } }
      if(bright) iso++; } }
  v.sort((a,b)=>a-b);
  const q=f=>v[Math.min(v.length-1,(v.length*f)|0)];
  return { pureBlack:+(100*pure/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3),
           med:+q(0.5).toFixed(2), p10:+q(0.10).toFixed(2), p90:+q(0.90).toFixed(2),
           sat:+(satSum/n).toFixed(4),
           // WARMTH AS ONE NUMBER, because that is the dial this feature turns and a screenshot cannot be asserted.
           // Red minus blue over their sum: positive is a warm frame, negative a cold one, and it is scale-free so a
           // dusk frame being dimmer than noon does not read as a colour change.
           warmth:+(((rS-bS)/Math.max(1,rS+bS))).toFixed(4) };
}
// THE HOURS. setTime is a fraction of the day and the sun's elevation is sin(2*PI*t) normalised — 0.25 is noon and
// 0.75 is midnight (the same quarter-turn convention assert-daylight-black records). 0.492 is chosen rather than 0.5
// because it puts the sun at elevation ~0.048, which is inside the golden band by construction: the band is the
// window between the night weight reaching zero (0.02) and the day weight starting to rise (0.08), so a time picked
// by eye would sit in a blend and this check would be measuring two anchors at once.
const HOURS=[{tag:'noon',t:0.25,want:'day'},{tag:'dusk',t:0.492,want:'gold'},{tag:'night',t:0.75,want:'night'}];
const CROP=[0.10,0.90,0.16,0.62];
const TOL=0.05;   // percent of the crop, same unit and same size as the daylight guard's tolerance
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
    page.on('pageerror',e=>{ console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true); __hc.adapt&&__hc.adapt({on:false}); __hc.exposure(1.05);`);

    // ---- 1. THE FEATURE EXISTS AND ITS DAY ANCHOR IS THE SHIPPED PRESET ----
    const probe0=await page.evaluate(`__hc.tod()`);
    check('the time-of-day grade is present and on', !!probe0 && probe0.on===true && !probe0.err, JSON.stringify(probe0&&probe0.err||probe0&&{on:probe0.on,k:probe0.k}));
    // THE PRESET TABLE IS THE REFERENCE, not a literal copied into this file — a copy would agree with a typo.
    // And the comparison runs against the RESOLVED UNIFORMS at noon rather than against the anchor object, which
    // proves the whole path from anchor to uniform instead of only the literal. TOD is a module-local const anyway,
    // so the probe is the only way in; that is the right shape for a test.
    const anchors=await page.evaluate(`(()=>{ const p=__hc.gradePresets.nordic, a={};
      for(const k of ['sat','curve','vib','warm','temp','vig','lift','gain']) a[k]=p[k]; return { nordic:a }; })()`);
    await page.evaluate(`__hc.setTime(0.25)`); await sleep(400); await page.evaluate(`__hc.setTime(0.25)`); await sleep(300);
    const noon=await page.evaluate(`__hc.tod()`);
    check('at noon the day anchor is the only one weighted', noon.day>0.999 && noon.gold<0.001 && noon.night<0.001,
      `day ${noon.day} gold ${noon.gold} night ${noon.night} (elev ${noon.elev})`);
    const N=anchors.nordic, R=noon.resolved;
    const same=Object.keys(N).every(k=>Math.abs(N[k]-R[k])<1e-4);
    check('the noon frame resolves to `nordic` to the digit — the look Ben signed off has not moved', same,
      Object.keys(N).map(k=>`${k} ${R[k]}/${N[k]}`).join(' '));

    // ---- 2. THE THREE ANCHORS ARE THREE LOOKS ----
    const seen={};
    for(const h of HOURS){
      await page.evaluate(`__hc.setTime(${h.t})`); await sleep(400); await page.evaluate(`__hc.setTime(${h.t})`); await sleep(300);
      const p=await page.evaluate(`__hc.tod()`); seen[h.tag]=p;
      console.log(`  ${h.tag.padEnd(5)} elev ${String(p.elev).padStart(6)}  w day/gold/night ${p.day}/${p.gold}/${p.night}  temp ${p.resolved.temp}  sat ${p.resolved.sat}`);
      check(`${h.tag} sits on the ${h.want} anchor`, p[h.want]>0.95, `${h.want} weight ${p[h.want]}`);
    }
    check('a low sun is warmer than noon, and midnight is colder than both',
      seen.dusk.resolved.temp > seen.noon.resolved.temp + 0.5 && seen.night.resolved.temp < seen.noon.resolved.temp - 0.2,
      `dusk ${seen.dusk.resolved.temp} > noon ${seen.noon.resolved.temp} > night ${seen.night.resolved.temp}`);
    check('midnight is less saturated than noon', seen.night.resolved.sat < seen.noon.resolved.sat - 0.05,
      `night ${seen.night.resolved.sat} against noon ${seen.noon.resolved.sat}`);
    // THE NIGHT ANCHOR MAY NOT LOWER THE LEVEL. Gain multiplies every pixel and lift sets the black point, so a night
    // that darkened through either of those is the one way this feature can crush a frame arithmetically rather than
    // by look. Asserted rather than commented, because a later hand tuning the night by eye would reach for gain.
    check('the night anchor darkens by chroma, not by level',
      seen.night.resolved.gain>=seen.noon.resolved.gain-1e-4 && seen.night.resolved.lift>=seen.noon.resolved.lift-1e-4,
      `gain ${seen.night.resolved.gain}/${seen.noon.resolved.gain}  lift ${seen.night.resolved.lift}/${seen.noon.resolved.lift}`);

    // ---- 3. k:0 IS THE PRE-FEATURE BUILD, AT EVERY HOUR ----
    await page.evaluate(`__hc.tod({k:0})`); await sleep(300);
    const off=await page.evaluate(`__hc.tod()`);
    check('k:0 is the shipped grade at midnight — the feature has an off switch that is the old build',
      Object.keys(N).every(k=>Math.abs(N[k]-off.resolved[k])<1e-4),
      Object.keys(N).map(k=>`${k} ${off.resolved[k]}`).join(' '));
    await page.evaluate(`__hc.tod({k:1})`); await sleep(300);

    // ---- 4. A HAND-SET DIAL IS NOT STOMPED BY THE NEXT FRAME ----
    await page.evaluate(`__hc.grade({temp:0.90})`); await sleep(600);
    const pinned=await page.evaluate(`__hc.tod()`);
    check('a dial set by hand survives the per-frame writer', Math.abs(pinned.resolved.temp-0.90)<1e-4 && pinned.pinned.includes('temp'),
      `temp ${pinned.resolved.temp}, pinned ${JSON.stringify(pinned.pinned)}`);
    check('the dials it did not touch still follow the hour', Math.abs(pinned.resolved.sat-seen.night.resolved.sat)<1e-3,
      `sat ${pinned.resolved.sat}`);
    await page.evaluate(`__hc.tod({release:1})`); await sleep(600);
    const rel=await page.evaluate(`__hc.tod()`);
    check('release hands the dial back to the hour', Math.abs(rel.resolved.temp-seen.night.resolved.temp)<1e-3 && rel.pinned.length===0,
      `temp ${rel.resolved.temp} against ${seen.night.resolved.temp}`);

    // ---- 5. THE CROPS: THE GRADE MUST NOT MANUFACTURE CRUSHED PIXELS AT ANY HOUR ----
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const gy=await page.evaluate(`__hc.groundY(${SX},${SZ})`);
    await page.evaluate(`__hc.tpAt(${SX+0.5},${gy+7},${SZ+14.5}); __hc.cam({yaw:${Math.PI}, pitch:-0.40})`);
    for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1600);
    const shot=async(tag)=>{ const f=path.join(OUT,`tod-${tag}.png`); await page.screenshot({path:f}); return stat(f,CROP); };
    for(const h of HOURS){
      await page.evaluate(`__hc.setTime(${h.t})`); await sleep(600); await page.evaluate(`__hc.setTime(${h.t})`); await sleep(500);
      await page.evaluate(`__hc.tod({k:0})`); await sleep(350); const ctl=await shot(h.tag+'-off');
      await page.evaluate(`__hc.tod({k:1})`); await sleep(350); const on =await shot(h.tag+'-on');
      console.log(`  ${h.tag.padEnd(5)} off ${JSON.stringify(ctl)}`);
      console.log(`  ${h.tag.padEnd(5)} on  ${JSON.stringify(on)}`);
      check(`${h.tag}: the grade does not add isolated black`, on.isoBlack<=ctl.isoBlack+TOL, `${on.isoBlack}% against ${ctl.isoBlack}% + ${TOL}`);
      check(`${h.tag}: the grade does not add contiguous black`, on.pureBlack<=ctl.pureBlack+TOL, `${on.pureBlack}% against ${ctl.pureBlack}% + ${TOL}`);
      // AND IT MUST DO SOMETHING. A grade that is safe because it is inert passes every check above this one; the two
      // frames have to differ in the direction the anchor says, or the feature is a comment.
      if(h.tag==='noon') check('noon is untouched, which is the point of the day anchor', Math.abs(on.warmth-ctl.warmth)<0.0015 && Math.abs(on.med-ctl.med)<0.6, `warmth ${on.warmth}/${ctl.warmth}  med ${on.med}/${ctl.med}`);
      if(h.tag==='dusk') check('dusk is visibly warmer than the same frame ungraded', on.warmth>ctl.warmth+0.004, `warmth ${on.warmth} against ${ctl.warmth}`);
      if(h.tag==='night') check('midnight is visibly colder and less saturated than the same frame ungraded', on.warmth<ctl.warmth-0.002 && on.sat<ctl.sat, `warmth ${on.warmth}/${ctl.warmth}  sat ${on.sat}/${ctl.sat}`);
    }
    await page.evaluate(`__hc.tod({k:1}); __hc.adapt&&__hc.adapt({on:true});`);
  }catch(e){ console.log('  HARNESS ERROR: '+(e&&e.message||e)); fails++; checks++; }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks pass`);
  process.exit(fails?1:0);
})();
