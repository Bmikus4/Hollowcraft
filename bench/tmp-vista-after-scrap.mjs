// WHAT THE HORIZON LOOKS LIKE WITH THE BACKDROP GONE. The treeline was there to hide the render wall — the point at
// which streamed chunks stop and there is nothing behind them — so the one question scrapping it raises is whether the
// island now ends on a visible cliff of nothing. A statistic cannot answer that; a frame at a vantage that looks OUT
// can. Four of them: an inland vista looking seaward, the shore, and both at noon and at night.
//
//   node bench/tmp-vista-after-scrap.mjs
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.isleStats()`);
    console.log(`  island ${JSON.stringify(IC)}`);
    // HIGH AND INLAND, LOOKING OUT ACROSS THE ISLAND TO THE SEA — the vantage the backdrop existed for. Then the shore
    // itself. forward is (-sin yaw, -cos yaw), so facing +x is yaw = atan2(-1,0).
    // THE SHORE IS FOUND, NOT GUESSED. A fraction of the MEAN coast radius lands in the water on any bay — the first
    // attempt put the camera on the seabed at y=42 and photographed a submerged beach, which is not a horizon at all.
    // Walk out along -x until the ground drops to sea level, then step back three blocks onto dry land.
    const shore=await page.evaluate(`(()=>{ const cx=${IC.x}, cz=${IC.z};
      for(let d=40; d<${IC.R}*1.4; d+=2){ const x=cx-d, g=__hc.groundY(x,cz);
        if(g>0 && g<=__hc.island().sea+1){ const bx=x+4; return {x:bx, z:cz, g:__hc.groundY(bx,cz)}; } }
      return null; })()`);
    console.log(`  shore ${JSON.stringify(shore)}`);
    const spots=[
      ['vista', IC.x-Math.round(IC.R*0.55), IC.z, 34, Math.atan2(-1,-0), -0.06],
    ];
    if(shore) spots.push(['shore', shore.x, shore.z, 3, Math.atan2(1,-0), -0.02]);
    for(const [name,x,z,dy,yaw,pitch] of spots){
      const g=await page.evaluate(`__hc.groundY(${x},${z})`);
      await page.evaluate(`__hc.tpAt(${x}+0.5, ${g}+${dy}, ${z}+0.5); __hc.cam({yaw:${yaw}, pitch:${pitch}})`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2500);
      for(const [when,t] of [['noon',0.25],['night',0.75]]){
        await page.evaluate(`__hc.freezeT(0); __hc.setTime(${t})`); await sleep(700); await page.evaluate(`__hc.setTime(${t})`); await sleep(400);
        const f=path.join(OUT,`scrap-${name}-${when}.png`); await page.screenshot({path:f});
        console.log(`    ${name} ${when} -> ${path.basename(f)}  ground ${g}`);
      }
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
