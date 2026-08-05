// Frame a frozen deer and photograph its shadow at four settings, because "drawing but invisible" has three candidates: too faint,
// too small, or sunk into the surface.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
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
    const page=await (await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.cmdRun('/spawn deer')`);
    await sleep(1600);
    await page.evaluate(`__hc.freezeAnimals(true)`);
    const A=(await page.evaluate(`__hc.contactShadows()`)).at||[];
    if(!A.length){ console.log('no instances'); return; }
    const a=A[0];
    await page.evaluate(`__hc.tpAt((${a[0]})+4.0, (${a[1]})+2.4, (${a[2]})+4.0)`); await sleep(900);
    let bestYaw=0,bestR=1e9;
    for(let k=0;k<32;k++){ const yaw=k*Math.PI/16; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.55})`); await sleep(55);
      const p=await page.evaluate(`__hc.screenOf(${a[0]}, ${a[1]}, ${a[2]})`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-300); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:-0.55})`); await sleep(400);
    await page.evaluate(`__hc.setTime(0.42)`); await sleep(500); await page.evaluate(`__hc.setTime(0.42)`); await sleep(300);
    const lum=(d,k)=>0.2126*d[k]+0.7152*d[k+1]+0.0722*d[k+2];
    const boxAt=(f,px,py,rad)=>{ const P=decodePNG(fs.readFileSync(f)); let t=0,n=0;
      for(let y=Math.max(0,py-rad);y<Math.min(P.h,py+rad);y++) for(let x=Math.max(0,px-rad);x<Math.min(P.w,px+rad);x++){ t+=lum(P.data,(y*P.w+x)*P.ch); n++; }
      return n?+(t/n).toFixed(2):null; };
    const p0=await page.evaluate(`__hc.screenOf(${a[0]}, ${a[1]}, ${a[2]})`);
    console.log(`  feet project to ${p0&&p0.onScreen?(p0.px|0)+','+(p0.py|0):'OFFSCREEN'}`);
    for(const [tag,js] of [['soft','__hc.csTune({opacity:0.62,lift:0.04,scale:2.2})'],
                           ['opaque','__hc.csTune({opacity:1.0,lift:0.04,scale:2.2})'],
                           ['huge','__hc.csTune({opacity:1.0,lift:0.10,scale:6.0})']]){
      await page.evaluate(js); await sleep(450);
      const on=path.join(OUT,`cst-${tag}-on.png`); await page.screenshot({path:on});
      await page.evaluate(`__hc.contactShadows({on:false})`); await sleep(400);
      const off=path.join(OUT,`cst-${tag}-off.png`); await page.screenshot({path:off});
      await page.evaluate(`__hc.contactShadows({on:true})`); await sleep(250);
      if(p0&&p0.onScreen){ for(const r of [12,30,60]) console.log(`  ${tag} r${r}: off ${boxAt(off,p0.px|0,p0.py|0,r)} -> on ${boxAt(on,p0.px|0,p0.py|0,r)}`); }
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
