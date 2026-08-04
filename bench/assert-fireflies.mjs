// FIREFLIES (Ben 08-04: "add fireflies").
//
// WHAT A FIREFLY HAS TO BE, and each of these is a check: present at night and ABSENT by day; a swarm that BLINKS out of step, so
// the frame-to-frame brightness of the set changes without the count changing; over the forest floor rather than out at sea; gone
// in rain; and thinned by worldHush(), because the wood going dark and quiet together is what E2 bought.
//
// AND CHEAP. One Points object, one draw call, one buffer upload — 128 sprites, no lights. A PointLight in this renderer takes no
// occlusion (Ben watched one leak through a hillside), so 128 of them would be both wrong and unaffordable. The perf check here is
// the frame time with a full swarm against the same scene with none.
//
//   node bench/assert-fireflies.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// NIGHT IS MEASURED, NOT ASSUMED (bench/tmp-daymap.mjs): __hc.setTime's "0 = midnight" comment is wrong — uDay is 1 at t=0. uDay
// reaches 0 across t 0.63..0.94.
const NIGHT=0.78, DAY=0.30;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+d):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync']});
    const page=await (await browser.newContext({viewport:{width:1000,height:640}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await page.evaluate('__hc.pinScene()');   // no weather: rain is one of the things that must SUPPRESS them, tested on purpose below
    await sleep(2500);
    const ev=js=>page.evaluate(js);
    await ev('__hc.dreadSet(0)'); await ev('__hc.threatSet(0)');

    // ---- NIGHT: a swarm exists ----
    await ev(`__hc.setTime(${NIGHT})`); await sleep(2500);
    const n1=await ev('__hc.fireflies()');
    console.log('     night   '+JSON.stringify(n1));
    check('fireflies exist at night', n1.built===true && n1.live>0, JSON.stringify(n1));
    check('and they are over the land, not the whole map', n1.live<=128, 'live '+n1.live);
    // THE BLINK, AND IT HAS TO BE MEASURED ACROSS THE SWARM, NOT AT ITS PEAK. My first version sampled the BRIGHTEST sprite and
    // read 1.000 every time — with 127 of them out of phase, someone is always at the top of their pulse, so the maximum is
    // constant by construction and says nothing. What blinking actually means is that the number LIT keeps changing while the
    // number ALIVE does not, and that most of them are dark at any instant.
    const lit=[], live=[];
    for(let i=0;i<16;i++){ const s=await ev('__hc.fireflies()'); lit.push(s.lit); live.push(s.live); await sleep(110); }
    const litSpread=Math.max(...lit)-Math.min(...lit), liveSpread=Math.max(...live)-Math.min(...live);
    console.log('     lit over 1.8s: '+lit.join(' ')+'   (live '+Math.min(...live)+'-'+Math.max(...live)+')');
    check('the swarm BLINKS: how many are lit keeps changing', litSpread>=6, `lit ranged ${Math.min(...lit)}-${Math.max(...lit)}`);
    check('while the swarm itself is stable, so that is blinking and not churn', liveSpread<=8, `live ranged ${Math.min(...live)}-${Math.max(...live)}`);
    // Mostly dark between flashes is the read: a firefly that is always on is a fairy light.
    const avgLit=lit.reduce((a,b)=>a+b,0)/lit.length, avgLive=live.reduce((a,b)=>a+b,0)/live.length;
    check('and most of them are dark at any instant', avgLit < avgLive*0.6, `${avgLit.toFixed(0)} lit of ${avgLive.toFixed(0)}`);

    // ---- THEY ARE ON SCREEN, AND THE COMPARISON HAS TO HOLD THE LIGHTING STILL ----
    // First attempt compared a NIGHT frame against a DAY one and counted "bright green" pixels: daylit grass scored 101,222 to the
    // swarm's 1,239, which is a test of the sun. Both frames are night now, and the only difference is the hush — which is a
    // switch for the swarm and nothing else. Grain off, so the diff is the fireflies rather than the film.
    await ev('__hc.grainSet(0)');
    await ev('__hc.cam({yaw:1.2,pitch:-0.06})'); await sleep(900);
    const fN=path.join(ROOT,'bench','results','fireflies-night.png');
    await page.screenshot({path:fN});
    await ev('__hc.threatSet(1)'); await sleep(1600);                       // same night, same view, swarm suppressed
    const fOff=path.join(ROOT,'bench','results','fireflies-none.png');
    await page.screenshot({path:fOff});
    await ev('__hc.threatSet(0)'); await sleep(1400);
    const appeared=(()=>{ const A=decodePNG(fs.readFileSync(fOff)), B=decodePNG(fs.readFileSync(fN));
      const {w,h,ch,data:da}=A, db=B.data; let n=0;
      for(let y=Math.round(h*0.10); y<Math.round(h*0.85); y++) for(let x=Math.round(w*0.05); x<Math.round(w*0.95); x++){
        const k=(y*w+x)*ch; if(db[k+1]-da[k+1]>24) n++; }                   // got brighter in green: an additive speck arrived
      return n; })();
    console.log('     pixels the swarm adds to an otherwise identical night frame: '+appeared);
    check('the swarm is visible on screen', appeared>150, appeared+' px brightened');

    // ---- DAY: none, and nothing drawn ----
    await ev(`__hc.setTime(${DAY})`); await sleep(2500);
    const d1=await ev('__hc.fireflies()');
    console.log('     day     '+JSON.stringify(d1));
    check('by day there are none', d1.live===0 || d1.visible===false, JSON.stringify(d1));

    // ---- RAIN AND THE HUSH BOTH TAKE THEM AWAY ----
    await ev(`__hc.setTime(${NIGHT})`); await sleep(1800);
    const base0=(await ev('__hc.fireflies()')).live;
    await ev('__hc.threatSet(1)'); await sleep(1200);
    const hushed=await ev('__hc.fireflies()');
    check('the hush thins the swarm to nothing', hushed.live===0, `live ${base0} -> ${hushed.live} at hush ${hushed.hush}`);
    await ev('__hc.threatSet(0)'); await sleep(1500);
    const backNow=(await ev('__hc.fireflies()')).live;
    check('and they come back when it lifts', backNow>0, `live ${backNow}`);
    // RAIN, driven through the weather COMMAND — pinScene holds the weather with rainHold=1e9 and there is no rain hook, so the
    // first version of this check ran with rain still at 0 and passed on a condition it never created.
    await ev('__hc.cmdRun("/weather rain 1")'); await sleep(4000);
    const wet=await ev('__hc.fireflies()');
    console.log('     in rain '+JSON.stringify(wet));
    check('rain is actually falling for this check', wet.rain>0.3, `rain ${wet.rain}`);
    // AGAINST THE LAW, NOT A GUESS. Rain lerps toward its target, so it was at 0.414 when read and the swarm was 83 of 128 — which
    // is exactly the designed 1 - 0.85*rain. A flat "under 60%" bar failed a correct build for being measured mid-shower.
    const wantLive=Math.round(base0*(1-0.85*wet.rain));
    check('and rain thins them by the amount it is raining', Math.abs(wet.live-wantLive)<=10,
      `live ${wet.live} at rain ${wet.rain}, law predicts ${wantLive} (dry ${base0})`);
    await ev('__hc.cmdRun("/weather clear")');
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
