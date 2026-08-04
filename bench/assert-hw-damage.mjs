// A HORRIFIC WRETCH CANNOT BE SHOT, AND THE BULLET DAMAGES THE PRIMARY INSTEAD.
//
// `wretch` is a mutable global pointer. _traceBullet's capsule test reads it raw, so the creature a bullet
// damages is whichever one the CALLER happened to bind — and three of the six fireGun call sites bound
// nothing at all: full-auto repeat-fire (lmbHeld), the dual-wield right-click, and the act path. Those fired
// against wretchPrime whatever the ray actually passed through. The fourth, doSwing, bound
// withNearestWretch, which resolves nearest-to-the-CAMERA: right for a 3.6-block swing, wrong for a ray,
// because it damages a creature at your elbow when you are aiming at one behind it.
//
// The fix binds per step INSIDE the ray walk (_wretchRayHit), so the creature hit is the first one the line
// passes through, and every call site is correct without knowing anything about binding.
//
// This must FAIL on the old code. Its load-bearing checks are the pair:
//   - the parked Horrific's OWN hp falls, and
//   - wretchPrime's hp does not move
// A check on "hp fell somewhere" would pass on the bug, because the bug is that hp falls on the wrong entity
// (bench/README lesson: a check that passes on the wrong subject is worse than no check).
//
//   node bench/assert-hw-damage.mjs
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
    await page.evaluate(`(()=>{ __hc.lock(true); __hc.setTime(0.5); __hc.tp(${pr.spawnX}, ${pr.spawnZ}); })()`);
    await sleep(3000);

    // A REVOLVER, not the AR: one bullet per trigger pull, 45 to the body, no bolt cycle and no nine-pellet
    // cone to reason about. hwHold freezes the extras' AI — parked within hunting range it captures the
    // player in about three seconds, and a dragging creature is exempt from the capsule test on purpose.
    const setup = async () => {
      await page.evaluate(`(()=>{ __hc.hwKill(); __hc.hwHold(true);
        for(let i=0;i<9;i++)__hc.qSet('inv',i,null); __hc.offhandSet(null); __hc.qSet('inv',0,'revolver',1); })()`);
      await sleep(400);
      const parked = await page.evaluate(`__hc.hwAt(7)`);
      await sleep(600);
      return parked;
    };
    const parked = await setup();
    const pre = await page.evaluate(`(()=>({ hw:(__hc.hwState()||[])[0]||null, prime:__hc.hwPrime(), mag:(__hc.sight()||{}).mag }))()`);
    check('a Horrific Wretch is parked 7 blocks down the aim',
      !!pre.hw && pre.hw.active===true && !pre.hw.dragging, JSON.stringify(parked));
    check('it is not the creature the global points at',
      pre.hw && pre.hw.bound===false && pre.prime.bound===true, `extra bound ${pre.hw&&pre.hw.bound}, prime bound ${pre.prime.bound}`);
    check('the revolver is in hand and loaded', pre.mag>0, `mag ${pre.mag}`);

    // ---- 1. THE DIRECT PATH: fireGun with nothing bound (what full-auto and the act path do) ----
    await page.evaluate(`(()=>{ __hc.shoot(); __hc.shoot(); __hc.shoot(); })()`);
    await sleep(600);
    const shot = await page.evaluate(`(()=>({ hw:(__hc.hwState()||[])[0]||null, prime:__hc.hwPrime() }))()`);
    const hwFell = shot.hw && shot.hw.hp!=null && shot.hw.hpMax!=null && shot.hw.hp < shot.hw.hpMax;
    check('shooting it takes health off THAT creature',
      hwFell, `hp ${shot.hw&&shot.hw.hp} / ${shot.hw&&shot.hw.hpMax}`);
    check('and wretchPrime is untouched by the same bullets',
      shot.prime.primeHp===pre.prime.primeHp, `primeHp ${pre.prime.primeHp} -> ${shot.prime.primeHp}`);

    // ---- 2. THE RAY DECIDES, NOT THE DISTANCE ----
    // withNearestWretch would still damage a creature 7 blocks away while the aim points at empty sky. This is
    // the check that tells a ray test apart from a proximity test, and it is why the fix is not just "bind".
    const hpBeforeMiss = shot.hw.hp;
    await page.evaluate(`(()=>{ const y=__hc.cam({}).yaw; __hc.cam({yaw:y+Math.PI/2}); __hc.shoot(); __hc.shoot(); })()`);
    await sleep(500);
    const missed = await page.evaluate(`(()=>({ hw:(__hc.hwState()||[])[0]||null, prime:__hc.hwPrime() }))()`);
    check('aiming 90 degrees away hits nothing at all',
      missed.hw.hp===hpBeforeMiss && missed.prime.primeHp===pre.prime.primeHp,
      `hp ${hpBeforeMiss} -> ${missed.hw.hp}, primeHp ${missed.prime.primeHp}`);

    // ---- 3. THE doSwing PATH still works (it bound withNearestWretch before, so this must not regress) ----
    await page.evaluate(`__hc.hwAt(7)`); await sleep(500);
    const beforeSwing = await page.evaluate(`(()=>((__hc.hwState()||[])[0]||{}).hp)()`);
    await page.evaluate(`(()=>{ __hc.qSet('inv',0,'revolver',1); __hc.swing(); })()`);
    await sleep(500);
    const afterSwing = await page.evaluate(`(()=>({ hp:((__hc.hwState()||[])[0]||{}).hp, prime:__hc.hwPrime() }))()`);
    check('firing through doSwing damages it too',
      afterSwing.hp < beforeSwing, `hp ${beforeSwing} -> ${afterSwing.hp}`);
    check('doSwing leaves wretchPrime untouched as well',
      afterSwing.prime.primeHp===pre.prime.primeHp, `primeHp ${afterSwing.prime.primeHp}`);

    // ---- 4. THE DUAL-WIELD RIGHT-CLICK, which bound nothing and was never covered ----
    await page.evaluate(`__hc.hwAt(7)`); await sleep(500);
    // THE MODE ONLY TURNS ON WITH AN EMPTY MAIN HAND. offActing() is `offUse && armor[EQ_OFF]`, offhandSet forces
    // offUse false, and F flips it only on the branch where inv[selSlot] is empty ("a full main hand acts with
    // itself"). So the real dual-wield sequence is: gun to the offhand, empty hand, F, THEN draw the main gun.
    // Setting the slot and clicking is not the same test and quietly measures nothing.
    const beforeRmb = await page.evaluate(`(()=>{ __hc.offhandSet('revolver'); __hc.qSet('inv',0,null);
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',bubbles:true}));
      __hc.qSet('inv',0,'revolver',1); return ((__hc.hwState()||[])[0]||{}).hp; })()`);
    await sleep(400);
    await page.evaluate(`(()=>{ document.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));
      document.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true})); })()`);
    await sleep(600);
    const afterRmb = await page.evaluate(`(()=>({ hp:((__hc.hwState()||[])[0]||{}).hp, prime:__hc.hwPrime() }))()`);
    check('the dual-wield right-click fires into it, not into the primary',
      afterRmb.hp < beforeRmb && afterRmb.prime.primeHp===pre.prime.primeHp,
      `hp ${beforeRmb} -> ${afterRmb.hp}, primeHp ${afterRmb.prime.primeHp}`);

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('THE BUG IS PRESENT: a bullet resolves against whichever creature the caller bound, not the one its own ray passed through.');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
