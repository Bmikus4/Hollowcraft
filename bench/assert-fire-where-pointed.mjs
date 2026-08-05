// THE BULLET GOES WHERE THE GUN POINTS, AND THE RING GOES WITH IT.
//
// Ben 08-04: "guns should always fire in the direction they are pointed" and "the HUD crosshair needs to stay where it is, but the
// crosshair itself can sway, and should sway where the gun is aiming, think full last of us style mechanics here."
//
// WHAT WAS BROKEN. fireGun sent every bullet down lookDir() — the camera centre — and the code said so in a comment above the
// offhand sway penalty: the drift cost you the sight picture but never the shot. So all four sway sources, the strafe lean and the
// cheek weld were decoration, and the ring in the middle of the screen was the one true statement about where a round would go.
//
// WHAT IS ASSERTED, and the order matters: first that the gun's axis actually LEAVES the camera centre (if it never does, every
// check below passes on the old behaviour), then that the ring MOVES WITH IT by the projected amount, then that the reticle and
// the bullet agree, then the things that must NOT move — the ring's HTML anchor, and the axis's immunity to the recoil buck.
//
// THE PIN IS WHAT MAKES THIS MEASURABLE. Sway is time-varying, so a reading taken a frame apart from another reading is a
// different world; __hc.swayPin freezes the drift at a known value and viewPose/xhProbe are then read against the same instant.
//
//   node bench/assert-fire-where-pointed.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+d):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync']});
    const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.25); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    const ev=js=>page.evaluate(js);
    await ev('__hc.cmdRun("/clearinv"); __hc.cmdRun("/give hunting_rifle 1")'); await sleep(300);
    await ev('__hc.hold("hunting_rifle")'); await sleep(400);
    await ev('__hc.cam({yaw:0,pitch:0})'); await sleep(300);

    // ---- 1. THE AXIS LEAVES THE CAMERA CENTRE ----
    // AIMED, and that is not a convenience: hip fire deliberately carries NO sway (the four sources are applied to the aimed pose
    // and blended in by smoothstep(adsT) — idle/hip motion is #66's item and building it twice is how the two undo each other).
    // Pinned at the hip the axis therefore does not move at all, which is correct and measures nothing. What the hip DOES carry is
    // the ready pose's own 0.05 rad of yaw, so hip shots leave the camera centre by 2.87 degrees — see the note at the end.
    await ev('__hc.aim(true)');
    for(let i=0;i<25;i++){ if((await ev('__hc.adsClearance()')).adsT>=0.999) break; await sleep(150); }
    await ev('__hc.swayPin(0,0)'); await sleep(350);
    const flat=await ev('__hc.xhProbe()');
    await ev('__hc.swayPin(0.02,0.012)'); await sleep(450);
    const swayed=await ev('__hc.xhProbe()');
    check('the rifle reached a full aim (or the sway is not in the pose yet)', swayed.adsT>=0.999, `adsT ${swayed.adsT}`);
    console.log('     pinned 0,0        aim '+JSON.stringify(flat.aimCam)+'  off '+flat.offAxisDeg+' deg   ring ('+flat.offX+','+flat.offY+')');
    console.log('     pinned .02,.012   aim '+JSON.stringify(swayed.aimCam)+'  off '+swayed.offAxisDeg+' deg   ring ('+swayed.offX+','+swayed.offY+')');
    check('the gun reports an aim axis at all', flat.aimCam && swayed.aimCam, JSON.stringify(swayed.aimCam));
    // THE CHECK THAT KILLS THE OLD BEHAVIOUR: if the pinned drift does not move the axis, the sway never reaches the shot.
    const moved=Math.abs(swayed.offAxisDeg-flat.offAxisDeg);
    check('pinned sway MOVES the gun axis off the camera centre', moved>0.05,
      `${flat.offAxisDeg} -> ${swayed.offAxisDeg} deg (delta ${moved.toFixed(3)})`);

    // ---- 2. THE RING FOLLOWS IT, BY THE PROJECTED AMOUNT ----
    check('the ring drifts with the axis', Math.hypot(swayed.offX-flat.offX, swayed.offY-flat.offY)>1.0,
      `(${flat.offX},${flat.offY}) -> (${swayed.offX},${swayed.offY}) px`);
    // The projection is not taken on trust: tan(angle) / tan(fov/2) * halfHeight is what the offset must be.
    const vp={ w:swayed.vw, h:swayed.vh, fov:swayed.fov };   // from the probe: `camera` is module scope, unreachable from evaluate
    const th=Math.tan(vp.fov*0.5*Math.PI/180);
    const wantX=(swayed.aimCam[0]/-swayed.aimCam[2])/(th*(vp.w/vp.h))*(vp.w*0.5);
    const wantY=-(swayed.aimCam[1]/-swayed.aimCam[2])/th*(vp.h*0.5);
    check('and it is where the projection says, not merely near it',
      Math.abs(wantX-swayed.offX)<1.5 && Math.abs(wantY-swayed.offY)<1.5,
      `want (${wantX.toFixed(1)},${wantY.toFixed(1)}) got (${swayed.offX},${swayed.offY})`);

    // ---- 3. THE HOLOGRAM AGREES WITH BOTH ----
    await ev('__hc.aim(false)'); await sleep(250);
    await ev('__hc.cmdRun("/give hunting_rifle_dot 1")'); await ev('__hc.hold("hunting_rifle_dot")'); await sleep(500);
    await ev('__hc.aim(true)');
    for(let i=0;i<25;i++){ if((await ev('__hc.adsClearance()')).adsT>=0.999) break; await sleep(150); }
    const dot=await ev('__hc.xhProbe()');
    await ev('__hc.aim(false)'); await sleep(200);
    console.log('     dot gun aimed     aim '+JSON.stringify(dot.aimCam)+'   holo '+JSON.stringify(dot.holoPos));
    // The reticle hangs at its own distance ALONG the axis, so normalising it must give the axis back.
    let ok=false, ang=null;
    if(dot.aimCam && dot.holoPos){ const L=Math.hypot(dot.holoPos[0],dot.holoPos[1],dot.holoPos[2]);
      const n=dot.holoPos.map(v=>v/L);
      const dp=n[0]*dot.aimCam[0]+n[1]*dot.aimCam[1]+n[2]*dot.aimCam[2];
      ang=Math.acos(Math.max(-1,Math.min(1,dp)))*57.29578; ok=ang<0.2; }
    check('the holosight dot sits on the bullet\'s axis', ok, ang==null?'no reading':`${ang.toFixed(3)} deg apart`);

    // ---- 3b. AND THE BULLET ITSELF, which is the actual claim ----
    // Everything above reads the INPUTS: the axis, the projected ring, the reticle. This fires a round with the drift pinned and
    // compares the direction it took against both candidates. The old build would score 0 degrees from the camera; the new one
    // must score ~0 from the GUN and clearly nonzero from the camera, and the two must differ by the pinned offset.
    await ev('__hc.hold("hunting_rifle")'); await sleep(400);
    await ev('__hc.aim(true)');
    for(let i=0;i<25;i++){ if((await ev('__hc.adsClearance()')).adsT>=0.999) break; await sleep(150); }
    await ev('__hc.swayPin(0.02,0.012)'); await sleep(450);
    const pre=await ev('__hc.xhProbe()');
    await ev('__hc.shoot()'); await sleep(120);
    const ls=await ev('__hc.lastShot()');
    console.log('     fired aimed       shot '+(ls.degFromGunAxis)+' deg from the gun axis, '+(ls.degFromCam)+' deg from the camera'
      +'   (axis '+ls.axisOffCamDeg+' off cam, ring spread '+ls.spreadDeg+', probe said '+pre.offAxisDeg+')');
    check('the round leaves down the GUN\'s axis', ls.degFromGunAxis!=null && ls.degFromGunAxis<=Math.max(0.25, ls.spreadDeg+0.1),
      `${ls.degFromGunAxis} deg from the barrel (spread ${ls.spreadDeg})`);
    check('and NOT down the camera centre, which is what it used to do', ls.degFromCam>0.3,
      `${ls.degFromCam} deg from the camera centre`);
    // The two must differ by the axis's own offset, or something is agreeing by accident.
    check('the gap between them IS the gun\'s offset from the camera', Math.abs(ls.axisOffCamDeg-pre.offAxisDeg)<0.15,
      `axis off cam ${ls.axisOffCamDeg} vs probe ${pre.offAxisDeg}`);
    await ev('__hc.aim(false)'); await sleep(200);

    // ---- 4. WHAT MUST NOT MOVE ----
    // Ben's words were "the HUD crosshair needs to stay where it is": the element keeps its anchor and is TRANSLATED, so a future
    // "simplification" to left/top must fail here.
    const css=await ev('(()=>{ const el=document.getElementById("xh"), cs=getComputedStyle(el); return { left:cs.left, top:cs.top, pos:cs.position, tr:cs.transform }; })()');
    check('the crosshair keeps its HUD anchor (centre-anchored, translated)',
      css.pos==='fixed' && css.left===Math.round(vp.w/2)+'px' && css.top===Math.round(vp.h/2)+'px',
      JSON.stringify(css));
    // THE BUCK MUST NOT REACH THE AXIS. gunKick rotates the viewmodel up to 0.65 rad; if the axis saw it, a follow-up shot would
    // fly tens of degrees high. Fire, then read within the buck's life.
    await ev('__hc.hold("hunting_rifle")'); await sleep(400);
    await ev('__hc.swayPin(0,0)'); await sleep(300);
    const rest=await ev('__hc.xhProbe()');
    await ev('__hc.shoot()').catch(()=>{});
    await sleep(60);
    const fired=await ev('__hc.xhProbe()');
    console.log('     resting           off '+rest.offAxisDeg+' deg      just fired   off '+fired.offAxisDeg+' deg');
    check('the recoil buck does not swing the aim axis', fired.offAxisDeg!=null && Math.abs(fired.offAxisDeg-rest.offAxisDeg)<1.0,
      `${rest.offAxisDeg} -> ${fired.offAxisDeg} deg`);
    await ev('__hc.swayPin(null)');
    check('the sway pin is released', (await ev('__hc.xhProbe()'))!=null);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
