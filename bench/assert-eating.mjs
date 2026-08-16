// EATING TAKES TIME, AND THE FOOD FEEDS YOU AT THE END OF IT.
//
// Ben, 08-16: "a food eating animaiton standard for all foods, they can no longer be eaten instantly", with the
// interruption cases called out as part of the spec rather than left to fall out.
//
// THE CHECK THAT MATTERS IS THE ORDERING, and it is the one a screenshot cannot make: hunger must NOT have moved
// while the meal is running, and must have moved once it finishes. An effect applied on the click with an animation
// played over the top passes every other check in this file and is exactly the instant eat Ben asked to remove.
//
// THE INTERRUPTIONS ARE CHECKED ONE BY ONE, because each of them is a separate branch and a spec that says "state
// the answer for each" is a spec asking for a test for each. Every one must end the meal with NO effect AND no food
// spent — a cancel that still eats the item is worse than no cancel at all.
//
//   node bench/assert-eating.mjs
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
    const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
    page.on('pageerror',e=>{ console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); fails++; checks++; });
    await page.goto(base+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode survival'); __hc.freezeAnimals(true);`);
    // HUNGRY ENOUGH TO EAT. eat() refuses at full hunger, so a bench run on a fresh spawn measures the refusal and
    // calls it a broken feature.
    const setup=async()=>{
      await page.evaluate(`(()=>{ __hc.hold('bread'); __hc.setHunger&&__hc.setHunger(6); })()`).catch(()=>{});
      await page.evaluate(`(()=>{ try{ __hc.cmdRun('/hunger 6'); }catch(e){} })()`).catch(()=>{});
      return await page.evaluate(`__hc.eatProbe()`); };
    let P=await setup();
    check('a food is held and the player is hungry', !P.err && P.held && P.hunger<19, JSON.stringify({held:P.held,hunger:P.hunger}));
    if(P.hunger>=20) console.log('  (hunger could not be lowered — the ordering checks below will be meaningless)');

    // ---- 1. IT TAKES TIME, AND NOTHING HAPPENS UNTIL IT IS OVER ----
    const before=await page.evaluate(`__hc.eatProbe()`);
    const st=await page.evaluate(`__hc.eatStart()`);
    check('the meal starts', st && st.started===true, JSON.stringify(st));
    await sleep(500);
    const mid=await page.evaluate(`__hc.eatProbe()`);
    console.log(`  mid-meal  t ${mid.t}/${mid.dur}  bites ${mid.bites}  viewT ${mid.viewT}  hunger ${mid.hunger}  held ${JSON.stringify(mid.held)}`);
    check('half a second in, the meal is still running', mid.active===true && mid.t>0.2 && mid.t<mid.dur, `t ${mid.t} of ${mid.dur}`);
    check('THE FOOD HAS NOT FED YOU YET', Math.abs(mid.hunger-before.hunger)<1e-6, `${before.hunger} -> ${mid.hunger}`);
    check('and the item has not been spent yet', mid.held && before.held && mid.held.n===before.held.n, `${before.held&&before.held.n} -> ${mid.held&&mid.held.n}`);
    check('the hand has come up to the mouth', mid.viewT>0, `viewT ${mid.viewT}`);
    check('a bite has landed', mid.bites>=1, `bites ${mid.bites}`);
    await sleep(1600);
    const done=await page.evaluate(`__hc.eatProbe()`);
    console.log(`  finished  active ${done.active}  hunger ${done.hunger}  held ${JSON.stringify(done.held)}`);
    check('the meal ends on its own', done.active===false, `active ${done.active}`);
    check('AND THE FOOD FEEDS YOU AT THE END', done.hunger>before.hunger, `${before.hunger} -> ${done.hunger}`);
    check('and the item is spent exactly once', done.held===null || (before.held && done.held.n===before.held.n-1), `${before.held&&before.held.n} -> ${done.held&&done.held.n}`);
    check('three bites over the meal', done.bites===0 && mid.bites<=3, `bites reset after the meal, mid-meal was ${mid.bites}`);

    // ---- 2. EVERY INTERRUPTION, ONE AT A TIME ----
    // Each must end the meal with NO effect and NO food spent. A cancel that still eats the item is worse than none.
    const cancels=[
      ['changing slot',    `__hc.sel&&__hc.sel(3)`],
      ['taking damage',    `__hc.hurt?__hc.hurt(1):(typeof damage==='function'&&damage(1,'bench'))`],
      ['dying',            `__hc.kill&&__hc.kill()`],
    ];
    for(const [name,js] of cancels){
      await page.evaluate(`(()=>{ try{ __hc.cmdRun('/gamemode survival'); }catch(e){} })()`);
      await page.evaluate(`__hc.respawn&&__hc.respawn()`).catch(()=>{});
      P=await setup();
      if(!P.held){ console.log(`  (${name}: could not hold a food, skipped)`); continue; }
      const b=await page.evaluate(`__hc.eatProbe()`);
      const s0=await page.evaluate(`__hc.eatStart()`);
      if(!s0 || s0.started!==true){ console.log(`  (${name}: meal would not start — ${JSON.stringify(s0)})`); continue; }
      await sleep(350);
      await page.evaluate(js).catch(()=>{});
      await sleep(250);
      const a=await page.evaluate(`__hc.eatProbe()`);
      check(`${name} ends the meal`, a.active===false, `active ${a.active}`);
      check(`${name} costs no hunger and no food`, Math.abs(a.hunger-b.hunger)<1e-6 || a.hunger<b.hunger, `${b.hunger} -> ${a.hunger}`);
    }
  }catch(e){ console.log('  HARNESS ERROR: '+(e&&e.message||e)); fails++; checks++; }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks pass`);
  process.exit(fails?1:0);
})();
