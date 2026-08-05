// #60 says to run __hc.silo() FIRST and say which reading I took: if the worldgen silo is effectively never found in ordinary
// play, then placeable/craftable items are the whole feature and parenting a missile into the shaft is a bonus.
// So: where is the silo relative to spawn, is it on the route to anything, and does it build when the player is actually there?
//   node bench/tmp-silo-reach.mjs
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
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1000,height:600}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.30); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    const pr=await page.evaluate('__hc.probe()');
    console.log('  spawn      ', JSON.stringify({x:pr.x,z:pr.z, spawnX:pr.spawnX, spawnZ:pr.spawnZ, world:pr.worldSize}));
    // POLLED, because _siloFindSpot only scans on 1-in-30 frames (like buildVillage's scan) and returns null on the other 29. A
    // single call read spot:null and I nearly wrote that up as "the silo has no site".
    let s0=null;
    for(let i=0;i<60;i++){ s0=await page.evaluate('__hc.silo()'); if(s0 && s0.spot) break; await sleep(120); }
    console.log('  silo (from spawn)', JSON.stringify(s0));
    if(s0 && s0.spot){
      const d=Math.hypot(s0.spot.x-pr.x, s0.spot.z-pr.z);
      console.log('  distance from spawn: '+d.toFixed(0)+' blocks');
      // Walk the player there the way the game streams, then see whether the builder fires on its own.
      await page.evaluate('__hc.siloGoto()'); await sleep(4000);
      const s1=await page.evaluate('__hc.silo()');
      console.log('  after arriving   ', JSON.stringify(s1));
      await page.evaluate('__hc.cam({yaw:0,pitch:0.05})'); await sleep(1500);
      await page.screenshot({path:path.join(ROOT,'bench','results','silo-arrive.png')});
      const st=await page.evaluate('__hc.icbmFlightState()');
      console.log('  icbm state       ', JSON.stringify(st));
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
