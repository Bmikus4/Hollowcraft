// THE DOT IS IN ITS OWN WINDOW, AT EVERY STAGE OF THE RAISE, ON EVERY DOT GUN.
//
// Ben 08-11: "holosights arent aligned, fix them once and for all." Settled and aimed they always were — measured 0.6-2.6 px
// from the middle of the glass. What was broken was everything before that: the ring was pinned to the BORE from the frame
// it lit, and the bore sits within a tenth of a degree of screen centre while the window is still out where the hip carry
// left it. Measured across the ramp: 217 px from the centre of its own window at adsT 0.31 on the AR, 182 px on the rifle.
// A lit dot in open screen with the sight nowhere near it, for the whole raise — and the 0.42 s ADS ramp doubled the time
// you spend looking at it.
//
// SO THIS FILE MEASURES THE RAMP, NOT THE ENDPOINT. A single fully-aimed sample passed the entire time the fault existed,
// which is exactly why it went unnoticed. Three positions are projected to SCREEN PIXELS — the unit the complaint is in:
//   glass  the centre of the sight's rear window (userData.rearGlass) — the hole you look through
//   holo   where the reticle mesh actually is
//   bore   where the round goes (view.aimCam, the axis fireGun uses)
//
// THE BUDGET IS THE WINDOW, not zero. At the ADS fov the aperture is about 50 px across, and the gun is SUPPOSED to wobble
// around a camera-locked reticle once settled (Ben 08-04: the dot "should just slide off the plane"). So the ring may leave
// the centre — it may not leave the glass. 12 px is inside the window with room for the settle overshoot; the raise itself
// now measures 0, because below the cheek the ring rides the glass exactly.
//
//   node bench/assert-holo-align.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));}); });
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function poll(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250);});})();});
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const RAISE_BUDGET=12, SETTLED_BUDGET=4, MOVE_BUDGET=12;
let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d===undefined?null:d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d===undefined?null:d)); };

