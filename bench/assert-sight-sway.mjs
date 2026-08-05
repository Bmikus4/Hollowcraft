// EVERY SIGHT DRIFTS AS FAR AS THE SCOPED HUNTING RIFLE DOES.
//
// Ben: "the left/right sway of the scoped hunting rifle we added for realism needs added to all guns all sights."
//
// The four sway sources (breathing, movement, mouse-lag, transition) were ALREADY shared by every gun — so
// __hc.swayMag reports the same drift for all of them and CANNOT see this fault. The fault was downstream, in the
// pose: the default cheek-weld pose took `swx` at full strength, and each sight override re-applied it at 0.4, so
// the same breath moved the hunting rifle two and a half times as far as the holosight, the Python's notch or the
// AR's irons. A harness reading swayMag would have gone green on the bug.
//
// So this measures the POSE'S RESPONSE to a pinned drift: freeze the sway at a known value with __hc.swayPin and
// read view.group back through __hc.viewPose. Response = d(pose)/d(sway), which is the coefficient itself.
//
// A/B/A, because the bob term `b` is time-varying and a plain B-minus-A would fold its drift into the number.
// And the assertion is THE NUMBER (1.00, the rifle's), not "it moves" — every sight moved before this change.
//
//   node bench/assert-sight-sway.mjs
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

