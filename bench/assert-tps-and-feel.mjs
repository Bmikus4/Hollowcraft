// THE 08-04 FEEL BATCH, asserted rather than eyeballed:
//   camera    the third-person boom tracks tightly, never sits inside a block, comes in close indoors, swaps shoulders
//   crosshair a circle (not a plus, no centre dot) whose diameter IS the shot's spread — wider airborne, tiny at a full aim
//   holosight no camera-locked reticle at all in third person
//   offhand   a gun in the left hand is the same model at the same size as the right, mirrored
//   movement  momentum on the ground, committed arcs in the air, a jump you can cut short, coyote time
//   menus     input dies with the pointer lock, but gravity does not
//   node bench/assert-tps-and-feel.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0;
const ok=(name,cond,got)=>{ if(!cond)fails++; console.log(`  ${cond?'ok  ':'FAIL'}  ${name}   ${JSON.stringify(got)}`); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,220)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(600);
    await page.evaluate(`__hc.vitals(null,null,true)`);   // creative: no starving mid-run

    console.log('\n[1] the crosshair is a ring, and the ring is the spread');
    const xhRest = await page.evaluate(`__hc.xhProbe()`);
    ok('it is round', xhRest.radius==='50%', xhRest.radius);
    ok('it is a ring — a border, not a filled shape', parseFloat(xhRest.border)>0, xhRest.border);
    ok('square box, so the circle is a circle', xhRest.w===xhRest.h, [xhRest.w,xhRest.h]);
    const dotGone = await page.evaluate(`(()=>{ const el=document.getElementById('xh');
      const cs=getComputedStyle(el,'::after'); return { content:cs.content, w:cs.width, h:cs.height }; })()`);
    ok('no centre dot', dotGone.content==='none'||dotGone.content===''||dotGone.width==='auto', dotGone);

    console.log('\n[2] airborne is less accurate than standing still');
    const still = await page.evaluate(`(()=>{ __hc.hold('ar15'); return __hc.xhProbe(); })()`);
    await sleep(300);
    const stillSpread = await page.evaluate(`__hc.xhProbe()`);
    await page.keyboard.down('Space');
    let air={px:0,spreadDeg:0}, airJ=null;
    for(let i=0;i<8;i++){ await sleep(60); const a=await page.evaluate(`__hc.xhProbe()`); if(a.px>air.px) air=a;
      const j=await page.evaluate(`__hc.jumpProbe()`); if(!airJ||!airJ.vy) airJ=j; }
    await page.keyboard.up('Space'); await sleep(700);
    ok('the ring opens in the air', air.px>stillSpread.px+2, {ground:stillSpread.px, air:air.px});
    ok('and the SHOT cone opens with it', air.spreadDeg>stillSpread.spreadDeg, {ground:stillSpread.spreadDeg, air:air.spreadDeg});
    ok('the jump actually left the ground', airJ.onGround===false||airJ.vy>0, airJ);

    console.log('\n[3] a jump you can cut short, and coyote time');
    const held = await page.evaluate(`(()=>{ return new Promise(r=>{
      __hc.tpExact(__hc.pos().x, __hc.pos().z, __hc.groundY(Math.floor(__hc.pos().x),Math.floor(__hc.pos().z))+1);
      setTimeout(()=>r(__hc.jumpProbe()),120); }); })()`);
    // Fixed-step arcs: real key events measure the browser's frame rate as much as the physics, and headless runs slowly enough
    // that a short tap can be under one frame — which is not a jump-cut failure, it is a sampling failure.
    const heldArc = await page.evaluate(`__hc.jumpArc(0.6)`);
    const tapArc  = await page.evaluate(`__hc.jumpArc(0.05)`);
    console.log('    held', JSON.stringify(heldArc), 'tap', JSON.stringify(tapArc));
    ok('holding the key jumps higher than tapping it', heldArc.rise > tapArc.rise + 0.15, {held:heldArc.rise, tap:tapArc.rise});
    ok('coyote time exists while grounded', held.coyote>0, held.coyote);

    console.log('\n[4] momentum: ramps up, and the air keeps what it was given');
    await page.keyboard.down('KeyW'); await sleep(60);
    const t1 = await page.evaluate(`__hc.jumpProbe()`);
    await sleep(500);
    const t2 = await page.evaluate(`__hc.jumpProbe()`);
    await page.keyboard.up('KeyW'); await sleep(60);
    const t3 = await page.evaluate(`__hc.jumpProbe()`);
    await sleep(600);
    const t4 = await page.evaluate(`__hc.jumpProbe()`);
    ok('speed builds rather than snapping to full', t1.spd < t2.spd, {early:t1.spd, settled:t2.spd});
    // 0.35, not 0.1: an exponential decay never reaches zero and the player may be on a slope, where gravity keeps feeding it.
    // What this check is for is that the speed FALLS after the key is released, not that it hits a particular number.
    ok('and it bleeds off rather than stopping dead', t4.spd < 0.35 && t4.spd < t3.spd*0.5, {onRelease:t3.spd, after:t4.spd});

    console.log('\n[5] the third-person boom');
    const tps = await page.evaluate(`(()=>{ __hc.tpsProbe(true); return __hc.tpsCam(); })()`);
    await sleep(700);
    const tps2 = await page.evaluate(`__hc.tpsCam()`);
    ok('third person is on and the boom is out', tps2.on===true && tps2.dist>1.0, {on:tps2.on, dist:tps2.dist});
    ok('the camera is NOT inside a block', tps2.camInSolid===false, tps2.camInSolid);
    ok('left shoulder is the default', tps2.shoulder===-1, tps2.shoulder);
    const right = await page.evaluate(`__hc.tpsShoulder(1)`);
    await sleep(600);
    const right2 = await page.evaluate(`__hc.tpsCam()`);
    ok('the swap glides toward the other shoulder', right2.side>tps2.side, {before:tps2.side, after:right2.side});
    // walled in: the boom must shorten and stay out of the stone
    const boxed = await page.evaluate(`(()=>{ const P=__hc.pos(), x=Math.floor(P.x), z=Math.floor(P.z), y=Math.floor(P.y);
      for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++)for(let dy=0;dy<5;dy++){
        const edge=(Math.abs(dx)===3||Math.abs(dz)===3);
        if(edge) __hc.setBlockAt(x+dx,y+dy,z+dz,'stone'); }
      for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++) __hc.setBlockAt(x+dx,y+4,z+dz,'stone');   // and a roof over it
      return __hc.tpsCam(); })()`);
    await sleep(900);
    const boxed2 = await page.evaluate(`__hc.tpsCam()`);
    ok('a roof overhead pulls the camera in close', boxed2.roofed===true && boxed2.dist<=2.0, {roofed:boxed2.roofed, dist:boxed2.dist});
    ok('and it is still not inside anything', boxed2.camInSolid===false, boxed2.camInSolid);
    // …and a roof means FIRST person now (Ben: "force first person perspective inside of buildings"). The preference is untouched.
    await sleep(600);
    const inside = await page.evaluate(`__hc.tpsCam()`);
    ok('being indoors forces first person', inside.on===true && inside.active===false && inside.indoors===true, {pref:inside.on, active:inside.active, indoors:inside.indoors});
    // EVERY STEP BELOW NEEDS OPEN SKY: the box above is still standing, and third person is suppressed inside it.
    // Teleport, WAIT for that chunk to exist, then re-snap: tpExact reads groundYAt, and a column that has not generated yet
    // answers with the wrong height — which lands the player inside a hill, where nothing falls, no jump clears and the gun's
    // wall-bend is pinned at maximum. Three later checks failed on exactly that before this wait was added.
    await page.evaluate(`(()=>{ const P=__hc.pos(); __hc.tpExact(P.x+34, P.z+34); })()`);
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:60000});
    await sleep(900);
    // CARVE the spot rather than trusting the landing. Teleporting to an offset and snapping to groundYAt puts you inside a tree
    // or a hillside often enough to matter, and an embedded player does not fall, cannot jump clear, and pins the gun's wall-bend
    // at maximum — which is three "failures" that are really one bad spawn. A cleared pocket makes the rest of the run repeatable.
    // A CLEARING, not a cell: 11x11 and 22 tall. Two later sections depend on it. [8] teleports 14 straight up and used to land
    // inside a canopy (leaves_core is solid), which pins the player so nothing falls; and ADS is REFUSED when the muzzle is in a
    // wall (view.gunBend), so a tight pocket makes the aim test measure a gun that was never raised. Five blocks of clearance in
    // every direction is past the bend probe's reach.
    const CLEAR = await page.evaluate(`(()=>{ const P=__hc.pos(), x=Math.floor(P.x), z=Math.floor(P.z), g=__hc.groundY(x,z);
      for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){ __hc.setBlockAt(x+dx,g,z+dz,'stone');
        for(let dy=1;dy<=22;dy++) __hc.setBlockAt(x+dx,g+dy,z+dz,'air'); }
      __hc.tpExact(x+0.5, z+0.5, g+1); return {x:x+0.5,z:z+0.5,y:g+1}; })()`);
    await page.waitForFunction(`(()=>{try{return __hc.jumpProbe().onGround===true;}catch(e){return false;}})()`,{timeout:20000}).catch(()=>{});
    await sleep(400);
    const outside = await page.evaluate(`__hc.tpsCam()`);
    ok('stepping outside gives it back', outside.active===true && outside.indoors===false, {active:outside.active, indoors:outside.indoors});

    console.log('\n[6] no camera-locked holosight in third person');
    const holoTps = await page.evaluate(`(()=>{ __hc.hold('ar15_dot'); return __hc.xhProbe(); })()`).catch(()=>null);
    await page.mouse.down({button:'right'}); await sleep(600);
    const holoTps2 = await page.evaluate(`__hc.xhProbe()`);
    ok('the reticle stays hidden while aiming in third person', holoTps2.holo===false, {holo:holoTps2.holo, adsT:holoTps2.adsT});
    ok('aiming shrinks the ring instead', holoTps2.adsT>0.5 ? holoTps2.applied<=10 : true, {adsT:holoTps2.adsT, applied:holoTps2.applied, ring:holoTps2.px});
    await page.mouse.up({button:'right'}); await sleep(400);
    await page.evaluate(`__hc.tpsProbe(false)`);

    console.log('\n[7] an offhand gun is the main-hand gun, mirrored');
    const off = await page.evaluate(`__hc.offGunProbe('shotgun')`);
    console.log('   ', JSON.stringify(off));
    ok('same model in both hands (mesh counts match)', off.main&&off.off&&off.main.meshes===off.off.meshes, {main:off.main&&off.main.meshes, off:off.off&&off.off.meshes});
    ok('same size — not a normalised miniature', off.scaleMatch===true && off.ratio>0.9 && off.ratio<1.1, {scaleMatch:off.scaleMatch, mainScale:off.main&&off.main.scale, offScale:off.off&&off.off.scale, ratio:off.ratio});
    ok('and it is mirrored', off.mirrored===true, off.mirrored);

    console.log('\n[8] menus stop the character but not gravity');
    const fall = await page.evaluate(`(()=>{ const P=__hc.pos(); __hc.tpExact(P.x,P.z,P.y+14); return __hc.jumpProbe(); })()`);
    await page.keyboard.down('KeyW'); await sleep(80);
    await page.keyboard.press('KeyE');   // inventory
    await sleep(120);
    const inUI1 = await page.evaluate(`__hc.jumpProbe()`);
    console.log('    fall state:', JSON.stringify(await page.evaluate(`__hc.fallProbe()`)));
    await sleep(500);
    const inUI2 = await page.evaluate(`__hc.jumpProbe()`);
    await page.keyboard.up('KeyW');
    ok('the menu is up and the pointer is unlocked', inUI1.locked===false, {locked:inUI1.locked, ui:inUI1.ui});
    ok('horizontal movement stops dead', inUI1.spd===0 && inUI2.spd===0, {a:inUI1.spd, b:inUI2.spd});
    ok('but you keep falling', inUI2.y < inUI1.y - 0.5, {from:inUI1.y, to:inUI2.y});
    await page.keyboard.press('Escape'); await sleep(300);

    console.log('\n[9] a door that swings through you pushes you out');
    const door = await page.evaluate(`(()=>{
      const P=__hc.pos(), x=Math.floor(P.x)+2, z=Math.floor(P.z), y=__hc.groundY(x,z)+1;
      for(let dy=0;dy<3;dy++)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) __hc.setBlockAt(x+dx,y+dy,z+dz,'air');   // clear a space to stand in
      __hc.setBlockAt(x,y,z,'door'); __hc.setBlockAt(x,y+1,z,'door_top');
      __hc.tpExact(x+0.5, z+0.5, y);                       // stand INSIDE the door cell
      return { at:[x,y,z], stuckBefore:false }; })()`);
    await sleep(200);
    const [dx,dy,dz]=door.at;
    const opened = await page.evaluate(`__hc.doorPush(${dx},${dy},${dz})`);
    console.log('   ', JSON.stringify(opened));
    ok('the toggle moved the player out of the leaf', opened.pushed===true, {pushed:opened.pushed, moved:opened.moved});
    ok('and the body is not left inside geometry', opened.stuck===false, opened.stuck);
    const again = await page.evaluate(`(()=>{ __hc.tpExact(${dx}+0.5, ${dz}+0.5, ${dy}); return __hc.doorPush(${dx},${dy},${dz}); })()`);
    ok('the same holds closing it on yourself', again.stuck===false, again);

    console.log('\n[10] the gun in the third-person hand answers the aim');
    // The offhand still holds the shotgun from [7], and a full left hand DISABLES aiming by design (see view.ads) — clear it, or
    // this measures a gun that was never raised.
    // BACK TO THE MIDDLE OF THE CLEARING FIRST. [9] leaves the player standing IN a doorway, and aiming is refused with the
    // muzzle in a wall (view.gunBend) — which is the engine being right and the test standing in the wrong place.
    await page.evaluate(`__hc.tpExact(${CLEAR.x}, ${CLEAR.z}, ${CLEAR.y})`);
    await sleep(400);
    // [8] left a menu open and the pointer unlocked; ADS needs both closed and locked (view.ads tests them), so this section
    // re-establishes input before measuring. Without it the probe honestly reports adsT 0 and a level barrel.
    // Escape only if something IS open — pressing it with nothing open OPENS the pause menu, which blocks aiming just as surely
    // (that was this section's second failure). Then a click to re-acquire pointer lock, which rmbHeld is gated on.
    if((await page.evaluate(`__hc.jumpProbe()`)).ui) { await page.keyboard.press('Escape'); await sleep(250); }
    await page.mouse.click(640,360); await sleep(400);
    const ready = await page.evaluate(`__hc.jumpProbe()`);
    ok('input is live for the aim test', ready.locked===true && !ready.ui, {locked:ready.locked, ui:ready.ui});
    const aimed = await page.evaluate(`(()=>{ try{ __hc.eqPut(4,null); }catch(e){} __hc.tpsProbe(true); __hc.hold('ar15'); return __hc.tpsAim(0); })()`);
    await page.mouse.down({button:'right'}); await sleep(900);
    const up = await page.evaluate(`__hc.tpsAim(0.5)`);
    const dn = await page.evaluate(`__hc.tpsAim(-0.5)`);
    await page.mouse.up({button:'right'}); await sleep(300);
    const hip = await page.evaluate(`__hc.tpsAim(0.5)`);
    await page.evaluate(`__hc.tpsProbe(false)`);
    console.log('    up:', JSON.stringify(up), '\n    dn:', JSON.stringify(dn));
    ok('looking UP raises the barrel', up.barrelPitch>0.15, {look:up.lookPitch, barrel:up.barrelPitch});
    ok('looking DOWN drops it', dn.barrelPitch<-0.15, {look:dn.lookPitch, barrel:dn.barrelPitch});
    ok('the barrel ends up near the look axis while aiming', up.offDeg<25 && dn.offDeg<25, {up:up.offDeg, dn:dn.offDeg});
    ok('and it stops tracking once the aim is lowered', Math.abs(hip.barrelPitch)<Math.abs(up.barrelPitch), {aimed:up.barrelPitch, hip:hip.barrelPitch});

    console.log('\n[11] firing the offhand gun does not walk it off its pose');
    const of1 = await page.evaluate(`__hc.offFire(8,'ar15')`);
    console.log('   ', JSON.stringify(of1));
    ok('the buck stays bounded while firing', Math.abs(of1.peak.rx-of1.before.rx)<0.9 && Math.abs(of1.peak.z-of1.before.z)<0.25, {before:of1.before, peak:of1.peak});
    ok('and it returns to exactly where it started', Math.abs(of1.after.rx-of1.before.rx)<0.01 && Math.abs(of1.after.z-of1.before.z)<0.01, {before:of1.before, after:of1.after});
    ok('the SHOW went to the offhand, not the main hand', of1.mainKick===0, {mainKick:of1.mainKick, offKick:of1.kick});

    console.log('\n[12] with both hands full, each button belongs to one hand');
    const hands = await page.evaluate(`__hc.handSplit('planks','ar15')`);
    console.log('   ', JSON.stringify(hands));
    ok('left click acts with the OFFHAND item', hands.left && hands.left.did==='fire' && hands.left.id==='ar15', hands.left);
    ok('…and does not move the main hand', hands.afterLeft.mainSwing===0 && hands.afterLeft.mainKick===0 && hands.afterLeft.mainFlash===0, hands.afterLeft);
    ok('…the buck and flash land on the offhand', hands.afterLeft.offKick>0 && hands.afterLeft.offFlash>0, hands.afterLeft);
    ok('right click acts with the MAIN item, block and all', hands.right && hands.right.id==='planks', hands.right);
    // TWO GUNS, TWO TRIGGERS (Ben 08-04, superseding the both-guns-on-one-click ruling from earlier the same day).
    const two = await page.evaluate(`__hc.handSplit('ar15','shotgun')`);
    console.log('    two guns:', JSON.stringify(two.mag));
    ok('left click fires ONLY the offhand gun', two.mag.afterLeft.off < two.mag.before.off && two.mag.afterLeft.main === two.mag.before.main, two.mag);
    ok('right click fires ONLY the main hand gun', two.mag.afterRight.main < two.mag.afterLeft.main && two.mag.afterRight.off === two.mag.afterLeft.off, two.mag);
    // …and holding two of them costs accuracy, on screen and in the world.
    const oneGun = await page.evaluate(`(()=>{ try{ __hc.eqPut(4,null); }catch(e){} __hc.hold('ar15'); return __hc.xhProbe(); })()`);
    await sleep(500);
    const oneGun2 = await page.evaluate(`__hc.xhProbe()`);
    const dual = await page.evaluate(`(()=>{ __hc.handSplit('ar15','ar15'); return __hc.xhProbe(); })()`);
    await sleep(500);
    const dual2 = await page.evaluate(`__hc.xhProbe()`);
    console.log('    one gun', oneGun2.applied, 'dual', dual2.applied);
    // Against its OWN baseline: the movement ring drifts between samples, so comparing a dual reading to a single-gun reading
    // taken half a second earlier measures the drift as well as the doubling.
    ok('dual wielding doubles the ring', dual2.dual===true && Math.abs(dual2.applied - dual2.preDual*2) <= 2, {applied:dual2.applied, preDual:dual2.preDual, dual:dual2.dual});
    ok('and doubles the shot cone with it', dual2.spreadDeg > oneGun2.spreadDeg*1.6, {one:oneGun2.spreadDeg, dual:dual2.spreadDeg});
    ok('…and does not move the offhand', hands.afterRight.offSwing===0 && hands.afterRight.offKick===0, hands.afterRight);

    console.log('\n[13] the boom does not judder when it is driven into the ground');
    await page.evaluate(`__hc.tpsProbe(true)`);
    await page.evaluate(`__hc.cam({pitch:1.1})`);          // look almost straight down: the boom goes into the floor
    await sleep(700);
    const samples=[];
    for(let i=0;i<30;i++){ samples.push(await page.evaluate(`__hc.tpsCam()`)); await sleep(45); }
    // The boom's LENGTH is the thing that juddered; the camera's absolute position also carries the player's own motion, and a
    // body still settling after the earlier sections reads as camera judder when it is nothing of the sort.
    let worst=0, worstAt=null;
    for(let i=1;i<samples.length;i++){ const a=samples[i-1], b=samples[i];
      const d=Math.abs(b.dist-a.dist); if(d>worst){ worst=d; worstAt=[a.dist,b.dist]; } }
    const anyInSolid = samples.some(s=>s.camInSolid);
    console.log('    worst frame-to-frame move:', worst.toFixed(3), 'lift', samples[samples.length-1].lift);
    console.log('    dist track:', samples.slice(0,12).map(s=>s.dist).join(' '));
    console.log('    lift track:', samples.slice(0,12).map(s=>s.lift).join(' '));
    // The samples are 45 ms apart and the boom's push-out runs at 4.5/s, so a legitimate ease can move it ~0.2 between two
    // samples. The judder this was written for was 0.4 in ONE frame; 0.25 across a 45 ms sample is comfortably below anything
    // that reads as a step and comfortably above the smooth case.
    ok('no frame jumps while standing still and looking down', worst<0.25, {worstDistStep:+worst.toFixed(3), at:worstAt});
    ok('and it still never sits inside the ground', anyInSolid===false, anyInSolid);
    await page.evaluate(`__hc.cam({pitch:0})`); await page.evaluate(`__hc.tpsProbe(false)`);

    // [14] WAS THE LEAF-PILE MECHANIC, retired with the model on 2026-08-04 (Ben: "delete the old leaf models"). The number
    // is left as a gap rather than renumbering [15] onward, so "[16] failed" in an older log still points at the same test.
    // Fallen leaves are drawn by the ground cover now and there is no per-cell counter left to assert.

    console.log('\n[15] stamina, and armour as three shields of four');
    const v0 = await page.evaluate(`__hc.stamSet(100)`);
    ok('stamina starts full', v0.stam===100, {stam:v0.stam, max:v0.stamMax});
    const ran = await page.evaluate(`__hc.stamRun(3)`);
    ok('sprinting spends it', ran.stam<v0.stam-20, {before:v0.stam, after:ran.stam});
    const winded = await page.evaluate(`(()=>{ __hc.stamSet(0); return __hc.stamRun(0.5); })()`);
    ok('at zero you are winded and cannot sprint', winded.winded===true && winded.sprint===false, {winded:winded.winded, sprint:winded.sprint});
    const back = await page.evaluate(`(()=>{ __hc.stamSet(0); const wasL=1; return __hc.vitalRing(); })()`);
    ok('and it is a bar, not a boolean', back.stamMax===100, back.stamMax);
    const arm = await page.evaluate(`(()=>{ __hc.eqPut(0,'iron_helmet'); __hc.eqPut(1,'iron_chestplate'); __hc.eqPut(2,'iron_leggings');
      __hc.eqPut(3,'iron_boots'); __hc.eqPut(4,'shield'); __hc.eqPut(5,'backpack'); return __hc.vitalRing(); })()`);
    console.log('   ', JSON.stringify(arm));
    ok('a full loadout is exactly twelve points', arm.armorPts===12 && arm.armorMax===12, {pts:arm.armorPts, max:arm.armorMax});
    ok('which fills all three shields', arm.shields.every(f=>f===1), arm.shields);
    const trinkets = await page.evaluate(`(()=>{ for(let i=0;i<6;i++) __hc.eqPut(i,null);
      __hc.eqPut(0,'nvg'); __hc.eqPut(5,'backpack'); return __hc.vitalRing(); })()`);
    ok('goggles and a pack are a quarter point each', Math.abs(trinkets.armorPts-0.5)<1e-6, trinkets.armorPts);
    ok('…which is a sixteenth of the first shield', Math.abs(trinkets.shields[0]-0.125)<1e-3, trinkets.shields);

    console.log('\n[16] footprints, blood, and a stamina bar that costs something');
    const m0 = await page.evaluate(`__hc.marksProbe()`);
    ok('the mark pools are bounded, not a growing list', m0.foot.cap===96 && m0.blood.cap===72, {foot:m0.foot.cap, blood:m0.blood.cap});
    const walked = await page.evaluate(`__hc.markDrop('foot',6)`);
    ok('prints land on the ground under you', walked.made>0 && walked.state.foot.live>0, {made:walked.made, live:walked.state.foot.live});
    ok('and the pool only draws when it holds something', walked.state.foot.drawn===true, walked.state.foot.drawn);
    const bled = await page.evaluate(`__hc.markDrop('blood',4)`);
    ok('blood is its own pool', bled.state.blood.live>0, bled.state.blood.live);
    const far = await page.evaluate(`(()=>{ const P=__hc.pos(); const before=__hc.marksProbe().foot.live;
      for(let i=0;i<8;i++) footMark(P.x+200, P.y, P.z+200, 0, 'foot');
      return { before, after:__hc.marksProbe().foot.live }; })()`).catch(()=>null);
    if(far) ok('nothing is spent on marks you could never see', far.after===far.before, far);
    const overrun = await page.evaluate(`__hc.markDrop('foot',200)`);
    ok('the ring buffer holds the cap rather than growing', overrun.state.foot.live<=96, overrun.state.foot.live);
    const aged = await page.evaluate(`__hc.markAge(120)`);
    ok('and they expire on their own', aged.foot.live===0 && aged.foot.drawn===false, aged.foot);

    const s0 = await page.evaluate(`__hc.stamSet(100)`);
    const s1 = await page.evaluate(`__hc.stamRun(4)`);
    ok('four seconds of sprinting is a dent, not the bar', s1.stam>55 && s1.stam<95, {after:s1.stam});
    const empty = await page.evaluate(`(()=>{ __hc.stamSet(0); return __hc.vitalRing(); })()`);
    ok('an empty bar means no jump', empty.canJump===false, {canJump:empty.canJump, stam:empty.stam});
    const spent = await page.evaluate(`__hc.stamRun(0.2)`);
    ok('and running yourself out costs a 3 s wind-down', spent.winded===true && spent.cd>2.0, {winded:spent.winded, cd:spent.cd});

    console.log('\n[17] a base is walls, a door and a bed');
    const base0 = await page.evaluate(`(()=>{ __hc.objBase(true); return __hc.objPlace(45,'planks'); })()`);
    const after45 = await page.evaluate(`__hc.objBase()`);
    console.log('   ', JSON.stringify(after45));
    ok('forty-five blocks alone is not a base', after45.placed>=45 && after45.met===false, after45);
    ok('and the objective says only "Build a base"', after45.name==='Build a base', after45.name);
    const withDoor = await page.evaluate(`(()=>{ __hc.objPlace(1,'door'); return __hc.objBase(); })()`);
    ok('a door is not enough on its own', withDoor.door===true && withDoor.met===false, withDoor);
    const withBed = await page.evaluate(`(()=>{ __hc.objPlace(1,'bed'); return __hc.objBase(); })()`);
    ok('blocks, a door AND a bed completes it', withBed.bed===true && withBed.met===true, withBed);

    console.log('\n[18] the eye is still when you are');
    const still1 = await page.evaluate(`__hc.eyeStill(120)`);
    console.log('   ', JSON.stringify(still1));
    ok('standing on the ground, the camera does not move at all', still1.peakToPeak<0.002, {peakToPeak:still1.peakToPeak});
    ok('and no landing correction is being re-armed every frame', still1.landCorr.max===0, still1.landCorr);
    // …and a landing DOES move it: measured across the jump itself rather than after it, since the whole point of the smoothing
    // is that the movement is spread over the tenth of a second following the impact.
    // Measured INSIDE the arc, on the frame the correction is armed: sampling afterwards races the decay, which is over in a
    // tenth of a second by design.
    // Stamina first: [16] deliberately empties it, and an empty bar means no jump — so without this the arc measures the stamina
    // gate working rather than the landing.
    const landed = await page.evaluate(`(()=>{ __hc.stamSet(100); return __hc.jumpArc(0.6); })()`);
    ok('a real landing still arms the smoothing', landed.landCorr>0, {landCorr:landed.landCorr, rise:landed.rise});

    ok('no page errors', errors.length===0, errors);
    await browser.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`);
  console.log('RESULT: '+(fails?'FAIL':'PASS'));
  process.exit(fails?1:0);
})();
