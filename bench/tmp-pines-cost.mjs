// WHAT THE COAST MASK COSTS ON THE FRAME IT REBUILDS. It runs 384 azimuths by 3 bands by 6 heightfield samples plus a
// five-tap blur, on the frame the player crosses 24 blocks - so if it is expensive it is a hitch you feel while walking,
// not a number in a profile. Ten forced rebuilds at a walking pace, and the frame times around them.
//
//   node bench/tmp-pines-cost.mjs [page]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const PAGE=process.argv[2]||'index.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
  let browser=null;
  try{
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/'+PAGE+'?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.25);`);
    const IC=await page.evaluate(`__hc.isleStats()`);
    const ms=[];
    for(let i=0;i<10;i++){
      const x=IC.x-Math.round(IC.R*0.5)+i*30, z=IC.z+Math.round(IC.R*0.2);
      const g=await page.evaluate(`__hc.groundY(${x},${z})`);
      await page.evaluate(`__hc.tpAt(${x}+0.5, ${g}+30, ${z}+0.5); __hc.pines(1,{force:true})`);
      await sleep(700);
      const p=await page.evaluate(`__hc.pines()`);
      ms.push(p.buildMs);
      if(i===0) console.log(`  azimuths ${p.n}, wall ${p.wall}`);
    }
    ms.sort((a,b)=>a-b);
    console.log(`  mask rebuild ms over ${ms.length} forced builds: min ${ms[0]}  median ${ms[ms.length>>1]}  max ${ms[ms.length-1]}`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
