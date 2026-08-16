// WHAT A WORLD FULL OF RIGID BODIES COSTS. The brief's own condition: "nobody has priced a world where every drop
// is a rigid body, so cap the count, state the despawn rule, and price N settled objects on a STILL frame."
//
// ON A STILL FRAME, because the forest site cannot resolve anything — two consecutive censuses of the same walk
// measured 16.25 ms / 388 draws and then 25.875 ms / 620 draws, a 60% swing in the DRAW COUNT, so a sub-millisecond
// cost cannot be seen there at any sample size. pinScene freezes the world and fpsPin holds the quality ladder, so
// the only thing changing between rows is the number of bodies.
//
// THE TWO COSTS ARE DIFFERENT AND ARE MEASURED SEPARATELY:
//   · settled bodies are meshes. They cost draw calls and nothing else — the physics skips anything at rest.
//   · the crosshair pick walks EVERY drop every frame, so it is the one cost that scales with the settled count
//     whether or not anything is moving.
//
//   node bench/tmp-drop-price.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const N=[0,50,120,200];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,140)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.pinScene&&__hc.pinScene(); __hc.fpsPin&&__hc.fpsPin(240);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const gy=await page.evaluate(`__hc.groundY(${SX},${SZ})`);
    await page.evaluate(`__hc.tpAt(${SX+0.5},${gy+3},${SZ+8}); __hc.cam({yaw:${Math.PI}, pitch:-0.25})`);
    await sleep(1500);
    // 400 frames per row, median of the deltas. The median rather than the mean because one GC or one streamed
    // chunk in a 400-frame window moves a mean and cannot move a median.
    const frames=`(()=>new Promise(res=>{ const t=[]; let last=performance.now();
      function f(){ const n=performance.now(); t.push(n-last); last=n;
        if(t.length<400) requestAnimationFrame(f);
        else { t.sort((a,b)=>a-b); res({ med:+t[t.length>>1].toFixed(3), p90:+t[(t.length*0.9)|0].toFixed(3) }); } }
      requestAnimationFrame(f); }))()`;
    console.log('  n      median   p90     drops');
    for(const n of N){
      await page.evaluate(`__hc.dropClear()`);
      if(n){ await page.evaluate(`(()=>{ for(let i=0;i<${n};i++){ const a=i*0.618*6.283;
          __hc.dropSpawn('coal', ${SX}+Math.cos(a)*(2+i*0.03), ${gy}+2.5, ${SZ}+Math.sin(a)*(2+i*0.03)); } })()`);
        await sleep(6000); }
      const r=await page.evaluate(frames);
      const P=await page.evaluate(`(()=>{ const p=__hc.dropPhys(); return { n:p.n, resting:p.drops.filter(d=>d.rest).length }; })()`);
      console.log(`  ${String(n).padStart(3)}    ${String(r.med).padStart(6)}  ${String(r.p90).padStart(6)}   ${P.n} live, ${P.resting} settled`);
    }
  }catch(e){ console.log('  ERROR: '+(e&&e.message||e)); }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})();
