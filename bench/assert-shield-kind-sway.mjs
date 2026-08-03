// ASSERT two rules Ben set:
//   1. "a shield can almost completely deflect a direct attack, but it cannot deflect explosions"
//   2. "when an offhand item is equipped gun sway becomes 20% less accurate"
//
// Rule 1 is measured through the real damage() choke point (__hc.hurt drives it), by KIND: direct must lose almost
// nothing, blast must lose the full hit, and env must lose the full hit too -- a shield was quietly cutting starvation,
// thirst, drowning and fall damage before the kind existed, which nobody had asked for.
//
// Rule 2 reads the sway the POSE is built from (view.swayX/Y, published by updateView) rather than recomputing it, so
// what is compared is the drift the player sees. The sway sources are time-varying sines, so a single sample proves
// nothing: this samples many frames with an empty offhand and many with a full one, and compares the MEANS.
//
// usage: node bench/assert-shield-kind-sway.mjs
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

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(52)+' got='+JSON.stringify(got)); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(6000);

    console.log('\n[1] the shield answers a direct attack and NOT a blast');
    const bare = await page.evaluate('(()=>{ __hc.shieldHold("none"); return __hc.hurt(10,"direct"); })()');
    const dir  = await page.evaluate('(()=>{ __hc.shieldHold("off"); return __hc.hurt(10,"direct"); })()');
    const bl   = await page.evaluate('(()=>{ __hc.shieldHold("off"); return __hc.hurt(10,"blast"); })()');
    const env  = await page.evaluate('(()=>{ __hc.shieldHold("off"); return __hc.hurt(10,"env"); })()');
    const def  = await page.evaluate('(()=>{ __hc.shieldHold("off"); return __hc.hurt(10); })()');
    const lost = h => +(20-h).toFixed(3);
    console.log('  health after a 10 hit -- bare '+bare+' / direct '+dir+' / blast '+bl+' / env '+env+' / untyped '+def);
    ok('no shield: the full hit lands', Math.abs(lost(bare)-10)<0.01, lost(bare));
    ok('direct: almost completely deflected (<=1.5 of 10)', lost(dir)<=1.5 && lost(dir)>0, lost(dir));
    ok('blast: the shield does nothing', Math.abs(lost(bl)-10)<0.01, lost(bl));
    ok('env: the shield does nothing either', Math.abs(lost(env)-10)<0.01, lost(env));
    ok('an untyped call still counts as direct', Math.abs(lost(def)-lost(dir))<0.01, lost(def));

    console.log('\n[2] a full offhand costs 20% of gun sway');
    // Arm a gun and hold the aim, or every sway source is zero and both means come out 0.
    // swingAt(0,'ar15') is the way to get a gun into the hand -- __hc.arm() ends the day-1 grace, it does not arm YOU --
    // and aim(true) holds the right mouse button, which is what drives adsT and therefore every sway source.
    await page.evaluate('(()=>{ __hc.shieldHold("none"); __hc.eqPut(4,null); })()');
    await page.evaluate('__hc.swingAt(0,"ar15")'); await page.evaluate('__hc.aim(true)');
    await sleep(1600);

    // PAIRED IN TIME, not two separate windows. The sway is a sum of sines whose slowest term has a ~12s period, so two
    // 1.8s windows sampled minutes apart sit at different phases and their means are not comparable -- measured that way
    // the ratio came out 2.50 against a code multiplier of exactly 1.20. Toggling the offhand between two reads a few
    // milliseconds apart holds the phase almost still, so each PAIR is a clean before/after and the median is the answer.
    // WAIT A FRAME after each change. swayMag reports view.swayX/Y as updateView last wrote them, so reading immediately
    // after eqPut returns the sway of the state BEFORE the toggle: measured that way the ratio came out 0.836, which is
    // 1/1.196 -- the right number upside down, because every pair was reversed.
    const step = async (js) => page.evaluate('(async()=>{ '+js+' await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); return __hc.swayMag(); })()');
    const ratios=[], magsEmpty=[];
    for(let i=0;i<50;i++){
      const a = await step('__hc.eqPut(4,null);');
      const b = await step('__hc.eqPut(4,"shield");');
      if(a && b && a.mag>1e-6){ ratios.push(b.mag/a.mag); magsEmpty.push(a.mag); }
      await sleep(35);
    }
    ratios.sort((x,y)=>x-y);
    const med = ratios.length? ratios[ratios.length>>1] : 0;
    const meanEmpty = magsEmpty.reduce((s,v)=>s+v,0)/(magsEmpty.length||1);
    console.log('  '+ratios.length+' paired samples; empty-offhand |sway| mean '+meanEmpty.toFixed(6));
    console.log('  ratio median '+med.toFixed(4)+'  min '+(ratios[0]||0).toFixed(4)+'  max '+(ratios[ratios.length-1]||0).toFixed(4)+'  (target 1.20)');
    ok('sway is non-zero to begin with', meanEmpty>1e-5, +meanEmpty.toFixed(6));
    ok('a full offhand multiplies sway by ~1.20', Math.abs(med-1.20)<0.04, +med.toFixed(4));

    ok('no page errors', errs.length===0, errs.length);
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
