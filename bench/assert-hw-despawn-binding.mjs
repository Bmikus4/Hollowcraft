// KILLING A HORRIFIC WRETCH THAT HAS HOLD OF YOU BREAKS THE FRAME LOOP FOR THE REST OF THE SESSION.
//
// The loop binds the global `wretch` to whichever creature has the player (hwBindGrabber) and drops the
// binding on the following frame — but the drop happens AFTER updateBrain, and despawnHorrific never
// touches the binding at all. So: grab, die, and the next frame's updateBrain reads a disposed instance,
// throws on a field the extras never had, and is caught by loop()'s own try/catch. Everything after that
// point in loop() then stops running for good: adaptive quality (the thing that protects framerate), the
// mind HUD, and the profiler's commit — which is how it was found, as "every benchmark window after a
// Horrific Wretch dies contains zero frames".
//
// This asserts the three observables, and it must FAIL on the code that has the bug:
//   1. no exception recorded in window._loopErr
//   2. the profiler ring still commits frames
//   3. the global is bound back to the primary Wretch (__hc.hwPrime().bound)
//
//   node bench/assert-hw-despawn-binding.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const argv = process.argv.slice(2);
const arg=(k,d)=>{ const i=argv.indexOf('--'+k); return i>=0?argv[i+1]:d; };
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
    // ?debug=1 is deliberate and load-bearing: the throw is in the mind overlay's own text, so the bug only
    // fires with the overlay up — which is the configuration every harness in bench/ boots with.
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm()`);
    const pr = await page.evaluate(`__hc.probe()`);
    await page.evaluate(`(()=>{ __hc.tp(${pr.spawnX}, ${pr.spawnZ}); __hc.setTime(0.85); __hc.cam({yaw:0.7,pitch:-0.05}); __hc.lock(true); window._loopErr=null; })()`);
    await sleep(5000);

    // baseline: the loop is healthy before any of this
    await page.evaluate(`__hcPERF.reset()`); await sleep(2000);
    const base0 = await page.evaluate(`(()=>({ frames:(__hc.frameProf(600)||{}).frames||0, err:window._loopErr||null, bound:__hc.hwPrime().bound }))()`);
    check('the loop is healthy before the test', base0.frames>0 && !base0.err && base0.bound, `frames ${base0.frames}, bound ${base0.bound}`);

    // spawn one and let it actually take hold — the binding only exists while something has the player
    await page.evaluate(`__hc.hw(11)`);
    let grabbed=false;
    for(let i=0;i<60;i++){ const s=await page.evaluate(`(()=>{ const r=(__hc.hwState()||[])[0]||{}; return { dragging:!!r.dragging, gp:__hc.st().gp, grabbed:!!__hc.st().grabbed, bound:__hc.hwPrime().bound }; })()`);
      if(s.dragging || s.grabbed || !s.bound){ grabbed=true; break; } await sleep(500); }
    const preKill = await page.evaluate(`(()=>({ bound:__hc.hwPrime().bound, extras:(__hc.hwState()||[]).length, grabbed:!!__hc.st().grabbed }))()`);
    console.log(`  (creature has hold: ${grabbed}; global bound to primary: ${preKill.bound}; extras ${preKill.extras})`);
    check('a Horrific Wretch is in the world to kill', preKill.extras>0, JSON.stringify(preKill));

    // REPEATED CYCLES, because one is not the case that breaks. The original probe survived the first
    // spawn-and-kill and died on the second: spawn, dwell long enough for the creature to take hold, kill,
    // and do it again. Each cycle is checked on its own, so the report says WHICH one broke rather than
    // leaving "it fails sometimes".
    const CYCLES=+arg('cycles',3);
    for(let c=1;c<=CYCLES;c++){
      await page.evaluate(`(()=>{ window._loopErr=null; if(!(__hc.hwState()||[]).length) __hc.hw(11); })()`);
      await sleep(9000);
      const held = await page.evaluate(`(()=>({ bound:__hc.hwPrime().bound, grabbed:!!__hc.st().grabbed, extras:(__hc.hwState()||[]).length }))()`);
      await page.evaluate(`(()=>{ __hc.hwKill(); })()`);
      await sleep(1200);
      await page.evaluate(`__hcPERF.reset()`);
      await sleep(2500);
      const r = await page.evaluate(`(()=>({ frames:(__hc.frameProf(600)||{}).frames||0, err:window._loopErr||null,
        bound:__hc.hwPrime().bound, fps:__hc.st().fps }))()`);
      check(`cycle ${c}: loop healthy after spawn+kill`, r.frames>0 && !r.err && r.bound===true,
        `frames ${r.frames}, bound ${r.bound}, held-before-kill ${JSON.stringify(held)}${r.err?', loopErr: '+String(r.err).split('\n')[0]:''}`);
      await page.evaluate(`window._loopErr=null`);
    }
    // kill it, then let several seconds of frames pass
    await page.evaluate(`(()=>{ window._loopErr=null; __hc.hwKill(); })()`);
    await sleep(1500);
    await page.evaluate(`__hcPERF.reset()`);
    await sleep(3000);
    const after = await page.evaluate(`(()=>({ frames:(__hc.frameProf(600)||{}).frames||0, err:window._loopErr||null,
      bound:__hc.hwPrime().bound, extras:(__hc.hwState()||[]).length, fps:__hc.st().fps }))()`);

    check('loop() records no exception after the kill', !after.err, after.err? String(after.err).split('\n')[0] : 'none');
    check('the profiler ring still commits frames',    after.frames>0, `frames ${after.frames} in 3 s (fps ${after.fps})`);
    check('the global Wretch is bound to the primary', after.bound===true, `bound ${after.bound}, extras ${after.extras}`);

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('THE BUG IS PRESENT: killing a Horrific Wretch that had hold of the player leaves the frame loop throwing every frame.');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
