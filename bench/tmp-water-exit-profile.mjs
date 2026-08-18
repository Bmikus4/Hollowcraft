// WHAT IS ACTUALLY BURNING THE 1.1 SECONDS WHEN YOU WALK OUT OF THE SEA.
//
// The stall is real and reproducible (bench/tmp-water-exit-freeze.mjs: worst rAF gap ~1150ms on the FIRST exit,
// ~50ms on every later one in the same page) and it survives ?ocean3=0 and ?pines=0, so guessing at layers has
// already failed twice. This records a V8 CPU profile across the transition and prints the heaviest functions by
// SELF time, which names the culprit instead of eliminating suspects one at a time.
//
//   node bench/tmp-water-exit-profile.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[];
    page.on('pageerror',e=>errs.push('THROW: '+String(e.message||e).slice(0,400)));
    page.on('console',m=>{ const t=m.text(); if(/exception|error|shader|VALIDATE|undeclared/i.test(t)) errs.push('CONSOLE: '+t.slice(0,400)); });
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.freezeAnimals(true); __hc.setTime(0.25); __hc.hzRuler(0);`);

    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    const spot=await page.evaluate(`(()=>{ for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){
        const x=Math.round(${IC.x}-d), z=${IC.z};
        if(__hc.groundY(x,z)>${SEA}) return {shoreX:x, z, g:__hc.groundY(x,z)}; } return null; })()`);
    // Into the sea, facing the shore. The profile must START before the transition, so the chunks around the
    // landing are already meshed by the time W goes down and only the crossing itself is in the recording.
    await page.evaluate(`__hc.tpAt(${spot.shoreX}-14+0.5, ${SEA}+0.5, ${spot.z}+0.5); __hc.cam({yaw:-1.5708,pitch:0});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(3000);

    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval',{interval:200});   // 0.2ms: a 1.1s stall is 5500 samples
    await cdp.send('Profiler.start');
    await page.evaluate(`__hc.key('KeyW',true)`);
    await sleep(9000);
    await page.evaluate(`__hc.key('KeyW',false)`);
    const { profile }=await cdp.send('Profiler.stop');

    // Self time per function, from the sample counts and the real deltas between samples.
    const byId=new Map(); for(const n of profile.nodes) byId.set(n.id,n);
    const self=new Map();
    const deltas=profile.timeDeltas||[]; const samples=profile.samples||[];
    for(let i=0;i<samples.length;i++){
      const n=byId.get(samples[i]); if(!n) continue;
      const cf=n.callFrame;
      const key=(cf.functionName||'(anonymous)')+'  '+String(cf.url||'').split('/').pop()+':'+(cf.lineNumber+1);
      self.set(key,(self.get(key)||0)+(deltas[i]||0));
    }
    const rows=[...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,18);
    const total=[...self.values()].reduce((a,b)=>a+b,0);
    console.log(`profiled ${(total/1000).toFixed(0)}ms of wall clock, ${samples.length} samples`);
    console.log('  selfMs   share  function');
    for(const [k,v] of rows) console.log(`  ${(v/1000).toFixed(1).padStart(7)} ${((v/total*100).toFixed(1)+'%').padStart(6)}  ${k}`);
    fs.writeFileSync(path.join(OUT,'wexit-profile.cpuprofile'), JSON.stringify(profile));
    console.log('full profile -> bench/results/wexit-profile.cpuprofile (loadable in DevTools)');
    if(errs.length){ console.log('errors:'); errs.slice(0,5).forEach(e=>console.log('  '+e)); }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
