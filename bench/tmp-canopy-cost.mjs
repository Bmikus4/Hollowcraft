// WHAT THE CANOPY BAKE COSTS THE MESHER, priced before it is added to the standing debt rather than after.
//
// The term has two costs and they are paid in different places. The SHADER cost is one pow per fragment and one more
// float per vertex, and it rides the frame time. The MESHER cost is the whole of the rest: a 48-block canopy scan per
// padded column on every chunk snapshot, and four column reads per vertex to sample it. Only the second is new work of
// any size, so this measures that one directly — `streamUnits` already reports mean and worst milliseconds per meshed
// chunk, so the A/B is `__hc.canopy({bake:false})`, walk a fixed route to force streaming, read it back.
//
// SAME ROUTE BOTH WAYS, AND THE OFF PASS RUNS FIRST AND LAST, because chunk mesh time depends on what the chunks hold
// and a route that wanders into a different biome would be measuring the terrain, not the term.
//
//   node bench/tmp-canopy-cost.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone();`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const gy=await page.evaluate(`__hc.groundY(${SX},${SZ})`);
    // A LEG IS A TELEPORT, not a walk: the point is to force fresh chunks through the mesher, and 140 blocks at a jump
    // does that in one frame instead of in twenty seconds of held W.
    const LEGS=[[0,0],[140,0],[140,140],[0,140],[-140,140],[-140,0],[-140,-140],[0,-140],[140,-140],[0,0]];
    const pass=async(bake)=>{
      await page.evaluate(`__hc.canopy({bake:${bake}})`);
      await page.evaluate(`__hc.tpAt(${SX}.5, ${gy}+40, ${SZ}.5)`); await sleep(2500);
      await page.evaluate(`__hcPERF.streamUnits(true)`);
      for(const [dx,dz] of LEGS){
        await page.evaluate(`__hc.tpAt(${SX}+${dx}+0.5, ${gy}+40, ${SZ}+${dz}+0.5)`);
        for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(300); }
        await sleep(400);
      }
      return await page.evaluate(`__hcPERF.streamUnits(false)`);
    };
    for(const bake of [false, true, false, true]){
      const r=await pass(bake);
      console.log(`  bake ${String(bake).padEnd(5)} chunks ${String(r.mesh).padEnd(5)} meshAvg ${String(r.meshAvgMs).padEnd(7)} meshMax ${String(r.meshMaxMs).padEnd(8)} worstFrame ${r.worstFrameMs} (${r.worstFrameSplit})`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