// Sample per FRAME while the sight comes up / while something moves. Only frames where the ring is VISIBLE count: a dot
// nobody can see cannot be misaligned, and the fade-in is what decides when it starts to matter.
/* eslint-disable no-undef */
const SAMPLE=(cfg)=>new Promise(res=>{
  const rows=[]; let i=0;
  const tick=()=>{
    if(cfg.turn) __hc.cam({yaw:(__hc.pos().yaw||0)+cfg.turn});
    if(cfg.key && i===0) __hc.key(cfg.key,true);
    const a=__hc.holoAlign();
    // A FRAME WHERE THE AIM IS BEING REFUSED IS NOT A MEASUREMENT OF ALIGNMENT. ADS is dropped outright when the muzzle
    // comes near a wall (gunBend>0.55) and while a bolt cycles, so walking into a tree drops the sight and the pose swings
    // back to the hip while the ring is still fading — 118 px of "misalignment" that is the gun going back to the hip.
    // For the motion cases only settled frames count; `minT` is 0 for the raise, which is the whole point of that one.
    // …and neither is a gun being stood up off a wall: the block-out swings the model, glass included, around a ring that
    // stays on the camera axis. Measured 75 px while turning past a trunk, which is that tilt and not the sight.
    if(a.retVisible && +a.adsT>=(cfg.minT||0) && (cfg.anyBend || a.bend<=0.05))
      rows.push([+a.adsT, a.holoVsGlass, a.boreVsGlass, a.glassOff]);
    if(++i<cfg.frames) requestAnimationFrame(tick);
    else { if(cfg.key) __hc.key(cfg.key,false);
      const worst=(lo,hi)=>{ let w=0, at=null;
        for(const r of rows){ if(r[0]<lo||r[0]>hi) continue; if((r[1]||0)>w){ w=r[1]||0; at=r[0]; } }
        return { px:+w.toFixed(2), at:at==null?null:+at.toFixed(3) }; };
      res({ n:rows.length, raise:worst(0,0.995), settled:worst(0.995,1.001), all:worst(0,2),
            bore:+Math.max.apply(null,[0].concat(rows.filter(r=>r[0]>0.995).map(r=>r[2]||0))).toFixed(2) }); } };
  requestAnimationFrame(tick); });

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);

    const guns=(await page.evaluate('__hc.itemClasses()')).gunsAll||[];
    const dots=guns.filter(g=>/_dot$/.test(g));
    ok('the build has holosight guns to check', dots.length>=3, dots);
    for(const g of dots){
      // FACING THE SAME WAY FOR EVERY GUN, and back where the previous variant's backpedal started. Not a tp: the two
      // coordinates tried put the player somewhere with a trunk in the muzzle, which refuses ADS outright — the run then
      // reports a sight that never aimed as a sight that is 258 px misaligned.
      await page.evaluate('__hc.cam({yaw:0.2, pitch:-0.05})'); await sleep(200);
      await page.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1")`); await sleep(250);
      await page.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(400);
      // A GUN JUST DRAWN, aimed for the first time — the state the one-frame flash lived in: the glass lookup used to sit
      // inside the ring's own visibility block, so on the frame the dot lit nothing had found the window yet.
      await page.evaluate('__hc.aim(true)');
      const up=await page.evaluate(SAMPLE,{frames:110});
      // WAIT FOR THE AIM TO ACTUALLY BE UP before the settled reading. A bolt gun refuses ADS while its action is cycling
      // (view.boltT) and every gun refuses while reloading, so a fresh /give can spend the whole raise window declining to
      // aim — which reads as a wildly misaligned sight (glass 235 px off centre, no ring at all) when it is a gun that was
      // never aimed. Poll for the settled state rather than trusting the frame count.
      let st=null;
      for(let i=0;i<40;i++){ st=await page.evaluate('__hc.holoAlign()'); if(st.adsT>=0.999 && st.retVisible) break; await sleep(120); }
      const mv=await page.evaluate(SAMPLE,{frames:60,turn:0.03,minT:0.999});
      const wk=await page.evaluate(SAMPLE,{frames:70,key:'KeyS',minT:0.999});   // backpedal: walking FORWARD presses the muzzle into whatever is ahead
      // THE FRAME IS TAKEN AIMED. Shot after aim(false) it is a picture of the hip carry, which says nothing about a sight.
      await page.screenshot({path:path.join(OUT,'holo-'+g+'.png')});
      await page.evaluate('__hc.aim(false)'); await sleep(300);
      console.log('  '+g);
      ok('  the window exists on the model',        st.hasGlass===true, {glass:st.glass});
      ok('  it reached a settled aim',              st.adsT>=0.999 && st.retVisible===true, {adsT:st.adsT, ret:st.retVisible});
      ok('  the ring never leaves its glass on the way up', up.raise.px<=RAISE_BUDGET, up.raise);
      // SETTLED IS READ FROM A SETTLED FRAME, not from the tail of the ramp: adsT prints 0.995 while the sight is still
      // arriving, and the overshoot the gun is meant to have is not a misalignment.
      ok('  settled, it is on the window centre',   st.holoVsGlass!=null && st.holoVsGlass<=SETTLED_BUDGET, {px:st.holoVsGlass});
      ok('  settled, it is on the BORE (impact)',   st.boreVsGlass!=null && st.boreVsGlass<=SETTLED_BUDGET, {boreVsGlass:st.boreVsGlass, holoVsBore:st.holoVsBore});
      ok('  the settle wobble stays in the glass',  up.settled.px<=MOVE_BUDGET, up.settled);
      ok('  turning does not carry it out of the glass', mv.all.px<=MOVE_BUDGET, mv.all);
      ok('  walking does not either',               wk.all.px<=MOVE_BUDGET, wk.all);
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  if(errs.length) console.log('  page errors: '+JSON.stringify(errs.slice(0,4)));
  console.log((fails||errs.length?'FAIL ':'PASS ')+(checks-fails)+'/'+checks+' checks');
  process.exit(fails||errs.length?1:0);
})();
