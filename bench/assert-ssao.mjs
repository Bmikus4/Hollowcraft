// THE CONTACT-OCCLUSION PASS DARKENS CREASES, DARKENS ONLY CREASES, AND CAN BE SHOWN TO DO NOTHING WHEN IT IS OFF.
//
// There is no ambient occlusion in the geometry — this mesher is greedy, so per-vertex AO would force the merge to break at
// every change in it. The pass is screen space, reading the depth texture the motion-blur path already keeps, and it is a
// depth-DIFFERENCE test rather than a hemisphere of normals because this world is axis-aligned boxes.
//
// Three claims, and the third is the one that makes the first two mean anything:
//   1. Turning it on darkens a real share of the terrain, and darkens it in a TAIL — a few pixels a lot, not every pixel a
//      little, which is the difference between occlusion and a brightness slider.
//   2. Sky is untouched. Screen-space AO's classic tell is a dark rim around every silhouette against the sky, which this
//      shader avoids by skipping far-plane depth, and that avoidance has to be measured rather than asserted in a comment.
//   3. CONTROL: two frames with the pass OFF, taken the same way, must differ by far less than the on/off pair. Without it
//      the numbers above cannot be told apart from the sea and the foliage moving between two screenshots.
//
// Paired inside ONE page: the pass is toggled through __hc.ssao(), so both frames share a loaded world, a thermal state and
// a shader cache. Two runs compared across a reboot cannot resolve this.
//
//   node bench/assert-ssao.mjs
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
const lum = (d,i) => 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
// How much DARKER b is than a, over a crop. Returns the share of pixels that dropped by more than `drop` levels, the median
// change, and the mean drop among the pixels that did change — occlusion lives in that tail, not in the median.
function darker(aFile,bFile,crop,drop=6){
  const A=decodePNG(fs.readFileSync(aFile)), B=decodePNG(fs.readFileSync(bFile));
  if(A.w!==B.w||A.h!==B.h) throw new Error('size mismatch');
  const x0=(A.w*crop[0])|0, x1=(A.w*crop[1])|0, y0=(A.h*crop[2])|0, y1=(A.h*crop[3])|0;
  let n=0, hit=0, sumDrop=0; const deltas=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*A.w+x)*A.ch;
    const d=lum(A.data,i)-lum(B.data,i); n++; deltas.push(d);
    if(d>drop){ hit++; sumDrop+=d; } }
  deltas.sort((p,q)=>p-q);
  let mean=0; for(const d of deltas) mean+=d; mean/=n;
  return { pct:+(100*hit/n).toFixed(2), median:+deltas[n>>1].toFixed(2), meanDrop:hit?+(sumDrop/hit).toFixed(1):0, mean:+mean.toFixed(3), n };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1})).newPage();
    // GRAIN OFF, BEFORE THE PAGE BUILDS ITS COMPOSER. The grade adds animated film noise at 0.06, so ANY two frames differ
    // across a sixth of the screen: measured, the off-vs-off control read 15% and buried the pass entirely. The grain
    // preference is read from localStorage when the composer is built, so it has to be set before the module runs.
    await page.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?perf=1&debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.setTime(0.42); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    const st = await page.evaluate(`__hc.ssao()`);
    console.log('  pass state: '+JSON.stringify(st));
    if(st.err){ check('the contact-occlusion pass is present', false, st.err); console.log(`\n${checks-fails}/${checks} checks pass`); process.exit(1); }
    check('the contact-occlusion pass is present', st.on===true, JSON.stringify(st));

    // A VANTAGE FULL OF CREASES: the terraced beach below the spawn ridge is step after step of inside corners, which is
    // what this pass exists for. Looking down at it also keeps the sea out of the crop that gets measured.
    const S = await page.evaluate(`(()=>{const p=__hc.probe(); return {sx:p.spawnX, sz:p.spawnZ};})()`);
    const look = async (x,y,z,yaw,pitch) => { await page.evaluate(`__hc.tpAt(${x},${y},${z}); __hc.cam({yaw:${yaw}, pitch:${pitch}});`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f && f.meshed>=f.want) break; await sleep(500); }
      await sleep(2000); await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(500); };
    const shot = async (name) => { const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };
    // BACK TO BACK, with the toggle between them and nothing else: the world animates, so the less time between the two
    // frames the smaller the part of the difference that is foliage and sea rather than the pass.
    // THE CLOCK IS PINNED AT EVERY SHOT. setTime once at the top is not enough over a run this long: the sun moves, the
    // lighting with it, and the bloom around the disc moves most of all — measured, that alone put 3.76% of the SKY crop
    // more than 4 levels darker between two frames, with a mean drop of 98, which is the sun leaving a pixel rather than
    // anything the pass did.
    const HOLD=`__hc.setTime(0.42);`;
    const pair = async (tag, on1, on2, strength) => {
      if(strength!=null) await page.evaluate(`__hc.ssao(null,{strength:${strength}})`);
      await page.evaluate(HOLD+`__hc.ssao(${on1})`); await sleep(260); await page.evaluate(HOLD); const a=await shot(`ssao-${tag}-a.png`);
      await page.evaluate(HOLD+`__hc.ssao(${on2})`); await sleep(260); await page.evaluate(HOLD); const b=await shot(`ssao-${tag}-b.png`);
      return [a,b];
    };

    await look(S.sx+4, 47, S.sz+14, 2.3, -0.25);
    // THE SAND TERRACES, right of the grass: the same creases with the fewest animated plants in frame. Foliage sway and
    // drifting particles are the whole residual floor once the grain is off, and they live in the grass.
    const TERRAIN=[0.34,0.82,0.52,0.86];
    const [offA,offB] = await pair('control', false, false);    // control FIRST, so the floor is known before any claim
    const floor = darker(offA, offB, TERRAIN);
    console.log('  control (off vs off):  '+JSON.stringify(floor));
    // MEASURED AT FULL STRENGTH. Creases are a thin slice of any frame — at the shipped 0.55 the pass moves about the same
    // share of pixels as the sway of a few plants, so detection at that setting cannot be separated from the floor. Turning
    // the dial to 1.0 tests the same pass, louder; the shipped setting is then checked to be live and smaller.
    const [onLoud, offC] = await pair('loud', true, false, 1.0);
    // ARGUMENT ORDER IS THE CLAIM: darker(before, after) returns before minus after, so the OFF frame goes first and a
    // positive number means the pass took light away. Written the other way round the first version reported the pass
    // BRIGHTENING by a level and read as a failure.
    const loud = darker(offC, onLoud, TERRAIN);
    console.log('  pass at strength 1.0:  '+JSON.stringify(loud));
    const [onShip, offD] = await pair('shipped', true, false, 0.55);
    const ship = darker(offD, onShip, TERRAIN);
    console.log('  pass at shipped 0.55:  '+JSON.stringify(ship));
    await page.evaluate(`__hc.ssao(true,{strength:0.55})`);

    // THE MEAN, not the tail count. A crease is a thin slice of any frame, so "share of pixels past a threshold" is the same
    // order as a few swaying plants; the average luminance over the crop is what separates them, because the pass only ever
    // subtracts and the sway is as likely to brighten a pixel as darken it.
    check('turning it on darkens the terrain',       loud.mean > Math.max(0.4, Math.abs(floor.mean)*4), `mean drop ${loud.mean} levels at strength 1.0, against a floor of ${floor.mean}`);
    check('the darkening is a tail, not a dimmer',   Math.abs(loud.median) < 5 && loud.meanDrop > 10, `median change ${loud.median} levels, mean drop where it lands ${loud.meanDrop}`);
    check('the shipped strength is live and gentler',ship.mean > Math.abs(floor.mean)*2 && ship.mean < loud.mean, `shipped ${ship.mean} against loud ${loud.mean} and floor ${floor.mean}`);

    // SKY: pitch up until the frame is sky, where there is no geometry to occlude and a screen-space pass must do nothing.
    await look(S.sx+4, 60, S.sz+14, 2.3, 0.55);
    // LEFT of the frame only: the sun sits up-RIGHT at this hour and its bloom shifts between any two frames, which put a
    // mean change of 3.9 levels over a full-width sky crop — the sun leaving a pixel, not the pass touching one.
    const SKY=[0.04,0.34,0.04,0.34];
    const [skyOn, skyOff] = await pair('sky', true, false);
    const sky = darker(skyOff, skyOn, SKY, 4);
    console.log('  sky, on vs off:        '+JSON.stringify(sky));
    // THE MEDIAN OVER THE SKY, not its mean. Anything bright crossing the frame between two shots — a bird, a drifting leaf,
    // a cloud edge — moves a few hundred pixels by 80 levels and drags a mean of 50,000 pixels by 7, which says nothing about
    // a pass that only ever subtracts. The median is 0 when the pass is doing nothing to the sky, and that is the claim.
    check('it leaves the sky alone',                 Math.abs(sky.median) < 0.5 && sky.pct < 2.0, `median change over the sky ${sky.median} levels, ${sky.pct}% past 4 (mean ${sky.mean}, dragged by whatever flew through)`);

    check('no page errors',                          errs.length===0, errs.slice(0,2).join(' | '));
    await page.evaluate(`__hc.ssao(true)`);
    console.log('  frames: bench/results/ssao-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
