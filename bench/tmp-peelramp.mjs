// THE PEEL'S RAMP, sampled over real time. Ben: "the ceraphims world peel sequence to happen mush slower, beginning very
// slowly from the start of stage 2." So the two things to prove are WHEN it opens (the moment phase 2 starts, not at half
// health) and HOW FAST it grows -- and the honest way to see a rate is to let the clock run and read it repeatedly, not to
// reason about the constants.
//
// The boss is driven into phase 2 through the game's own path: summon it, then damage it until startBossRegen fires.
//
// usage: node bench/tmp-peelramp.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const page=await (await browser.newContext({ viewport:{width:1000,height:620} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(6000);
    // NIGHT. At midday the seraph despawned four seconds into phase 2 and endPeel went with it, which read as the peel
    // switching itself off -- the daylight despawn rule, not the ramp. The fight happens at night anyway.
    await page.evaluate('__hc.setTime(0.66)');

    const peel=async()=>page.evaluate('__hc.peel({})');
    const boss=async()=>page.evaluate('(()=>{ try{ const v=__hc.void3({}); return {phase:v.phase, hp:v.hp}; }catch(e){ return {err:String(e.message||e)}; } })()');

    // CREATIVE, so the player cannot be killed. Standing six blocks from a seraph doing nothing gets you killed in about five
    // seconds, and the player's death despawns the boss, which calls endPeel -- that is what looked like the peel switching
    // itself off one second after the regen flood.
    console.log('gamemode: '+JSON.stringify((await page.evaluate('__hc.cmdRun("/gamemode creative")')).out));
    console.log('before the boss: '+JSON.stringify(await peel()));

    // Summon and take it through phase 1 the way the game does.
    console.log('summon: '+JSON.stringify(await page.evaluate('(()=>{ try{ return __hc.spawnBoss? __hc.spawnBoss() : __hc.cmdRun("/spawn ceraphim"); }catch(e){ return String(e.message||e); } })()')));
    await sleep(9000);
    console.log('boss: '+JSON.stringify(await boss()));

    // Damage it until the phase flips. hurtBoss/hurtWretch through whatever hook exists; /spawn does not hurt it.
    for(let i=0;i<80;i++){
      await page.evaluate('(()=>{ try{ if(__hc.hurtBoss) return __hc.hurtBoss(400); }catch(e){} try{ return __hc.hurtWretch? __hc.hurtWretch(400):null; }catch(e){ return null; } })()');
      const b=await boss(); if(b && b.phase>=2) break; await sleep(250);
    }
    const b2=await boss();
    console.log('after damage: '+JSON.stringify(b2));
    console.log('peel at the moment phase 2 opens: '+JSON.stringify(await peel()));

    // Sample the ramp with NO further damage, so what is measured is the creep itself and not the target being pushed up.
    for(let i=1;i<=12;i++){ await sleep(1000); const p=await peel();
      console.log('  t+'+i+'s  on='+p.on+' p='+p.p+' target='+p.target+' flakes='+p.flakes+' phase='+p.phase+' active='+p.active+' boss='+p.boss+' regen='+p.regen); }
    // Then a burst of damage, to show the target walking up with the fight rather than on a switch.
    for(let k=0;k<8;k++) await page.evaluate('__hc.hurtBoss(700)');
    const after=await peel();
    console.log('after 5600 more damage: target='+after.target+'  p='+after.p+'  hp='+after.hp+'/'+after.hpMax);
    await sleep(6000);
    const later=await peel();
    console.log('  six seconds later:  p='+later.p+'  flakes='+later.flakes);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
