// IS THE HALO DRAWN AT ALL, AND WHERE? Toggle-and-difference inside a box at the lamp's own projected position, with the two
// shots taken back to back — a whole-frame difference is dominated by the sky moving between shots (26,987 pixels changed by >3
// at 200 blocks, the largest of them in the upper sky, none of it the sprite).
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
function boxDiff(fa,fb,px,py,rad=40){
  const A=decodePNG(fs.readFileSync(fa)), B=decodePNG(fs.readFileSync(fb));
  const x0=Math.max(0,(px-rad)|0), x1=Math.min(A.w,(px+rad)|0), y0=Math.max(0,(py-rad)|0), y1=Math.min(A.h,(py+rad)|0);
  let mx=0, at=null, n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*A.w+x)*A.ch;
    const df=Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]);
    if(df>6)n++; if(df>mx){ mx=df; at=[x,y]; } }
  return { mx, at, n };
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const LX=Math.round(S.sx), LY=Number(process.env.HALO_Y||120), LZ=Math.round(S.sz);
    await page.evaluate(`(()=>{ for(let k=0;k<3;k++) __hc.cmdRun('/setblock ${LX} '+(${LY}+k)+' ${LZ} lantern'); })()`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(400); await page.evaluate(`__hc.setTime(${t})`); await sleep(180); };
    for(const dist of [60,120,200,300]){
      await page.evaluate(`__hc.tpAt(${LX}+${dist}, ${LY}+0.5, ${LZ}+0.5)`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(1000);
      let bestYaw=0,bestR=1e9;
      for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:0.10})`); await sleep(80);
        const p=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${LY}+1.5, ${LZ}+0.5)`);
        if(p&&p.onScreen){ const r=Math.abs(p.px-320)+Math.abs(p.py-200); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
      await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:0.10})`); await sleep(300);
      await pin(0.75);
      const p=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${LY}+1.5, ${LZ}+0.5)`);
      await page.evaluate(`__hc.lampHalos({on:false})`); await sleep(400);
      const fa=path.join(OUT,`halo-${dist}-off.png`); await page.screenshot({path:fa});
      await page.evaluate(`__hc.lampHalos({on:true})`); await sleep(400);
      const fb=path.join(OUT,`halo-${dist}-on.png`); await page.screenshot({path:fb});
      const H=await page.evaluate(`__hc.lampHalos()`);
      const D=p&&p.onScreen?boxDiff(fa,fb,p.px,p.py):null;
      console.log(`  ${String(dist).padStart(4)}b  screen ${p&&p.onScreen?p.px.toFixed(0)+','+p.py.toFixed(0):'OFFSCREEN'}  ${JSON.stringify(H)}  boxdiff ${D?JSON.stringify(D):'-'}`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
