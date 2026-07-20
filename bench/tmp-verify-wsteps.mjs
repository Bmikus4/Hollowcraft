// WRETCH FOOTSTEP AUDIT (Ben 07-20): whenever it MOVES within audible range, footfall audio must fire.
// Samples __ffBeat (anim plants) and __ffPlay (steps that sounded) against real movement per 1s window.
//   node bench/tmp-verify-wsteps.mjs
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
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=650',{waitUntil:'load',timeout:90000});   // night — the wretch moves freely
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await page.keyboard.press('KeyW'); await sleep(400);   // trusted gesture → initAudio() runs → audioReady=true (else every footfall gates out silently)
    await page.evaluate(`__hc.put(9,0)`);   // summon + drop it 9 blocks away → it stalks (moves) in audible range
    await sleep(3000);
    setTimeout(()=>{ page.evaluate(`__hc.yank()`).catch(()=>{}); }, 15000);   // halfway through: force HUNT at arm's length → charge-gait steps get sampled too
    const windows=[];
    let prev=await page.evaluate(`(()=>{ const s=__hc.st(); return {b:window.__ffBeat||0,p:window.__ffPlay||0,d:s.dist,ws:s.ws,wa:s.wa}; })()`);
    let px=await page.evaluate(`(()=>{ try{ return {x:wretch.pos.x,z:wretch.pos.z}; }catch(e){ return null; } })()`);
    for(let i=0;i<30;i++){
      await sleep(1000);
      const cur=await page.evaluate(`(()=>{ const s=__hc.st(); let wx=0,wz=0; try{ wx=wretch.pos.x; wz=wretch.pos.z; }catch(e){}
        return {b:window.__ffBeat||0,p:window.__ffPlay||0,d:s.dist,ws:s.ws,wa:s.wa,wx,wz,ar:(typeof wretch!=='undefined'?+(wretch._advRate||0).toFixed(1):0)}; })()`);
      const moved=px?Math.hypot(cur.wx-px.x,cur.wz-px.z):0; px={x:cur.wx,z:cur.wz};
      windows.push({i,moved:+moved.toFixed(1),d:+(cur.d||0).toFixed(1),st:cur.ws,beats:cur.b-prev.b,plays:cur.p-prev.p,active:cur.wa});
      prev=cur;
    }
    // audible radius per gait (charge 32 / run 42 / walk 12 / sneak 9); use a conservative 11 for "must have played"
    const violations=windows.filter(w=>w.active && w.moved>2.0 && w.d<11 && w.beats>0 && w.plays===0);
    const silentBeats=windows.filter(w=>w.active && w.moved>2.0 && w.beats===0);
    console.log(JSON.stringify({pass:violations.length===0&&silentBeats.length===0, violations, silentBeats:silentBeats.slice(0,6), windows, errors:errors.slice(0,4)},null,1));
    await browser.close();
    process.exit((violations.length||silentBeats.length||errors.length)?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
