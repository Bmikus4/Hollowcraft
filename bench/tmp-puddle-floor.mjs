// DID THE CAVE DESCENT COST THE LANTERN PUDDLE ITS COLOUR? — attribution for assert-night-chroma's one failing check.
//
// That harness reads the lantern's own puddle on night grass and requires the washout to leave it alone: Lon.sat >
// Loff.sat*0.80. It now reads 0.872 -> 0.665, a ratio of 0.76. Two candidates on the same day: the cave descent I added to the
// wash, and the other session's meadow-grass tile (e204b0c), which changed the albedo of the exact surface this crop measures.
//
// `__hc.scot({floor:1})` restores the pre-descent formula EXACTLY — the descent is `mix(1, floor, w*(1-vSky))` and floor 1 makes
// it the identity — so this is a clean one-page A/B of my change against itself, on the same frames, with no rebuild and no
// second build to confuse with three other commits' worth of differences. If the puddle's saturation ratio is the same at
// floor 1, the descent is not what moved it.
//
// The crop and the vantage are copied from assert-night-chroma so the numbers are comparable to its own.
//
//   node bench/tmp-puddle-floor.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
function readCrop(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let R=0,G=0,B=0,L=0,S=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    R+=r;G+=g;B+=b;L+=0.2126*r+0.7152*g+0.0722*b; S+=mx>0?(mx-mn)/mx:0; n++; }
  return { sat:+(S/n).toFixed(3), lum:+(L/n).toFixed(2), rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)] };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // the same vantage as assert-night-chroma: stand back 10 blocks from a PLACED lantern and look down at its puddle
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+2.6}, ${S.sz}+10.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1600);
    await page.evaluate(`__hc.setBlock(${S.sx},${gy+1},${S.sz},'lantern')`); await sleep(1000);
    await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:-0.30})`);
    // 0.94, NIGHT — the hour assert-night-chroma reads its night pair at. The first run of this probe pinned 0.42, which is FULL
    // DAYLIGHT, where the wash is gated off entirely: both ratios came back 1.00 and the probe measured nothing.
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.94)`); await sleep(600); await page.evaluate(`__hc.setTime(0.94)`); await sleep(220); };
    const LIT=[0.42,0.60,0.36,0.46];
    // MEDIAN OF FIVE: heldLight.intensity has a 12% sine on real elapsed time, so a single pair is 4 levels of flicker.
    const sample=async tag=>{ const F=[]; for(let i=0;i<5;i++){ const f=path.join(OUT,`puddle-${tag}-${i}.png`); await pin(); await page.screenshot({path:f}); F.push(readCrop(f,LIT)); }
      const p=k=>{ const v=F.map(x=>x[k]).sort((a,b)=>a-b); return v[2]; };
      return { sat:p('sat'), lum:p('lum'), rgb:F[2].rgb }; };
    for(const floor of [1, 0.15]){
      await page.evaluate(`__hc.scot({floor:${floor}, amt:0})`); await sleep(420); const off=await sample(`f${floor}-off`);
      await page.evaluate(`__hc.scot({floor:${floor}, amt:0.85})`); await sleep(420); const on=await sample(`f${floor}-on`);
      console.log(`  floor ${floor}:  wash OFF ${JSON.stringify(off)}   wash ON ${JSON.stringify(on)}   sat ratio ${(on.sat/off.sat).toFixed(3)}`);
    }
    const st=await page.evaluate(`__hc.scot({})`);
    console.log(`  dials ${JSON.stringify(st)}`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
