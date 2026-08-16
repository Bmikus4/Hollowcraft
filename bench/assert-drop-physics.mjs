// DROPPED ITEMS ARE RIGID BODIES — that they land ON surfaces, settle to a lie, stay out of walls, and can be
// picked by the crosshair against their own collider.
//
// Ben, 08-16: "I want items to drop as actual physics objects in the world. I dont want them to just drop as little
// floating items. they should have collisions and when the player moves thier cursor over them, they should be
// highlighted."
//
// EVERY CHECK HERE IS A NUMBER, NOT A FRAME. The whole specification is "on the surface, not in it" and "lying at a
// real angle", and a 16 px item in a bench screenshot can answer neither — the repo's own rule, and the reason the
// holosight and third-person-pose bugs were found by probes after three visual passes had missed them.
//   gap    the body's lowest point against the block top under it. 0 is resting; negative is sunk in.
//   pitch/roll  the settled lie. A dropped object comes to rest on a face; anything not a multiple of 90 is a body
//               that stopped mid-tumble, which reads as a stuck animation.
//   picked the crosshair test, run against the collider at that settled orientation.
//
//   node bench/assert-drop-physics.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// A SPREAD OF SHAPES, not three of the same thing. The failure the old code had was shape-dependent — a fixed 0.13
// offset is right for a cube and wrong for everything else — so the set is a long thin rifle, a flat card, a small
// cube-ish item and a tall one.
const ITEMS=['ak','red_dot','coal','lantern','buckshot'];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:960,height:540}})).newPage();
    page.on('pageerror',e=>{ console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); fails++; checks++; });
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const gy=await page.evaluate(`__hc.groundY(${SX},${SZ})`);
    // Stand back and above so nothing is picked up by the magnet mid-test — the pickup radius is 1.6 blocks and a
    // body that gets vacuumed up while settling is a check measuring an empty list.
    await page.evaluate(`__hc.tpAt(${SX+0.5},${gy+9},${SZ+9.5}); __hc.cam({yaw:${Math.PI}, pitch:-0.6})`);
    await sleep(800);

    // ---- 1. THEY LAND ON THE SURFACE AND STOP ----
    await page.evaluate(`__hc.dropClear()`);
    for(let i=0;i<ITEMS.length;i++) await page.evaluate(`__hc.dropSpawn('${ITEMS[i]}', ${SX+0.5+i*1.5}, ${gy+4.5}, ${SZ+0.5})`);
    await sleep(4500);
    const P=await page.evaluate(`__hc.dropPhys()`);
    check('the bodies exist and report their colliders', P && !P.err && P.drops.length===ITEMS.length, P&&P.err?P.err:`${P&&P.drops.length} bodies`);
    for(const d of (P.drops||[])){
      console.log(`  ${String(d.id).padEnd(9)} y ${String(d.y).padStart(7)}  gap ${String(d.gap).padStart(7)}  pitch ${String(d.pitch).padStart(7)} roll ${String(d.roll).padStart(7)}  half ${d.half.x}/${d.half.y}/${d.half.z}  rest ${d.rest}`);
      check(`${d.id}: came to rest`, d.rest===true && d.speed<0.01, `rest ${d.rest} speed ${d.speed}`);
      // ON the block, not in it. The tolerance is 1 cm, which is smaller than the thinnest collider this allows.
      check(`${d.id}: rests ON the surface, not sunk into it`, d.gap>=-0.01 && d.gap<0.06, `gap ${d.gap}`);
      check(`${d.id}: there is something under it`, d.below===1, `below ${d.below}`);
      // FACE-FLAT. Yaw is free by design — which way a dropped object ends up facing is not something to quantise.
      const near90=v=>{ const m=Math.abs(((v%90)+90)%90); return Math.min(m,90-m)<0.6; };
      check(`${d.id}: settled to a lie rather than stopping mid-tumble`, near90(d.pitch)&&near90(d.roll), `pitch ${d.pitch} roll ${d.roll}`);
    }

    // ---- 2. A FAST BODY DOES NOT TUNNEL ----
    // The classic failure of stepping a body by velocity*dt: dropped from high enough, one frame carries it further
    // than the floor is thick and it is through. Dropped from 40 blocks so terminal speed at impact is well past a
    // block per frame, and the test is that no body's CENTRE ends up inside a solid cell.
    await page.evaluate(`__hc.dropClear()`);
    for(let i=0;i<4;i++) await page.evaluate(`__hc.dropSpawn('coal', ${SX+0.5}+${i}, ${gy}+40, ${SZ+0.5})`);
    await sleep(6000);
    // `inside` comes from the probe, which asks solidAt — the physics' own definition. Asking blockAt()!==0 here
    // reported an item lying in tall grass as having tunnelled through the floor, because a flower is a block.
    const F=await page.evaluate(`(()=>{ const p=__hc.dropPhys();
      return p.drops.map(d=>({ id:d.id, rest:d.rest, y:d.y, gap:d.gap, inside:d.inside })); })()`);
    console.log('  fell 40 blocks: '+JSON.stringify(F));
    check('a body dropped from 40 blocks does not tunnel through the floor', F.every(d=>d.inside===0), JSON.stringify(F.filter(d=>d.inside)));
    check('and it still comes to rest', F.every(d=>d.rest===true), JSON.stringify(F.filter(d=>!d.rest)));

    // ---- 3. THE CROSSHAIR PICK IS AGAINST THE COLLIDER ----
    await page.evaluate(`__hc.dropClear()`);
    await page.evaluate(`__hc.tpAt(${SX+0.5},${gy+2.6},${SZ+3.5}); __hc.cam({yaw:${Math.PI}, pitch:-0.75})`);
    await sleep(400);
    await page.evaluate(`__hc.dropSpawn('ak', ${SX+0.5}, ${gy+1.6}, ${SZ+0.5})`);
    await sleep(3500);
    // STAND RELATIVE TO WHERE IT ACTUALLY LANDED. A body is thrown with a random impulse and lands anywhere inside
    // a couple of blocks, and the player falls while it settles, so a camera placed before the throw sat 3.4 blocks
    // away on one run and 4.81 on the next — outside the game's 4.5 reach, which is a real design number and not
    // something to widen so a test goes green.
    const at=await page.evaluate(`(()=>{ const p=__hc.dropPhys(); return p.drops[0]||null; })()`);
    if(at){ await page.evaluate(`__hc.tpAt(${at.x}, ${at.y+1.2}, ${at.z+1.6})`); await sleep(600); }
    // AIM AT THE BODY, geometrically, rather than nudging the camera until something lights up. The ray starts at
    // the EYE and the probe reports it — deriving it as player.pos plus an eye height is wrong whenever the player
    // is crouched, prone or mid-fall, and a pick check that misses by a degree reads as a broken feature.
    const look=await page.evaluate(`(()=>{ const p=__hc.dropPhys(); if(!p.drops.length) return {err:'no drop'};
      const d=p.drops[0];
      return { d, reach:p.reach, dist:Math.hypot(d.x-p.eye.x,d.y-p.eye.y,d.z-p.eye.z),
               aim:{ dx:d.x-p.eye.x, dy:d.y-p.eye.y, dz:d.z-p.eye.z } }; })()`);
    if(!look.err){
      console.log(`  aiming at the body from ${look.dist.toFixed(2)} blocks (reach ${look.reach})`);
      check('the body is inside the pick reach to begin with', look.dist<look.reach, `${look.dist.toFixed(2)} against ${look.reach}`);
      const yaw=Math.atan2(-look.aim.dx, -look.aim.dz);
      const pitch=Math.atan2(look.aim.dy, Math.hypot(look.aim.dx,look.aim.dz));
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(250);
      const on=await page.evaluate(`__hc.dropPhys()`);
      check('the crosshair on the item picks it', !!on.picked && on.picked.id==='ak', JSON.stringify(on.picked));
      check('the outline is shown for the picked body', on.outline===true, `outline ${on.outline}`);
      // AND IT MUST NOT PICK WHAT IS NOT THERE. A screen-space test passes the check above and fails this one,
      // which is the entire reason this check exists.
      await page.evaluate(`__hc.cam({yaw:${yaw+1.4}, pitch:${pitch}})`); await sleep(250);
      const off=await page.evaluate(`__hc.dropPhys()`);
      check('looking away picks nothing', off.picked===null, JSON.stringify(off.picked));
      check('and the outline goes with it', off.outline===false, `outline ${off.outline}`);
    } else check('a body was there to aim at', false, look.err);

    // ---- 4. NOTHING FLOATS AND NOTHING SPINS ----
    // The two properties Ben named by their absence. A settled body must hold the SAME transform frame to frame.
    const t1=await page.evaluate(`__hc.dropPhys()`); await sleep(900);
    const t2=await page.evaluate(`__hc.dropPhys()`);
    if(t1.drops.length && t2.drops.length){
      const a=t1.drops[0], b=t2.drops[0];
      check('a settled item does not bob', Math.abs(a.y-b.y)<1e-4, `y ${a.y} -> ${b.y}`);
      check('a settled item does not spin', Math.abs(a.yaw-b.yaw)<1e-4, `yaw ${a.yaw} -> ${b.yaw}`);
    }
  }catch(e){ console.log('  HARNESS ERROR: '+(e&&e.message||e)); fails++; checks++; }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks pass`);
  process.exit(fails?1:0);
})();
