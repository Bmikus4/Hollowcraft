// FOUR ASKS FROM ONE FRAME OF STATE (Ben 08-05):
//   "third person: revolvers/handguns need to be in the fist of the held arm/right arm, or left arm"
//   "FIRST PERSON: ALL HELD GUNS should be held by a normal sized arm"
//   "In First person, the revolver is not aimed/lined up properly"
//   "the minigun needs more recoil when ADS"
// None of them is answerable from a picture: the third-person hand is 40 px across, the first-person arm runs off the bottom of
// the frame, and recoil is a camera delta over a burst.
//   node bench/assert-gun-hold.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
const W=900,H=600;
const GUNS=['revolver','revolver_suppressed','ar15','hunting_rifle','shotgun','minigun'];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1200);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); __hc.giveItem('rifle_ammo',400); })()`);
    await page.evaluate(`__hc.tpsProbe(true)`); await sleep(900);
    console.log('\n[1] the arm on the gun, and the grip in the fist');
    for(const id of GUNS){
      const r=await page.evaluate(`__hc.gunHold('${id}')`); await sleep(250);
      console.log('   ', id.padEnd(20), JSON.stringify(r));
      if(r.err){ ok(id+': could be held', false, r); continue; }
      // NORMAL SIZED: buildFist's own authored length. 0.42 was a 22 cm forearm on every gun in the game.
      ok(id+': first person holds it on a normal sized arm', r.fp&&r.fp.armScale===1, r.fp);
      // …and lengthening it must not slide the palm off the grip: the placement solves for the tip, so this stays ~0.
      ok(id+': …with the palm still on the grip', r.fp&&r.fp.palmToGrip<0.02, r.fp);
      // …and the arm must not join the gun's footprint, or the near-plane guard shoves every gun forward to keep an elbow that
      // belongs behind the eye in front of it.
      ok(id+': …and the arm is out of the gun\'s bounding box', r.fp&&r.fp.noBB===true, r.fp);
      if(r.handgun) ok(id+': third person holds it in the fist', r.tps&&r.tps.gripInFist<0.09, r.tps);
      else ok(id+': a long gun is still shouldered, not fisted', r.tps&&r.tps.heldScale===1&&r.tps.handY===-0.8?false:true, r.tps);
    }
    console.log('\n[2] the revolver\'s sights on the eye line');
    for(const id of ['revolver','revolver_suppressed']){
      const hip=await page.evaluate(`__hc.sightLine('${id}',false)`); await sleep(200);
      const ads=await page.evaluate(`__hc.sightLine('${id}',true)`); await sleep(200);
      console.log('   ', id.padEnd(20), 'hip', JSON.stringify(hip), '\n                         ads', JSON.stringify(ads));
      ok(id+': the aim actually raised', ads.adsT>0.95, {adsT:ads.adsT});
      // On the eye line: the declared sight height lands within 6 mm of the camera axis. Anything more is a sight picture that
      // does not point where the round goes, which on irons there is no glass to notice.
      ok(id+': the sight line is on the camera axis at full ADS', ads.offAxis<0.006, {offAxis:ads.offAxis, sightLocal:ads.sightLocal});
      ok(id+': …and the bore is parallel to the look', ads.boreVsLookDeg<1.2, {deg:ads.boreVsLookDeg});
      ok(id+': and the hip carry is left alone', hip.adsT<0.05, {adsT:hip.adsT});
    }
    console.log('\n[3] the minigun kicks harder sighted than from the hip');
    // The burst is fired through __hc.fire, and the climb is read off the camera's own pitch before and after. adsT has to be at
    // full before the trigger: the multiplier is scaled by it, so firing during the raise measures a fraction of the effect.
    const rec=await page.evaluate(`(async()=>{
      const out={};
      for(const state of ['hip','ads']){
        __hc.hold('minigun'); __hc.giveItem('rifle_ammo',400);
        __hc.aim(state==='ads');
        await new Promise(r=>setTimeout(r,2200));
        const before=__hc.cam().pitch, ads0=__hc.xhProbe?__hc.xhProbe().adsT:null;
        const f=__hc.fire(12);
        await new Promise(r=>setTimeout(r,600));
        out[state]={ climb:+(__hc.cam().pitch-before).toFixed(4), fired:f.fired, adsT:ads0 };
        __hc.aim(false); await new Promise(r=>setTimeout(r,900));
      }
      return out; })()`);
    console.log('    recoil', JSON.stringify(rec));
    ok('the burst actually fired in both states', rec&&rec.hip&&rec.ads&&rec.hip.fired>8&&rec.ads.fired>8, rec);
    ok('…and the sighted one was really sighted', rec&&rec.ads&&(rec.ads.adsT==null||rec.ads.adsT>0.9), rec&&rec.ads);
    // 3x the per-shot kick at full ADS, so a 12-round burst climbs about three times as far. 1.8x is the floor, because the camera
    // recoil also decays while the burst is going out.
    ok('sighted, the minigun climbs more per burst', rec&&Math.abs(rec.ads.climb) > Math.abs(rec.hip.climb)*1.8, rec);
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
