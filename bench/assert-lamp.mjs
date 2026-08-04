// A HANGING LAMP IS INVISIBLE FROM BELOW, AND ITS LIGHT DOES NOT SWING WITH IT.
//
// Two independent faults in one fixture (#48).
//
// (a) cyl() is CylinderGeometry WITH CAPS, so the wide end of the shade was closed by a flat metal disc sitting
//     between the eye and the bulb — and a voxel interior has no emissive of its own, so with nothing shining on
//     it from below that disc rendered as a black plate. The one angle you always see a ceiling lamp from is
//     underneath. Fixed by opening the shade (openEnded), drawing it DoubleSide so its outer wall still shows from
//     inside, and adding an unshaded liner standing in for bounce off the bulb.
//
// (b) blockLight is BAKED to the cell and physically cannot follow a moving mesh — and pointPool, the resident
//     dynamic-light pool, was ALSO placing its light at the cell centre. So the lamp swung on the chime pendulum
//     while its light stayed nailed to the ceiling. Fixed by aiming the pool light it already had at the bulb.
//     No light is created: the pool is resident from boot precisely because a mid-game light-count change
//     recompiles every lit material, so poolSize is asserted as part of the fix, not as a detail.
//
// Measured from the objects themselves, not from a screenshot: a raycast up from below (Raycaster honours
// material.side, which is exactly the property that was wrong) and the bulb's own world position against the
// light's. bench/README lesson 2: judging this by photographing it is how four other features got misjudged.
//
//   node bench/assert-lamp.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(name,ok,detail)=>{ checks++; if(!ok) fails++; console.log((ok?'  PASS  ':'  FAIL  ')+name+(detail!==undefined?('   '+detail):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    const pr = await page.evaluate(`__hc.probe()`);
    // NIGHT, and standing right under it: the pool only lights the nearest emitters, and the fault this measures is
    // one you can only see from underneath in the dark.
    await page.evaluate(`(()=>{ __hc.lock(true); __hc.setTime(0.0); __hc.tp(${pr.spawnX}, ${pr.spawnZ}); })()`);
    await sleep(2500);
    const place = await page.evaluate(`(()=>{ const p=__hc.st(); const x=Math.floor(p.px), z=Math.floor(p.pz), y=Math.floor(p.py)+3;
      const r=__hc.lampPlace(x,y,z); return Object.assign({x,y,z}, r); })()`);
    await sleep(2500);
    check('a hanging light is placed and on the pendulum list', place.onChimeList===true, JSON.stringify(place));
    check('and it is a baked emitter (light 14)', place.light>0, `blockLight ${place.light}`);

    // ---- (a) VISIBLE FROM BELOW ----
    const below = await page.evaluate(`__hc.lampSeeBelow(${place.x},${place.y},${place.z},1.2)`);
    check('a ray from below reaches the lamp at all', (below.lampParts||[]).length>0, JSON.stringify(below.lampParts||below));
    // OFF-AXIS IS THE CHECK THAT DISCRIMINATES. Straight up the middle the ray strikes the bulb, and the bulb's lower
    // 0.095 hung below the old closed cap as well — so an axial hit passes on the bug and proves nothing. At 0.2 off
    // centre the ray has to cross the shade wall itself, which is the surface that was capped and single-sided.
    const belowOff = await page.evaluate(`__hc.lampSeeBelow(${place.x},${place.y},${place.z},1.2,0.2,0)`);
    check('off-axis from below, the open shade and its lit liner are there',
      belowOff.sawLiner===true && (belowOff.lampParts||[]).indexOf('lampShade')>=0,
      `parts ${JSON.stringify(belowOff.lampParts)}, first ${belowOff.first}`);
    // firstAny, NOT sawBulb: looking straight up, the FIRST surface must be the bulb. sawBulb passed while a nameless
    // capped guard hoop sat in front of it — the fault was an occluder the filtered list did not even contain.
    check('looking straight up, the bulb is the first thing there — nothing lids it',
      below.firstAny==='lampBulb', `first ${below.firstAny}, all ${JSON.stringify(below.all)}`);

    // ---- (b) THE LIGHT FOLLOWS THE SWING ----
    // Read the gap while the lamp is at REST first: any constant offset between bulb and light would otherwise be
    // mistaken for tracking. Then shove it and confirm the swing actually moved and the gap did NOT grow.
    const rest = await page.evaluate(`__hc.lampLightTrack(${place.x},${place.y},${place.z})`);
    check('the pool lights the lamp at rest', rest.gap!=null && rest.lit>0, JSON.stringify(rest));
    // 0.12, NOT 0.35. A full swing displaces the bulb ~0.34 from its cell, and a 0.35 threshold therefore PASSED on the
    // unfixed code at a measured 0.3267 — a coin toss decided by how hard the shove was (bench/README lesson 5: check
    // the margin, not the sign). Tracking measures 0.0000-0.05, so 0.12 clears the real values by 2x and the failure
    // mode by 3x.
    check('at rest the light sits on the bulb', rest.gap!=null && rest.gap<0.12, `gap ${rest.gap}`);
    const poolAtRest = rest.poolSize;

    const shoved = await page.evaluate(`(()=>{ const r=__hc.lampShove(${place.x},${place.y},${place.z}); return r; })()`);
    await sleep(300);
    const swung = await page.evaluate(`__hc.lampLightTrack(${place.x},${place.y},${place.z})`);
    check('the lamp is genuinely swinging', shoved.moved>0.01 && Math.abs(swung.ax)+Math.abs(swung.az)>0.01,
      `shove moved ${shoved.moved}, ax ${swung.ax}, az ${swung.az}`);
    check('the light is STILL on the bulb while it swings', swung.gap!=null && swung.gap<0.12,
      `gap ${swung.gap} (rest ${rest.gap}), swing ax ${swung.ax}`);
    // The load-bearing one: a swung bulb is displaced from its cell, so if the light were still at the cell the gap
    // would be the displacement itself. 0.62 is the cord length, so a full-swing displacement is ~0.34.
    check('and the light is not left at the cell centre',
      swung.gap!=null && swung.gap < Math.abs(swung.ax)*0.62*0.5 + 0.06,
      `gap ${swung.gap} vs cell-offset ${(Math.abs(swung.ax)*0.62).toFixed(4)}`);
    check('no light was created — the pool size never changed', swung.poolSize===poolAtRest,
      `poolSize ${poolAtRest} -> ${swung.poolSize}, lit ${swung.lit}`);

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('THE BUG IS PRESENT: the shade is closed from below, or the light stays on the cell while the lamp swings.');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