const D = 0.02;          // the pinned drift, in the same units the sway sources produce (metres / radians)
const TOL = 0.02;        // a sight is at parity if its response is within this of the reference

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(name,ok,detail)=>{ checks++; if(!ok) fails++; console.log((ok?'  PASS  ':'  FAIL  ')+name+(detail!==undefined?('   '+detail):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await sleep(2500);

    // stand still: every movement-driven sway source must be zero or the pinned reading is polluted.
    // (`player` is module-scoped and unreachable from here — standing still is simply not sending input.)
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.5); })()');

    const pose = ()=>page.evaluate('__hc.viewPose()');
    const pin  = (x,y)=>page.evaluate(`__hc.swayPin(${x==null?'null':x},${y==null?0:y})`);

    const guns=(await page.evaluate('__hc.itemClasses()')).gunsAll||[];
    check('the build reports its guns', guns.length>=5, `${guns.length} guns: ${guns.join(' ')}`);

    const rows=[];
    for(const g of guns){
      await page.evaluate('__hc.offhandSet(null)');                 // an offhand item forbids ADS entirely
      await page.evaluate('__hc.cmdRun("/clearinv")');
      await page.evaluate(`__hc.cmdRun("/give ${g} 1")`); await sleep(500);
      await page.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(300);
      await page.evaluate('__hc.aim(true)');
      // the pose is a BLEND until adsT lands, so a reading taken early measures a fraction of the aimed pose
      let ok=false; for(let i=0;i<40;i++){ const s=await pose(); if(s.adsT>=0.999){ ok=true; break; } await sleep(150); }
      if(!ok){ rows.push({gun:g,sight:'?',err:'never reached full ADS'}); await page.evaluate('__hc.aim(false)'); continue; }

      // ---- A/B/A on the LATERAL axis ----
      await pin(0,0);   await sleep(120); const a1=await pose();
      await pin(D,0);   await sleep(120); const b1=await pose();
      await pin(0,0);   await sleep(120); const a2=await pose();
      // ---- A/B/A on the VERTICAL axis ----
      await pin(0,D);   await sleep(120); const b2=await pose();
      await pin(0,0);   await sleep(120); const a3=await pose();
      await pin(null);  await page.evaluate('__hc.aim(false)'); await sleep(150);

      const mid=(p,q,k)=>(p[k]+q[k])/2;
      rows.push({ gun:g, sight:b1.sight,
        latX:+((b1.px-mid(a1,a2,'px'))/D).toFixed(3),     // position response to left/right drift
        yawY:+((b1.ry-mid(a1,a2,'ry'))/D).toFixed(3),     // yaw response to the same
        vertY:+((b2.py-mid(a2,a3,'py'))/D).toFixed(3),    // position response to up/down drift
        pitchX:+((b2.rx-mid(a2,a3,'rx'))/D).toFixed(3),
        drift:+Math.abs(a2.px-a1.px).toFixed(5) });       // the A-to-A noise floor: if this rivals the A-to-B change there is no result
    }

    for(const r of rows) console.log('     '+String(r.gun).padEnd(20)+String(r.sight||'').padEnd(11)+
      (r.err?('ERR '+r.err):('lateral '+String(r.latX).padStart(6)+'   yaw '+String(r.yawY).padStart(6)+
      '   vert '+String(r.vertY).padStart(6)+'   pitch '+String(r.pitchX).padStart(6)+'   A-A noise '+r.drift)));

    const good=rows.filter(r=>!r.err);
    check('every gun reached a full aim', good.length===rows.length && rows.length>0, rows.filter(r=>r.err).map(r=>r.gun).join(' ')||'all');

    // ESTABLISH THE NOISE FLOOR FIRST (lesson 9): an A-to-A drift near the A-to-B difference means no result.
    const worstNoise=Math.max(...good.map(r=>r.drift));
    check('the A-to-A noise floor is far below the effect being measured', worstNoise < D*0.05,
      `worst A-A drift ${worstNoise} vs pinned step ${D}`);

    // THE REFERENCE IS THE SCOPED HUNTING RIFLE — the gun Ben pointed at, not an average of the set.
    const ref=good.find(r=>r.sight==='scope');
    check('the scoped hunting rifle is present as the reference', !!ref, ref?`${ref.gun} lateral ${ref.latX}`:'no scope sight found');
    if(ref){
      // ASSERT THE NUMBER. The scope pose is `swx + lat*0.010` with lat=0 standing still, so the reference response
      // is 1.00 exactly; the overrides were 0.40. "it responds at all" passes on the bug.
      check('the reference rifle responds to lateral drift 1:1', Math.abs(ref.latX-1)<=TOL, `lateral ${ref.latX}, expected 1.00`);

      const offLat=good.filter(r=>Math.abs(r.latX-ref.latX)>TOL);
      check('EVERY sight drifts left/right as far as the scoped rifle', offLat.length===0,
        offLat.length?offLat.map(r=>`${r.gun}(${r.sight}) ${r.latX} vs ${ref.latX}`).join('; '):`all ${good.length} at ${ref.latX}`);

      const offYaw=good.filter(r=>Math.abs(r.yawY-ref.yawY)>TOL);
      check('and every sight yaws with it by the same amount', offYaw.length===0,
        offYaw.length?offYaw.map(r=>`${r.gun}(${r.sight}) ${r.yawY} vs ${ref.yawY}`).join('; '):`all ${good.length} at ${ref.yawY}`);

      const offV=good.filter(r=>Math.abs(r.vertY-ref.vertY)>TOL);
      check('vertical drift is at parity too, so no sight reads as a rail', offV.length===0,
        offV.length?offV.map(r=>`${r.gun}(${r.sight}) ${r.vertY} vs ${ref.vertY}`).join('; '):`all ${good.length} at ${ref.vertY}`);

      const offP=good.filter(r=>Math.abs(r.pitchX-ref.pitchX)>TOL);
      check('and every sight pitches with it by the same amount', offP.length===0,
        offP.length?offP.map(r=>`${r.gun}(${r.sight}) ${r.pitchX} vs ${ref.pitchX}`).join('; '):`all ${good.length} at ${ref.pitchX}`);
    }

    // the pin is a debug hook: it must not be left latched, or every later harness measures a frozen gun
    check('the sway pin is released', (await page.evaluate('__hc.viewPose()')).pin===null);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('SIGHTS DISAGREE: a sight applying a fraction of the shared drift is the fault — compare each row against the scope row.');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
