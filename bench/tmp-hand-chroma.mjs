// DOES A CARRIED LANTERN BRING THE COLOUR BACK? Ben, 08-05: most of the world reads grey at night. The scotopic gate gets its light
// level from the BAKED block-light volume, and a torch in your hand is a PointLight that was never baked into it — so the one thing a
// player does to light the world did nothing to the gate. Two frames at midnight, same place: nothing held, then a lantern held.
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
function hue(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let R=0,G=0,B=0,S=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b); R+=r;G+=g;B+=b; S+= mx>0?(mx-mn)/mx:0; n++; }
  return { rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)], sat:+(S/n).toFixed(3), lum:+(0.2126*R/n+0.7152*G/n+0.0722*B/n).toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy}+2.6, ${S.sz}+8.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1600);
    await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:-0.45})`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(240); };
    await pin(0.94);
    const GROUND=[0.30,0.70,0.55,0.80];
    const shot=async tag=>{ const f=path.join(OUT,`handchroma-${tag}.png`); await page.screenshot({path:f}); return f; };
    const empty=hue(await shot('empty'),GROUND);
    // Hand the player a lantern the way the game does, then re-pin the clock (giving an item does not stop the sky moving).
    const gave=await page.evaluate(`(function(){ try{ __hc.cmdRun('/give lantern 1'); return true; }catch(e){ return String(e.message||e); } })()`);
    await sleep(900); await pin(0.94);
    const held=await page.evaluate(`(function(){ var h=__hc.hand?__hc.hand():null; return { gave:${JSON.stringify(gave)}, hand:h }; })()`);
    console.log(`  ${JSON.stringify(held).slice(0,200)}`);
    const lit=hue(await shot('lantern'),GROUND);
    console.log(`  ground with nothing held: rgb ${JSON.stringify(empty.rgb)} sat ${empty.sat} lum ${empty.lum}`);
    console.log(`  ground with a lantern:    rgb ${JSON.stringify(lit.rgb)} sat ${lit.sat} lum ${lit.lum}`);
    console.log('  frames: bench/results/handchroma-empty.png, handchroma-lantern.png');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
