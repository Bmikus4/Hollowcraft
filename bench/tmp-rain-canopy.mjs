// DOES RAIN STOP AT A CANOPY? Ben: "rain should not pass through any blocks, including leaves." A screenshot of rain in
// a wood cannot answer that — the streaks are thin, the canopy is dark and the eye fills in what it expects — so this
// counts instead: __hc.rainRoof() reports how many of the 440 streaks were suppressed by something overhead.
//
// Three places, and the shape of the answer matters more than any single number: open ground with nothing above should
// suppress almost nothing, under a full canopy should suppress most of it, and inside the dungeon should suppress all
// of it. A build where all three read the same is a build where the test is not being applied.
//
//   node bench/tmp-rain-canopy.mjs [page]
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
    await page.goto(base+'/'+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.dayLock(0.25);`);
    // Rain has to actually be falling, and it ramps over about eight seconds.
    await page.evaluate(`__hc.rain(1)`);
    const IC=await page.evaluate(`__hc.isleStats()`), SEA=await page.evaluate(`__hc.island().sea`);
    const at=async(tag,x,y,z)=>{
      await page.evaluate(`__hc.tpAt(${x}, ${y}, ${z})`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2500);
      const r=await page.evaluate(`__hc.rainRoof()`);
      console.log(`    ${tag}   roofed ${r.roofed}/${r.total} (${r.roofedPct}%)  drawn ${r.drawn}  raining ${r.raining}`);
      await page.screenshot({path:path.join(ROOT,'bench','results','rain-'+tag.replace(/[^a-z0-9]+/gi,'-')+'.png')});
      return r;
    };
    // Open water off the coast: nothing overhead at all, so nothing may be suppressed.
    const open=await at('open sea', IC.x-IC.R-60, SEA+6, IC.z);
    // Under a full canopy: a wooded shoulder, standing ON the forest floor rather than above it.
    const fx=IC.x-Math.round(IC.R*0.35), fz=IC.z+Math.round(IC.R*0.20);
    const fg=await page.evaluate(`__hc.groundY(${fx},${fz})`);
    const wood=await at('under canopy', fx, fg+2, fz);
    // The dungeon: solid stone overhead, the strongest case there is.
    const dun=await page.evaluate(`(()=>{ try{ const d=__hc.dungeon(); return d&&d.pos?d.pos:null; }catch(e){ return null; } })()`);
    const cave=dun? await at('dungeon', dun.x, dun.y, dun.z) : null;
    console.log('');
    if(open.roofedPct>15) console.log('  <== FAIL: open sea suppressed rain, so the probe is finding roofs that are not there');
    if(wood.roofedPct<50) console.log('  <== FAIL: a full canopy suppressed under half the streaks - rain is still coming through the leaves');
    // THE DUNGEON IS NOT A ROOF TEST AND THIS ASSERT USED TO CLAIM IT WAS. Deep underground the whole rain block is
    // skipped by the 'under' gate (player.y below surfaceH-3), so the loop never runs, _rainRoofed stays 0 and the
    // drawn count is stale from wherever the camera was before. Underground rain was already handled above my change;
    // an assert that goes red for the wrong reason is worse than no assert.
    if(cave && cave.drawn>0 && cave.roofed>0) console.log('  <== unexpected: the dungeon ran the roof test at all');
    if(open.roofedPct<=15 && wood.roofedPct>=50) console.log('  open sky suppresses nothing and a canopy suppresses most - the probe is doing its job');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
