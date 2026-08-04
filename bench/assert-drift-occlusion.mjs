// THE HORRIFIC WRETCH'S BODY MUST NOT DRAW THROUGH BLOCKS.
//
// Ben, 2026-08-04: "we should not be able to see the wretchs body through blocks."
//
// That creature is not a mesh in the world — it is composited from the drift loop as ONE camera-facing quad, so every
// fragment of it used to carry a single depth: the subject's centre. Squarely behind a wall it vanished correctly, but any
// pose where part of it is inside the world — a hillside, a doorway, a tunnel mouth — drew the embedded half straight over
// the rock. It now reconstructs each pixel's true world position from the clean render's depth buffer and re-projects it,
// so the ordinary depth test does the work.
//
// Measured by pixels, against a control, because this is a rendering claim:
//   · a wall is raised between the eye and the creature, and the frame with it there must match the frame with the
//     creature taken away — same picture means the wall really hid it;
//   · then the wall is removed and the creature must come BACK, which is what stops "hidden" from being a fix that simply
//     never draws it.
// Both comparisons run against a noise floor taken from two frames of the same untouched scene: sea, foliage and sun move
// on their own, and without that control a third of the screen differs for reasons that have nothing to do with the body.
//
//   node bench/assert-drift-occlusion.mjs
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
// Differences are counted in the CENTRE of the frame only: the compass rose, the hotbar and the held hand are all live UI
// at the edges, and the sea occupies the horizon. The creature is what is in the middle.
function magenta(f){ const A=decodePNG(fs.readFileSync(f));
  const x0=(A.w*0.10)|0, x1=(A.w*0.90)|0, y0=(A.h*0.02)|0, y1=(A.h*0.80)|0;   // skip the hotbar and the held hand
  let n=0; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*A.w+x)*A.ch;
    const r=A.data[i], g=A.data[i+1], b=A.data[i+2];
    // Calibrated off a real tinted frame: the lock multiplies the flesh shader's crimson, so the body lands on values like
    // (121,0,39) — red-violet with the green channel at ZERO. Grass, dirt, stone, sea and the compass all carry green, so
    // "g is nothing and r is not black" is the whole test. A magenta threshold on r AND b missed the body entirely.
    if(g<=12 && r>45 && b>r*0.15 && b<r*0.85) n++; }
  return n; }
