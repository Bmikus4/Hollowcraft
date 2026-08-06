// A SHIELD IS A SHIELD IN EITHER THIRD-PERSON HAND, AND BOTH LEAN FORWARD (Ben 08-05).
//
// "rotate shields forward slightly in the off hand in 3rd person, and make the main hand shield in 3rd person look like that one,
// its tiny and rotated." setAvatarHeld had NO shield branch, so a board in the main hand fell into the generic tools/materials else:
// scale 0.5 on a 0.46-tall model is a 23 cm plate, canted -0.4 about X and +0.25 about Z. Both hands now call _tpsShieldPose.
//
// Measured in metres and degrees, not in scale factors — the two wrappers carry different rotations and the models come in different
// sizes, so only a world AABB and a body-local direction can be compared. Body-local because the rig is built facing +z: a top edge
// with positive z leans toward where the body is looking, which is what "forward" means, and it does not move when the player turns.
//
//   node bench/assert-tps-shield.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300); await sleep(1500);
    await page.evaluate(`__hc.qaLocked(true)`);

    // A shield in BOTH hands, in third person. offEquip is the only way to reach the offhand (giveItem lands in the hotbar, which
    // is the main hand); heldInHand is the main one. The rig has to be stepped after both so the wrappers exist.
    await page.evaluate(`__hc.tpsProbe(true)`);
    await page.evaluate(`__hc.heldInHand('shield')`);
    await page.evaluate(`__hc.offEquip('shield')`);
    await sleep(600);
    await page.evaluate(`__hc.tpsProbe(true)`);
    const r=await page.evaluate(`__hc.tpsShield()`);
    if(r.err||r.no){ console.log('  probe failed', JSON.stringify(r)); process.exit(1); }
    console.log('    main', JSON.stringify(r.main));
    console.log('    off ', JSON.stringify(r.off));

    ok('both hands hold a board', !!r.main && !!r.off, {main:!!r.main, off:!!r.off});
    if(!r.main||!r.off){ console.log('\n1 failed'); console.log('RESULT: FAIL'); process.exit(1); }

    // ---- THE MAIN HAND IS NOT TINY ANY MORE ----
    // Against the FITTED size, not the world AABB: the drawn box is the box of a tilted plate, so it reads ~0.80 for a board fitted
    // to 0.85 and reports a 0.63 m "thickness" that is the tilt spreading a 2 cm plank across z. The generic else the main hand used
    // to fall into gave scale 0.5, i.e. a 23 cm plate on a 1.8 m body.
    ok('the main-hand board is body-sized, not a 23 cm plate', !!r.main.fit && Math.abs(r.main.fit.span-0.85)<0.01, r.main.fit);
    ok('the two boards are fitted identically', JSON.stringify(r.main.fit)===JSON.stringify(r.off.fit), {main:r.main.fit, off:r.off.fit});
    // A RATIO, not an absolute: itemModel('shield') is not the bare extruded board (buildHeldShield's 0.014 depth) and its fitted
    // depth is 0.105 m. 12% of its own height is a plank; the point of the check is that fitting to 0.85 has not turned it into a cube.
    ok('the board is a plank, not a slab', !!r.main.fit && r.main.fit.d < r.main.fit.h*0.2, {d:r.main.fit&&r.main.fit.d, h:r.main.fit&&r.main.fit.h});
    ok('and it is taller than it is wide, like a heater shield', !!r.main.fit && r.main.fit.h>r.main.fit.w, r.main.fit);
    ok('the drawn box is roughly the fitted board, tilt included', Math.abs(r.main.span-r.off.span)<0.005 && r.main.span>0.7, {main:r.main.span, off:r.off.span});

    // ---- THE MAIN HAND IS NOT ARBITRARILY ROTATED ANY MORE: it is posed like the offhand ----
    const dRot=[0,1,2].map(i=>+Math.abs(r.main.rot[i]-r.off.rot[i]).toFixed(4));
    ok('the two wrappers carry the same rotation', dRot.every(d=>d<0.001), {main:r.main.rot, off:r.off.rot, delta:dRot});
    ok('it is no longer the generic -0.4/0.25 cant', Math.abs(r.main.rot[0]+0.4)>0.05 || Math.abs(r.main.rot[2]-0.25)>0.05, r.main.rot);

    // ---- FORWARD, AND ONLY SLIGHTLY ----
    // WHICH WAY IS FORWARD IS MEASURED, NOT ASSERTED FROM THE SIGN OF A CONSTANT. The wrapper is turned PI about Y and the hand node
    // cancels the arm's carry angle, so the board's orientation is a product of three rotations and no single line predicts it. The
    // rig is built facing +z in its own space, so a top edge whose z RISES has leaned toward the body's front. Sweeping the dial is
    // the only honest way to know the sign — and it is also what tells "slightly" from "flat on its back".
    const sweep={};
    for(const v of [-0.22, 0, 0.22]){ const s=await page.evaluate(`__hc.tpsShieldTilt(${v})`); sweep[v]={topZ:s.off.top[2], tiltDeg:s.off.tiltDeg}; }
    console.log('    tilt sweep', JSON.stringify(sweep));
    ok('a POSITIVE tilt carries the top edge forward', sweep['0.22'].topZ > sweep['0'].topZ && sweep['0'].topZ > sweep['-0.22'].topZ,
       {neg:sweep['-0.22'].topZ, zero:sweep['0'].topZ, pos:sweep['0.22'].topZ});
    // 0.22 rad is 12.6 degrees of lean off whatever the hand was already doing. Measured as the CHANGE, because the hand's own
    // contribution is not the shield's to claim.
    const gained=sweep['0.22'].tiltDeg - sweep['0'].tiltDeg;
    console.log('    forward gained by the dial', gained.toFixed(2), 'deg');
    ok('the dial moves it about 12-13 degrees forward', gained>9 && gained<16, {gainedDeg:+gained.toFixed(2)});

    // Restore the shipped value and check what actually ships.
    const shipped=await page.evaluate(`__hc.tpsShieldTilt(0.22)`);
    ok('the shipped constant is the forward one', shipped.set===0.22, {tilt:shipped.set});
    ok('the main hand leans by the same amount as the offhand', Math.abs(shipped.main.tiltDeg-shipped.off.tiltDeg)<0.5, {main:shipped.main.tiltDeg, off:shipped.off.tiltDeg});
    // A shield still has to be a shield: the board's face points broadly along the body's forward axis, not at the sky, and the
    // board is still standing up rather than lying back.
    ok('the board still faces out, not up', Math.abs(shipped.off.face[2])>0.7 && Math.abs(shipped.off.face[1])<0.55, {face:shipped.off.face});
    ok('the board is still mostly upright', shipped.off.top[1]>0.85, {top:shipped.off.top});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
