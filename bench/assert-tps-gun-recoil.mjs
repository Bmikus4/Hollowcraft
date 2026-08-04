// A GUN IN THIRD PERSON RIDES ITS RECOIL AND NEVER SWINGS.
//
// Ben 08-04: "when a gun is fired in 3rd person it moves out to the right, for both hands it should do nothing if empty
// and follow recoil if it fires, not move out to the right."
//
// _doSwing sets view.swing=1.4 beside the kick on a successful shot, and updateTpsBody turned a swing into
// armR.rotation.z — a splay away from the body. The gun branch re-derived rotation.X from the kick but left Z, so the only
// thing visible on every shot was the arm going sideways.
//
// Four claims, all read as numbers through __hc.tpsAim(), which now reports rotation.z on both arms:
//   1. Firing the right hand moves the arm on X (the kick) and NOT on Z.
//   2. An empty gun does nothing at all: a dry click cannot raise the kick, so the pose is the rest pose.
//   3. The same holds for a gun in the left hand.
//   4. A TOOL still swings, on both axes — the fix must not have flattened the melee animation.
//
//   node bench/assert-tps-gun-recoil.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:900,height:520},deviceScaleFactor:1});
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.tpsProbe(true);`);
    await sleep(600);
    const tps=await page.evaluate(`__hc.tpsCam()`);
    check('third person is actually on', tps.active===true, JSON.stringify({on:tps.on,active:tps.active,indoors:tps.indoors}));

    // ---- 1. THE RIGHT HAND, FIRING -----------------------------------------------------------------------------------
    // Level pitch throughout: the gun pose tracks look pitch by design, and letting pitch drift would put that in the
    // numbers as if it were recoil.
    await page.evaluate(`__hc.gun('ar15')`); await sleep(400);
    const rest=await page.evaluate(`__hc.tpsAim(0)`);
    // BOTH HALVES OF WHAT A CLICK DOES. __hc.fire() calls fireGun directly and never touches view.swing, so a harness built on
    // it alone reports armZ 0 because there was no swing to splay — the check passes and proves nothing. _doSwing writes
    // view.swing=1.4 next to the kick on a successful shot, so write that too and assert the pose against BOTH inputs live.
    const shot=await page.evaluate(`(()=>{ const f=__hc.fire(1); __hc.swingAt(1.4); const a=__hc.tpsAim(0); a.fired=f.fired; return a; })()`);
    console.log(`  rest:  armX ${rest.arm}  armZ ${rest.armZ}  swing ${rest.swing}  kick ${rest.kick}`);
    console.log(`  shot:  armX ${shot.arm}  armZ ${shot.armZ}  swing ${shot.swing}  kick ${shot.kick}  (fired ${shot.fired})`);
    check('the shot registered and raised the kick', shot.fired===1 && shot.kick>0.05, `fired ${shot.fired}, kick ${shot.kick}`);
    check('and the swing _doSwing writes is live in this frame', shot.swing>0.5, `view.swing ${shot.swing} — without this the next check is vacuous`);
    // THE BUG ITSELF. view.swing IS set on a shot — that is the first-person animation and is left alone — but the third
    // person arm must not read it.
    check('firing does not throw the arm sideways', Math.abs(shot.armZ)<0.0005,
      `armR.rotation.z ${shot.armZ} with swing at ${shot.swing} — this was -swing*0.28 and it is what "moves out to the right" was`);
    check('and the arm does move on the recoil axis', Math.abs(shot.arm-rest.arm)>0.01, `armR.rotation.x ${rest.arm} -> ${shot.arm}`);

    // ---- 2. AN EMPTY HAND DOES NOTHING -------------------------------------------------------------------------------
    // "For both hands it should do nothing if empty." A bare arm used to be thrown through the same arc as a pickaxe, only
    // wider (1.5 rad against 1.35). Held nothing, a swing of any size must leave the arm where it rests.
    // Firing 60 rounds also proves the magazine reloads out of reserve rather than going dry, so "empty" cannot be tested
    // by shooting a gun until it stops — the hand itself has to be empty.
    const emptyRest=await page.evaluate(`(()=>{ __hc.clearHand(); __hc.swingAt(0); return __hc.tpsAim(0); })()`);
    const emptySwing=await page.evaluate(`(()=>{ __hc.swingAt(1.0); return __hc.tpsAim(0); })()`);
    console.log(`  empty hand rest: armX ${emptyRest.arm} armZ ${emptyRest.armZ} held ${emptyRest.held}`);
    console.log(`  empty hand swing: armX ${emptySwing.arm} armZ ${emptySwing.armZ} swing ${emptySwing.swing} held ${emptySwing.held}`);
    check('the hand really is empty', !emptySwing.held, `held ${JSON.stringify(emptySwing.held)}`);
    check('an empty hand does not swing', Math.abs(emptySwing.arm-emptyRest.arm)<0.002 && Math.abs(emptySwing.armZ)<0.0005,
      `armX ${emptyRest.arm} -> ${emptySwing.arm}, armZ ${emptySwing.armZ}, with view.swing at ${emptySwing.swing}`);

    // ---- 3. THE LEFT HAND ------------------------------------------------------------------------------------------
    // The offhand click path only writes offView.swing for a tool or a spear, so firing a left-hand gun leaves it at 0 and a
    // splay check against that state is vacuous. swingAt's third argument writes it directly, which is the state to assert.
    const offRest=await page.evaluate(`(()=>{ __hc.offFire(0,'ar15'); __hc.swingAt(0,null,0); return __hc.tpsAim(0); })()`);
    const offShot=await page.evaluate(`(()=>{ const r=__hc.offFire(3,'ar15'); __hc.swingAt(0,null,1.4); const a=__hc.tpsAim(0); a.kickOff=r.kick; return a; })()`);
    console.log(`  offhand rest: armLX ${offRest.armLX} armLZ ${offRest.armLZ}   fired: armLX ${offShot.armLX} armLZ ${offShot.armLZ} offSwing ${offShot.offSwing} offKick ${offShot.offKick}`);
    check('the left arm swing is live in this frame', offShot.offSwing>0.5, `offView.swing ${offShot.offSwing} — without this the next check is vacuous`);
    check('the left hand does not throw its arm sideways either', Math.abs(offShot.armLZ)<0.0005,
      `armL.rotation.z ${offShot.armLZ} with offSwing at ${offShot.offSwing}`);

    // ---- 4. A TOOL STILL SWINGS ------------------------------------------------------------------------------------
    // The regression guard. The swing arc is what a pickaxe strike IS, and the fix must only have excluded guns from it.
    // __hc.swingAt(v,tool) gives + selects the tool and writes view.swing directly — the same number a click writes, without
    // needing a target to hit or a mining timer to run.
    const held=await page.evaluate(`__hc.swingAt(1.0,'iron_pickaxe')`);
    const swung=await page.evaluate(`(()=>{ __hc.swingAt(1.0); return __hc.tpsAim(0); })()`);
    console.log(`  holding ${JSON.stringify(held)}`);
    console.log(`  tool swing: armX ${swung.arm} armZ ${swung.armZ} swing ${swung.swing}  held ${swung.held}`);
    check('a tool still swings on both axes', swung.swing>0.2 ? Math.abs(swung.armZ)>0.02 : true,
      `swing ${swung.swing}, armZ ${swung.armZ} — with a non-gun held, z must NOT be zero or the melee animation is gone`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
