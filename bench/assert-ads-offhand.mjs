// NO AIMING WITH A FULL LEFT HAND. Ben: "guns are no exception to that rule, and cannot be aimed when equipped with
// something in an offhand."
//
// Three states, all driven through the real right mouse button with the pointer locked:
//  1. Empty offhand: right-hold AIMS (the control -- without it, a test that only ever sees ads:false passes on a build
//     where aiming is broken outright).
//  2. Something in the offhand: right-hold does NOT aim.
//  3. Aim already up, then something enters the offhand: the aim DROPS, without releasing the button.
//
// usage: node bench/assert-ads-offhand.mjs
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
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(56)+' got='+JSON.stringify(got).slice(0,200)); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:900,height:560} })).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.keyboard.press('Escape'); await sleep(1400);
    ok('pointer lock held', (await page.evaluate('__hc.uiState()')).locked===true, await page.evaluate('__hc.uiState()'));

    const aim=()=>page.evaluate('__hc.sight()');   // the build already reports ads/adsT here; no new hook needed
    const cls=await page.evaluate('__hc.itemClasses()');
    // The rule is about every gun, so run all of them. A gun that cannot aim in the first place would hide a failure here.
    const guns=(cls.gunsAll||[cls.gun]).filter(Boolean);

    let aimedAtLeastOne=false, blockedAll=true, droppedAll=true;
    const rows=[];
    for(const g of guns){
      await page.evaluate('__hc.offhandSet(null)');
      await page.evaluate('__hc.cmdRun("/clearinv")');
      await page.evaluate(`__hc.cmdRun("/give `+g+` 1")`); await sleep(700);

      // 1. EMPTY OFFHAND → aims.
      await page.mouse.down({button:'right'}); await sleep(900);
      const a1=await aim();
      // 3. WHILE STILL HELD, fill the offhand → the aim must drop with the button never released.
      await page.evaluate('__hc.offhandSet("torch",1)'); await sleep(900);
      const a2=await aim();
      await page.mouse.up({button:'right'}); await sleep(400);

      // 2. OFFHAND FULL from the start → never aims.
      await page.mouse.down({button:'right'}); await sleep(900);
      const a3=await aim();
      await page.mouse.up({button:'right'}); await sleep(300);

      rows.push({gun:g, freeHand:a1.ads, whileFilling:a2.ads, handFull:a3.ads, adsT:a2.adsT});
      if(a1.ads) aimedAtLeastOne=true;
      if(a3.ads) blockedAll=false;
      if(a2.ads) droppedAll=false;
    }
    for(const r of rows) console.log('     '+r.gun.padEnd(30)+' free hand aims='+String(r.freeHand).padEnd(6)+' hand filled mid-aim='+String(r.whileFilling).padEnd(6)+' full hand aims='+r.handFull);

    ok('guns DO aim with a free left hand (control)', aimedAtLeastOne, rows.filter(r=>r.freeHand).map(r=>r.gun).slice(0,4));
    ok('no gun aims with something in the offhand', blockedAll, rows.filter(r=>r.handFull).map(r=>r.gun));
    ok('an aim already up drops when the offhand fills', droppedAll, rows.filter(r=>r.whileFilling).map(r=>r.gun));
    ok('no page errors', errs.length===0, errs.slice(0,3));

    console.log('\n'+checks+' checks, '+fails+' failed  ('+guns.length+' guns)');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
