// VERIFY the 08-04 batch, in one run:
//   1  no sulfur/pebble node stands on nothing (worldgen seat gate)
//   2  the vault leaf fills its 2x2 without touching the wall planes, and opening it SPINS then SWINGS
//   3  middle-click pick-block hands you the block you are looking at (creative)
//   4  F3 third person draws the body, wearing what you wear, holding what you hold, with the hand light on the hand
//      and all three first-person hand groups off
//   5  a creature standing inside stone has parts culled, and gets every one of them back when it leaves
//   node bench/tmp-verify-08-04.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const out={};
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(600);

    // ---- 1  decoration seats
    out.seats = await page.evaluate(`__hc.sulfurSeats(48)`);

    // ---- 2  the vault door
    out.vault = await page.evaluate(`(()=>{
      const P=__hc.pos(), x=Math.floor(P.x)+4, z=Math.floor(P.z), y=__hc.groundY(x,z)+1;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++) __hc.setBlockAt(x+dx,y+dy,z,'air');
      const placed=__hc.vaultPlace(x,y,z,true);
      return {placed, at:[x,y,z]}; })()`);
    await sleep(1400);   // let the chunk remesh so the leaf clone exists
    const [vx,vy,vz]=out.vault.at;
    out.vault.closed = await page.evaluate(`__hc.vaultLeafProbe(${vx},${vy},${vz})`);
    out.vault.toggle = await page.evaluate(`__hc.vaultToggle(${vx},${vy},${vz})`);
    await sleep(400);
    out.vault.early  = await page.evaluate(`__hc.vaultLeafProbe(${vx},${vy},${vz})`);   // mid-animation: wheel turning, leaf barely moved
    // Drive it to the end with fixed steps rather than waiting: headless runs at a handful of fps with a clamped dt, so wall
    // time is a bad proxy for animation time here (3.9 s of wall clock advanced it 1.5 s).
    out.vault.left   = await page.evaluate(`__hc.vaultTick(80,0.033)`);
    out.vault.rest   = await page.evaluate(`__hc.vaultLeafProbe(${vx},${vy},${vz})`);   // settled open, wheel back to zero, entry retired

    // ---- 3  pick block. Survival first (it must refuse), then creative (it must hand it over).
    out.pick = await page.evaluate(`(()=>{
      const P=__hc.pos(), x=Math.floor(P.x), z=Math.floor(P.z)+3, y=Math.floor(P.y)+1;
      __hc.setBlockAt(x,y,z,'gold_block');
      __hc.cam({yaw:Math.PI, pitch:0});       // model/world forward at yaw 0 is -z, so yaw PI looks down +z
      __hc.vitals(null,null,false);
      const survival=__hc.pickProbe();
      __hc.vitals(null,null,true);
      return { block:[x,y,z], survival, creative:__hc.pickProbe() }; })()`);

    // ---- 4  third person, wearing and holding things
    out.tps = {};
    out.tps.off = await page.evaluate(`__hc.tpsProbe(false)`);
    out.tps.on  = await page.evaluate(`(()=>{
      try{ __hc.eqPut(5,'backpack'); }catch(e){}   // 5 = EQ_PACK
      try{ __hc.equipHat('straw_hat'); }catch(e){}
      try{ if(typeof closeUI==='function')closeUI(); }catch(e){}
      __hc.hold('torch');
      return __hc.tpsProbe(true); })()`);
    await sleep(900);   // a few frames: the body follows the player and the held light moves onto its hand
    out.tps.lit = await page.evaluate(`__hc.tpsProbe()`);
    out.tps.backToFirst = await page.evaluate(`__hc.tpsProbe(false)`);

    // ---- 5  creature parts inside stone. freeze() keeps placeWretch running on a still creature, so the rig is really at
    //         wretch.pos rather than at the origin, and the stone is poured around it AFTER it lands.
    out.clip = await page.evaluate(`(()=>{ __hc.cam({yaw:0,pitch:0}); __hc.freeze(true,false); return __hc.wretchAt(5); })()`);
    await sleep(700);
    out.clip.placed = await page.evaluate(`__hc.clipProbe()`);           // standing in the open: nothing hidden
    out.clip.buried = await page.evaluate(`(()=>{ const w=__hc.clipProbe();
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=0;dy<6;dy++) __hc.setBlockAt(Math.round(w.wx)+dx, Math.round(w.wy)+dy, Math.round(w.wz)+dz, 'stone');
      return __hc.clipProbe(); })()`);
    out.clip.dug = await page.evaluate(`(()=>{ const w=__hc.clipProbe();
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=0;dy<6;dy++) __hc.setBlockAt(Math.round(w.wx)+dx, Math.round(w.wy)+dy, Math.round(w.wz)+dz, 'air');
      return __hc.clipProbe(); })()`);   // stone gone → every part it hid must be back
    out.errors=errors;
    await browser.close();
  } finally { server.kill(); }
  console.log(JSON.stringify(out,null,1));
})();
