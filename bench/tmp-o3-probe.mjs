// DOES THE SEA DRAW, AND DOES THE PROGRAM LINK. Ben 08-12, live: "now water is completely gone and sky is gone".
// A frame over open ocean plus every console line the page emits — a shader that fails to compile says so there and
// nowhere else, and a JS throw inside updateOcean3 aborts updateSky with it, which is what takes the sky.
//
//   node bench/tmp-o3-probe.mjs
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
    const logs=[];
    page.on('console',m=>{ const t=m.text(); if(/error|Error|ERROR|WARN|invalid|fail/.test(t)) logs.push(t.slice(0,400)); });
    page.on('pageerror',e=>logs.push('PAGEERROR: '+String(e.message||e).slice(0,400)));
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.isleStats()`), SEA=await page.evaluate(`__hc.island().sea`);
    console.log('  ocean3', JSON.stringify(await page.evaluate(`__hc.ocean3()`)), 'err', JSON.stringify(await page.evaluate(`__hc.ocean3Err&&__hc.ocean3Err()`)));
    // Out over open water, looking back at the coast so both the sea and the shoreline are in one frame.
    const x=IC.x-IC.R-70, z=IC.z;
    await page.evaluate(`__hc.tpAt(${x}, ${SEA}+18, ${z}); __hc.cam({yaw:${Math.atan2(-1,-0)}, pitch:-0.18})`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    for(const [when,t] of [['noon',0.25],['night',0.75]]){
      await page.evaluate(`__hc.freezeT(0); __hc.setTime(${t})`); await sleep(900); await page.evaluate(`__hc.setTime(${t})`); await sleep(400);
      const f=path.join(OUT,`o3probe-${when}.png`); await page.screenshot({path:f}); console.log('   ->',path.basename(f));
    }
    console.log('  logs:\n   '+(logs.length?logs.join('\n   '):'(none)'));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
