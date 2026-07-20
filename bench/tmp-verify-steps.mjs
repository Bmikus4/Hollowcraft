// Smoke: footstep audio rework. Boots the game, resumes audio via a real key event,
// summons the wretch, forces HUNT close by, and watches for page errors + probes state.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  const errors=[];
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser = await chromium.launch({ executablePath:findBrowser(), headless:true, args:ARGS });
    const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    await ctx.addInitScript(`(()=>{ try{ Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get(){return document.getElementById('c')||null;}}); }catch(e){} })()`);
    const page = await ctx.newPage();
    page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=630', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, { timeout:90000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`, { timeout:90000 });
    // real input events → the game's own audioResume handler fires (AC created)
    await page.evaluate(`document.dispatchEvent(new Event('pointerlockchange'))`);
    await page.keyboard.press('KeyW'); await page.mouse.click(640,360); await sleep(800);
    // summon (retry until active), park it near, force a charge — beats should fire wretchFootfall every plant
    for(let i=0;i<10;i++){ const wa=await page.evaluate(`(()=>{ __hc.summon(); return __hc.st().wa; })()`); if(wa) break; await sleep(1000); }
    await page.evaluate(`(()=>{ __hc.put(10,0); __hc.set({state:'HUNT', committed:true, _advRate:8}); __hc.look(); })()`);
    for(let i=0;i<12;i++){ await sleep(1000);
      const st=await page.evaluate(`__hc.st()`);
      const ff=await page.evaluate(`({beat:window.__ffBeat||0, play:window.__ffPlay||0})`);
      if(i%3===0) console.log('t+'+i+'s wa='+st.wa+' ws='+st.ws+' dist='+st.dist+' ffBeat='+ff.beat+' ffPlay='+ff.play);
      if(errors.length) break; }
    // also exercise the creep path (STALK nearby) and the far path (far must emit ZERO new plays)
    await page.evaluate(`(()=>{ __hc.set({state:'STALK'}); __hc.put(6,2); })()`);
    await sleep(3000);
    const nearPlay=await page.evaluate(`window.__ffPlay||0`);
    await page.evaluate(`(()=>{ __hc.set({state:'TRACK', _advRate:5}); __hc.put(60,0); })()`);
    await sleep(4000);
    const farStats=await page.evaluate(`({beat:window.__ffBeat||0, play:window.__ffPlay||0})`);
    console.log('far test: plays before='+nearPlay+' after='+farStats.play+' (beats='+farStats.beat+') → '+((farStats.play===nearPlay)?'SILENT AT 60 BLOCKS, CORRECT':'LEAK: still audible far away'));
    console.log(errors.length? ('PAGE ERRORS:\n'+errors.join('\n')) : 'NO PAGE ERRORS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
