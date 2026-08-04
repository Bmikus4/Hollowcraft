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
    await page.keyboard.down('Space'); await sleep(160);
    const air = await page.evaluate(`__hc.xhProbe()`);
    const airJ = await page.evaluate(`__hc.jumpProbe()`);
    await page.keyboard.up('Space'); await sleep(700);
    ok('the ring opens in the air', air.px>stillSpread.px+2, {ground:stillSpread.px, air:air.px});
    ok('and the SHOT cone opens with it', air.spreadDeg>stillSpread.spreadDeg, {ground:stillSpread.spreadDeg, air:air.spreadDeg});
    ok('the jump actually left the ground', airJ.onGround===false||airJ.vy>0, airJ);

    console.log('\n[3] a jump you can cut short, and coyote time');
    const held = await page.evaluate(`(()=>{ return new Promise(r=>{
      __hc.tpExact(__hc.pos().x, __hc.pos().z, __hc.groundY(Math.floor(__hc.pos().x),Math.floor(__hc.pos().z))+1);
      setTimeout(()=>r(__hc.jumpProbe()),120); }); })()`);
    // full jump: hold Space through the rise
    await page.keyboard.down('Space'); await sleep(900);
    const apexHeld = await page.evaluate(`__hc.jumpProbe()`);
    await page.keyboard.up('Space'); await sleep(1400);
    // tapped jump: release immediately
    const y0 = await page.evaluate(`__hc.jumpProbe()`);
    await page.keyboard.down('Space'); await sleep(60); await page.keyboard.up('Space'); await sleep(260);
    const apexTap = await page.evaluate(`__hc.jumpProbe()`);
    await sleep(1200);
    ok('holding the key jumps higher than tapping it', (apexHeld.y-y0.y) > (apexTap.y-y0.y), {held:+(apexHeld.y-y0.y).toFixed(2), tap:+(apexTap.y-y0.y).toFixed(2)});
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
    ok('and it bleeds off rather than stopping dead', t4.spd < 0.1, {onRelease:t3.spd, after:t4.spd});

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

    ok('no page errors', errors.length===0, errors);
    await browser.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`);
  console.log('RESULT: '+(fails?'FAIL':'PASS'));
  process.exit(fails?1:0);
})();
