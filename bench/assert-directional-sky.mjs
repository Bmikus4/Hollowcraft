// SHADE HAS A DIRECTION: A FLOOR, A WALL AND A SOFFIT OF THE SAME STONE ARE NO LONGER THE SAME BRIGHTNESS.
//
// Plan §4 item 8. `aSky` is a per-face SCALAR — how much sky a face's own column can see — and it says nothing about which way
// the face points, so anywhere the sun does not reach (under a canopy, inside a shelter, in shadow) a floor, a wall and the
// underside of a roof all take the same skylight and the shade has no form. The sky is a hemisphere: an upward face sees all of
// it, a vertical face half, a downward face only what bounces. That is one dot product against a normal the shader already has.
//
// THE SCENE IS BUILT, AND IN THE AIR. Three orientations of ONE material have to be in frame out of the sun, or the measurement
// compares stone against grass. Built on the hillside first and the terrain won: the slope rose through the flat stone floor, so
// the lower band of the frame was grass and plants. y=96 is clear of it, and inside CFG.WORLD_H (128) — above that /setblock
// silently does nothing, which cost an earlier harness every one of its lamps.
//
// ONE SHOT PER ORIENTATION, not one shot with three crops. With the camera level in a five-block box the floor is a grazing sliver
// at the bottom of the frame behind the hotbar, so the "floor" crop was reading the lower part of the BACK WALL — and the two read
// within 0.2 of each other in the ?dbg=sdir frame, which is what exposed it. The clock is pinned and the box does not move, so
// pitching down, level and up costs nothing.
//
// AND THE FACTOR ITSELF IS MEASURED, in a second page with ?dbg=sdir, which renders the term as grey (0.5 = 1.0). A claim about
// what lighting does to three orientations should not rest on the lit result alone when the input can be photographed.
//
//   node bench/assert-directional-sky.mjs        SKYDIR_UP=1.10 SKYDIR_DN=0.58 node bench/assert-directional-sky.mjs
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
// MEDIAN, not mean: a crop of stone still catches a bright pixel or two where greedy quads meet, and a mean follows them.
function crop(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const v=[]; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch));
  v.sort((a,b)=>a-b);
  return { med:+v[v.length>>1].toFixed(2), p10:+v[(v.length*0.10)|0].toFixed(2), p90:+v[(v.length*0.90)|0].toFixed(2) };
}
function frameMean(file){
  const P=decodePNG(fs.readFileSync(file));
  // The HUD is static and bright — compass bottom-left, hotbar bottom-centre, held item bottom-right — and all three would sit
  // inside a full-frame statistic and dilute it. Top 70% only.
  let s=0,n=0; const y1=(P.h*0.70)|0;
  for(let y=0;y<y1;y++) for(let x=0;x<P.w;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
  return +(s/n).toFixed(3);
}
const BAND=[0.35,0.65,0.40,0.60];   // the middle of the frame, whatever the pitch has aimed it at
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    const FY=96, RY=102;
    const boot=async(qs)=>{
      const page=await ctx.newPage();
      page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); });
      await page.goto(base+PAGE+'?debug=1&rd=8'+qs,{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:180000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
      await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
      const S=await page.evaluate(`__hc.st()`);
      const BX=Math.round(S.sx)+6, BZ=Math.round(S.sz);
      await page.evaluate(`(()=>{
        for(let dx=0;dx<9;dx++) for(let dz=-4;dz<=4;dz++){
          __hc.cmdRun('/setblock '+(${BX}+dx)+' ${FY} '+(${BZ}+dz)+' stone');
          __hc.cmdRun('/setblock '+(${BX}+dx)+' ${RY} '+(${BZ}+dz)+' stone'); }
        for(let dz=-4;dz<=4;dz++) for(let y=${FY}+1;y<${RY};y++) __hc.cmdRun('/setblock '+(${BX}+8)+' '+y+' '+(${BZ}+dz)+' stone');
        for(let dx=0;dx<9;dx++) for(let y=${FY}+1;y<${RY};y++){ __hc.cmdRun('/setblock '+(${BX}+dx)+' '+y+' '+(${BZ}-4)+' stone');
          __hc.cmdRun('/setblock '+(${BX}+dx)+' '+y+' '+(${BZ}+4)+' stone'); }
      })()`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(2000);
      await page.evaluate(`__hc.tpAt(${BX}+2.5, ${FY}+3.2, ${BZ}+0.5)`);
      return { page, S, BX, BZ };
    };
    // t=0.25 is NOON on the real map (bench/tmp-elev.mjs — the setTime comment is a quarter turn out), so the sun is overhead and
    // none of it enters the box, which is the point: this is a claim about SKYLIGHT, not about the sun.
    const pin=async(page,t)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(220); };
    const faceShots=async(page,tag)=>{
      const out={};
      for(const [name,pitch] of [['floor',-0.62],['wall',0.0],['soffit',0.62]]){
        await page.evaluate(`__hc.cam({yaw:-1.5708, pitch:${pitch}})`); await sleep(320);
        const f=path.join(OUT,`skydir-${tag}-${name}.png`); await page.screenshot({path:f});
        out[name]=crop(f,BAND); }
      return out;
    };
    // ---- 1. THE FACTOR ITSELF, ?dbg=sdir ---------------------------------------------------------------------------------
    { const B=await boot('&dbg=sdir'); await pin(B.page,0.25);
      const F=await faceShots(B.page,'dbg');
      console.log(`  ?dbg=sdir factor grey:  floor ${F.floor.med}   wall ${F.wall.med}   soffit ${F.soffit.med}`);
      check('the factor itself is up > side > down', F.floor.med>F.wall.med+2 && F.wall.med>F.soffit.med+2,
            `floor ${F.floor.med} > wall ${F.wall.med} > soffit ${F.soffit.med}`);
      await B.page.close(); }
    // ---- 2. WHAT IT DOES TO THE LIT RESULT -------------------------------------------------------------------------------
    const B=await boot('');
    const page=B.page;
    const D=await page.evaluate(`__hc.skyDir()`);
    console.log(`  live: ${JSON.stringify(D)}`);
    check('directional skylight is on by default', D.amt>0.99 && D.up>D.dn, JSON.stringify(D));
    await pin(page,0.25);
    // SKYDIR_UP / SKYDIR_DN override the shipped pair; that is how the pair was chosen, and what 1.10/0.58 costs is recorded
    // beside the constants in index.html.
    const UP=process.env.SKYDIR_UP, DN=process.env.SKYDIR_DN;
    await page.evaluate(`__hc.skyDir({amt:0})`); await sleep(400); const off=await faceShots(page,'off');
    await page.evaluate(`__hc.skyDir({amt:1${UP?`,up:${+UP}`:''}${DN?`,dn:${+DN}`:''}})`); await sleep(400);
    if(UP||DN) console.log(`  OVERRIDE ${JSON.stringify(await page.evaluate(`__hc.skyDir()`))}`);
    const on=await faceShots(page,'on');
    const ratio=(a,b)=>+(a/Math.max(b,0.01)).toFixed(3);
    console.log(`  OFF  floor ${off.floor.med}  wall ${off.wall.med}  soffit ${off.soffit.med}   floor:wall ${ratio(off.floor.med,off.wall.med)}  floor:soffit ${ratio(off.floor.med,off.soffit.med)}`);
    console.log(`  ON   floor ${on.floor.med}  wall ${on.wall.med}  soffit ${on.soffit.med}   floor:wall ${ratio(on.floor.med,on.wall.med)}  floor:soffit ${ratio(on.floor.med,on.soffit.med)}`);
    // THE FEATURE, AS RATIOS. Not as an absolute ordering, which the first version of this check got wrong: an interior wall beside
    // the opening reads vSky~1 by design, because _sskyOpen gives a side face the openness of ANY lateral air column — the 07-23
    // fix for "dark faces that reject light" on cliffs and eaves. So the walls of this box are legitimately brighter than its
    // roofed floor, and what directional skylight can be held to is the gap between orientations widening.
    check('the soffit darkens against the floor', ratio(on.floor.med,on.soffit.med) > ratio(off.floor.med,off.soffit.med)*1.10,
          `floor:soffit ${ratio(off.floor.med,off.soffit.med)} -> ${ratio(on.floor.med,on.soffit.med)}`);
    check('the wall does too',                    ratio(on.floor.med,on.wall.med) > ratio(off.floor.med,off.wall.med)*1.05,
          `floor:wall ${ratio(off.floor.med,off.wall.med)} -> ${ratio(on.floor.med,on.wall.med)}`);
    // AND THE SHADE IS STILL SHADE, not a hole. The hemisphere light's ground colour was lifted to 0x24282f (Ben 07-20) precisely
    // because down and side faces in shadow read as near-black; up 1.10 / dn 0.58 put a soffit median on 2.0 of 255 and was
    // rejected for it.
    check('nothing in the box is crushed',        on.soffit.med>3 && on.wall.med>3, `soffit ${on.soffit.med}, wall ${on.wall.med}`);
    // ---- 3. THE CONSTRAINTS: OPEN DAYLIGHT KEEPS ITS BRIGHTNESS, NIGHT DOES NOT LIFT ------------------------------------
    const gy=await page.evaluate(`__hc.groundY(${B.S.sx},${B.S.sz})`);
    await page.evaluate(`__hc.tpAt(${B.S.sx}+0.5, ${gy}+3.2, ${B.S.sz}+18.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1500);
    await page.evaluate(`__hc.cam({yaw:3.1416, pitch:-0.22})`); await sleep(300);
    const meanAt=async(t,tag)=>{ await pin(page,t);
      await page.evaluate(`__hc.skyDir({amt:0})`); await sleep(450);
      const a=path.join(OUT,`skydir-${tag}-off.png`); await page.screenshot({path:a});
      await page.evaluate(`__hc.skyDir({amt:1})`); await sleep(450);
      const b=path.join(OUT,`skydir-${tag}-on.png`); await page.screenshot({path:b});
      return [frameMean(a), frameMean(b)]; };
    const [dayOff,dayOn]=await meanAt(0.25,'day');
    console.log(`  open daylight frame mean ${dayOff} -> ${dayOn}  (${(100*(dayOn-dayOff)/dayOff).toFixed(2)}%)`);
    check('open daylight holds its brightness', Math.abs(dayOn-dayOff)/dayOff < 0.03, `${dayOff} -> ${dayOn}`);
    const [nOff,nOn]=await meanAt(0.75,'night');
    console.log(`  night frame mean ${nOff} -> ${nOn}`);
    check('night does not lift', nOn-nOff < 1.0, `${nOff} -> ${nOn}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/skydir-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