function magentaBand(f, y0f, y1f){ const A=decodePNG(fs.readFileSync(f));
  const x0=(A.w*0.10)|0, x1=(A.w*0.90)|0, y0=(A.h*y0f)|0, y1=(A.h*y1f)|0;
  let n=0; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*A.w+x)*A.ch;
    const r=A.data[i], g=A.data[i+1], b=A.data[i+2];
    if(g<=12 && r>45 && b>r*0.15 && b<r*0.85) n++; }
  return n; }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    // hwHold freezes the extras' AI: this creature reaches the player in about three seconds otherwise, and the grab
    // cutscene owns the camera — a frame of the maw filling the lens measures nothing about occlusion.
    await page.evaluate(`__hc.lock(true); __hc.setTime(0.45); __hc.pinScene&&__hc.pinScene(); __hc.hwHold&&__hc.hwHold(true);`);
    await sleep(1200);
    const shot = async (name) => { const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };

    // THE CREATURE, IN THE OPEN, seven blocks ahead, pinned, and painted a colour the world cannot make.
    const spawned = await page.evaluate(`(()=>{ const a=__hc.hwAt(7); return { a, n:(__hc.hwState()||[]).length }; })()`);
    await sleep(3500);
    await page.evaluate(`__hc.hwAt(7)`);   // re-park it: the spawn walked while the loop was warming up
    await sleep(800);
    await page.evaluate(`__hc.hwTint('#ff00ff')`); await sleep(1200);
    const openShot = await shot('driftocc-open.png');
    const OPEN = magenta(openShot);
    console.log(`  in the open: ${OPEN} magenta px   (spawn ${JSON.stringify(spawned)})`);
    check('the body is plainly on screen in the open', OPEN > 4000, `${OPEN} magenta px`);

    // NOW WALL IT OFF. Three blocks deep, so no part of the body can be in front of the wall, and tall and wide enough to
    // cover the whole billboard from this eye.
    const wall = await page.evaluate(`(()=>{ const p=__hc.pos(), cp=Math.cos(p.pitch);
      const L={x:-Math.sin(p.yaw)*cp, z:-Math.cos(p.yaw)*cp};
      const bx=Math.floor(p.x+L.x*3.5), bz=Math.floor(p.z+L.z*3.5), by=Math.floor(p.y);
      let n=0; for(let dx=-5;dx<=5;dx++) for(let dz=-1;dz<=1;dz++) for(let dy=-2;dy<=8;dy++){ __hc.cmdRun('/setblock '+(bx+dx)+' '+(by+dy)+' '+(bz+dz)+' stone'); n++; }
      return { at:[bx,by,bz], blocks:n }; })()`);
    await sleep(2600);
    await page.evaluate(`__hc.hwAt(7); __hc.hwTint('#ff00ff');`); await sleep(900);
    const walledShot = await shot('driftocc-walled.png');
    const WALLED = magenta(walledShot);
    console.log(`  behind the wall: ${WALLED} magenta px   (wall ${JSON.stringify(wall)})`);
    check('behind a wall none of the body draws',   WALLED < OPEN*0.02, `${WALLED} magenta px, against ${OPEN} in the open`);

    // AND IT COMES BACK. A fix that simply stopped drawing the creature would pass everything above.
    const gone = await page.evaluate(`(()=>{ const p=__hc.pos(), cp=Math.cos(p.pitch);
      const L={x:-Math.sin(p.yaw)*cp, z:-Math.cos(p.yaw)*cp};
      const bx=Math.floor(p.x+L.x*3.5), bz=Math.floor(p.z+L.z*3.5), by=Math.floor(p.y);
      let n=0; for(let dx=-5;dx<=5;dx++) for(let dz=-1;dz<=1;dz++) for(let dy=-2;dy<=8;dy++){ __hc.cmdRun('/setblock '+(bx+dx)+' '+(by+dy)+' '+(bz+dz)+' air'); n++; }
      return n; })()`);
    await sleep(2600);
    await page.evaluate(`__hc.hwAt(7); __hc.hwTint('#ff00ff');`); await sleep(900);
    const backShot = await shot('driftocc-wall-removed.png');
    const BACK = magenta(backShot);
    console.log(`  wall removed again: ${BACK} magenta px   (${gone} blocks cleared)`);
    check('take the wall away and it is drawn again', BACK > OPEN*0.4, `${BACK} magenta px, against ${OPEN} before the wall`);

    // THE CASE THAT WAS ACTUALLY BROKEN: half of it behind a LOW wall. A full-height wall was hidden correctly even with one
    // flat depth, because the whole plane sat behind it. Two blocks high is where the old behaviour showed — the body's legs
    // and the wall occupy the same pixels, and with the plane's depth taken from the creature's CENTRE the legs won.
    const low = await page.evaluate(`(()=>{ const p=__hc.pos(), cp=Math.cos(p.pitch);
      const L={x:-Math.sin(p.yaw)*cp, z:-Math.cos(p.yaw)*cp};
      const bx=Math.floor(p.x+L.x*3.5), bz=Math.floor(p.z+L.z*3.5), by=Math.floor(p.y);
      for(let dx=-5;dx<=5;dx++) for(let dz=-1;dz<=1;dz++) for(let dy=0;dy<=1;dy++) __hc.cmdRun('/setblock '+(bx+dx)+' '+(by+dy)+' '+(bz+dz)+' stone');
      return { at:[bx,by,bz] }; })()`);
    await sleep(2600);
    await page.evaluate(`__hc.hwAt(7); __hc.hwTint('#ff00ff');`); await sleep(900);
    const lowShot = await shot('driftocc-lowwall.png');
    const LOWALL = magenta(lowShot), LOWBOT = magentaBand(lowShot, 0.55, 0.80), LOWTOP = magentaBand(lowShot, 0.02, 0.45);
    console.log(`  behind a two-block wall: ${LOWALL} px total — ${LOWTOP} above the wall line, ${LOWBOT} below it   ${JSON.stringify(low)}`);
    check('its upper body still shows over a low wall', LOWTOP > 1500, `${LOWTOP} px in the upper frame`);
    check('and the half behind the wall does NOT',      LOWBOT < LOWTOP*0.10, `${LOWBOT} px below the wall line against ${LOWTOP} above it`);

    check('no page errors',                        errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/driftocc-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
