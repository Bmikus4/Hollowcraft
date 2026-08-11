// HOW LONG A SHADOW IS AT EACH HOUR, and what it costs in self-shadow acne to get there.
//
// The key light's elevation was floored at 0.45 of its distance, so it never raked below about 27 degrees and every
// shadow in the game was short and steep whatever the sky was doing. This sweeps the floor at four times of day and
// measures both halves of the trade at once:
//   shadowShare   share of the OPEN GROUND crop that is in shadow. A longer shadow covers more of it. This is the buy.
//   striping      mean |row(y) - row(y+1)| of the crop's row means, on the SUNLIT part only. Acne is a high-frequency
//                 alternation across a surface that should be flat, so it shows up here and a real shadow edge does not
//                 (one edge across a 300-row crop is one term in 300).
// A LIT WALL WOULD BE A BETTER ACNE TARGET than open ground, and open ground is used anyway: the beach at spawn is flat,
// large, unoccluded and reachable from the harness without building anything, and acne on a near-grazing flat surface is
// the exact case the floor was protecting.
//
//   node bench/tmp-sunarc.mjs
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
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  const v=[]; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) v.push(L(x,y));
  const s=[...v].sort((a,b)=>a-b);
  const q=f=>s[Math.min(s.length-1,(s.length*f)|0)];
  // The sunlit/shadow split is taken from the crop's own distribution rather than a constant, because the whole point of
  // the sweep is that the absolute levels move with the hour.
  const cut=(q(0.10)+q(0.90))*0.5;
  let shaded=0; for(const l of v) if(l<cut) shaded++;
  // Row means over the SUNLIT rows only.
  const rows=[]; for(let y=y0;y<y1;y++){ let s2=0,n=0; for(let x=x0;x<x1;x++){ const l=L(x,y); if(l>=cut){ s2+=l; n++; } } rows.push(n?s2/n:null); }
  let d=0,dn=0; for(let i=1;i<rows.length;i++){ if(rows[i]==null||rows[i-1]==null) continue; d+=Math.abs(rows[i]-rows[i-1]); dn++; }
  return { med:+q(0.5).toFixed(1), shadowShare:+(100*shaded/v.length).toFixed(1), striping:+(dn?d/dn:0).toFixed(3) };
}
const CROP=[0.20,0.80,0.55,0.92];   // the ground in front of the camera, below the horizon and clear of the hotbar
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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const gy=await page.evaluate(`__hc.groundY(${SX},${SZ})`);
    await page.evaluate(`__hc.tpAt(${SX}+0.5, ${gy}+9, ${SZ}+16.5); __hc.cam({yaw:${Math.PI}, pitch:-0.45})`);
    for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    for(const t of [0.44, 0.46, 0.48, 0.50]){
      console.log(`  --- time ${t}`);
      for(const fl of [0.45, 0.30, 0.22, 0.16, 0.10]){
        await page.evaluate(`__hc.sunArc({floor:${fl}})`);
        await page.evaluate(`__hc.setTime(${t})`); await sleep(600); await page.evaluate(`__hc.setTime(${t})`); await sleep(400);
        const a=await page.evaluate(`__hc.sunArc({})`);
        const f=path.join(OUT,`sunarc-${t}-${fl}.png`); await page.screenshot({path:f}); const r=stat(f,CROP);
        console.log(`    floor ${String(fl).padEnd(5)} key ${String(a.elevDeg).padStart(6)}deg (sun ${String(a.sunElevDeg).padStart(6)}) nb ${String(a.normalBias).padEnd(6)} med ${String(r.med).padEnd(6)} shadow ${String(r.shadowShare).padEnd(6)}% striping ${r.striping}`);
      }
    }
    await page.evaluate(`__hc.sunArc({floor:0.16})`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
