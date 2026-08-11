// EVERY HELD GUN FITS IN FRONT OF THE EYE, AIMED OR NOT.
//
// Ben 08-04: "i can still see inside the shotgun's stock when it is ads." Seeing the INSIDE of a mesh means the near plane
// has cut through it, so this is measurable rather than a matter of opinion: transform the viewmodel's bounds into CAMERA
// space and compare its rearmost point against camera.near.
//
// Measured before the fix, across all 16 gun variants while aimed: the AR sat 0.065 BEHIND the near plane, the minigun
// 0.010 behind, and the bolt rifle's stock reached camera-space z = +0.08 — behind the eye entirely. The shotgun was the
// one Ben noticed and was not actually clipped; it had 0.053 of clearance, which at a 0.08 near plane puts the eye inside
// the stock's shell. 14 of 16 variants were affected, which is why the fix is one guard band applied to the pose and not
// sixteen hand-tuned numbers.
//
// ASSERT THE NUMBER, AND ASSERT IT FOR EVERY VARIANT. "the shotgun is fine now" is what a one-gun check would have said
// while the bolt rifle's stock was still through the camera.
//
//   node bench/assert-ads-clearance.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// TWO BANDS, BECAUSE THE CODE KEEPS TWO. VIEW_NEAR_CLEAR is 0.10 at the hip and HALVED at the shoulder — Ben asked for the
// holosight guns and the scoped rifle to sit closer when aimed, and the band is the only lever that moves an aimed gun (the
// distance is set off the REARMOST corner, a foot behind the glass, so moving optic.z does nothing). This file asserted one
// flat 0.09 against both states, so all 16 variants "failed" at a 0.05 aimed clearance that is the shipped intent.
//   AND IT MEASURES THE ITEM, NOT THE ARM. adsClearance reports both: `clearance` excludes the _noBB subtrees the guard
// excludes — the forearm attachGunHand parents to the gun, which runs back to your shoulder and is behind the lens by
// design — while `armClearance` includes them. Asserting the arm is what produced 16 red rows naming every gun in the game
// at hip AND aimed, where adsT is 0 and the aimed band cannot even reach. Measured: rear-most vertex was the arm in 5/5
// guns sampled, item clearance 0.05-0.37 and never clipped.
const HIP_MARGIN=0.09, ADS_MARGIN=0.045;   // just under the 0.10 / 0.05 the code keeps, so float noise cannot flake a correct build

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+d):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);

    const guns=(await page.evaluate('__hc.itemClasses()')).gunsAll||[];
    check('the build reports its guns', guns.length>=5, `${guns.length} variants`);
    const rows=[];
    for(const g of guns){
      await page.evaluate('__hc.offhandSet(null)');
      await page.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1")`); await sleep(350);
      await page.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(400);
      const hip=await page.evaluate('__hc.adsClearance()');
      await page.evaluate('__hc.aim(true)');
      let ok=false; for(let i=0;i<30;i++){ if((await page.evaluate('__hc.adsClearance()')).adsT>=0.999){ ok=true; break; } await sleep(150); }
      const ads=await page.evaluate('__hc.adsClearance()');
      await page.evaluate('__hc.aim(false)'); await sleep(150);
      rows.push({g, reachedAds:ok, hip:hip.clearance, ads:ads.clearance, hipClip:hip.clipped, adsClip:ads.clipped, near:ads.near,
                 armHip:hip.armClearance, armAds:ads.armClearance, rear:ads.rearName, rearArm:ads.rearIsArm});
    }
    for(const r of rows) console.log('     '+r.g.padEnd(30)+'hip '+String(r.hip).padStart(8)+'   ads '+String(r.ads).padStart(8)+(r.adsClip||r.hipClip?'   CLIPPED':''));

    check('every gun reached a full aim', rows.every(r=>r.reachedAds), rows.filter(r=>!r.reachedAds).map(r=>r.g).join(' ')||'all');
    const clipped=rows.filter(r=>r.adsClip||r.hipClip);
    check('NO gun is cut by the near plane, hip or aimed', clipped.length===0, clipped.map(r=>r.g).join(' ')||`${rows.length} variants clear`);
    // The guard band, not merely "not clipped": a gun 1mm in front of the near plane is still a stock in your eye. Each
    // state against its own band — see the note at the top for why one number could not cover both.
    const tight=rows.filter(r=>r.ads<ADS_MARGIN||r.hip<HIP_MARGIN);
    check(`every gun keeps its band (hip ${HIP_MARGIN} / aimed ${ADS_MARGIN})`, tight.length===0,
      tight.length?tight.map(r=>`${r.g} hip ${r.hip} ads ${r.ads}`).join('; ')
                  :`worst hip ${Math.min(...rows.map(r=>r.hip))}, worst ads ${Math.min(...rows.map(r=>r.ads))}`);
    // The bolt rifle is named because it was the worst: camera-space z +0.08, the stock BEHIND the eye.
    const bolt=rows.find(r=>r.g==='hunting_rifle');
    check('the bolt rifle in particular no longer has its stock behind the eye', bolt && bolt.ads>=ADS_MARGIN, bolt?`ads clearance ${bolt.ads}`:'not found');
    // THE ARM IS REPORTED, NEVER ASSERTED. It is behind the lens on purpose, and a row here is information about the pose,
    // not a failure — but it is printed, because an arm that suddenly reaches 0.5 back means a hand rig has come loose.
    const arms=rows.filter(r=>r.armAds!=null&&r.armAds<-0.45);
    console.log('     arm behind the lens (by design): worst '+Math.min(...rows.map(r=>r.armAds==null?0:r.armAds)).toFixed(3)+
      (arms.length?('   UNUSUAL: '+arms.map(r=>r.g).join(' ')):''));
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('A CLIPPED row means that gun\'s stock is in the camera: you see its interior faces, and a muzzle flash behind it cannot be seen.');
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
