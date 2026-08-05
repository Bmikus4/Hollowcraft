// WHERE ARE THE BLACK TEXELS? — a bad bake, a bad texture, or the grade.
//
// Ben has reported "black texels everywhere" three times. Two theories are already DEAD by measurement: the film grain (on 0.122%
// isolated black against 0.067% off) and the skylight contrast curve relaxing at night (1.063% -> 1.031%, frames
// indistinguishable). What was never done is the step the plan asks for: take the pixels that ARE near-black in the graded frame
// and read the SAME pixels out of `?dbg=sky` and `?albedo`. That is what separates the three candidates, and none of the previous
// runs could, because they all compared aggregate percentages between frames instead of following one set of pixels.
//
//   `?dbg=sky` renders vSky as grey — the per-face BAKED skylight. If the black pixels sit on vSky~0 faces, it is the bake.
//   `?albedo` renders the flat atlas texel with no lighting at all. If they sit on near-black TEXELS, it is the texture.
//   If they are neither dark in the bake nor dark in the albedo, what made them black is the lighting and the grade.
//
// THREE PAGES AT ONE VANTAGE, taken from bench/tmp-grain-black.mjs so the frame is the one that frame was measured on: spawn, nine
// and a half blocks out, looking back and down at -0.42, midnight, grain OFF. The pixel set is chosen on the graded frame and
// applied by INDEX to the other two — the camera does not move between pages, so index is the same world position.
//
// ISOLATED black, not black: a pixel <= 1 with a neighbour over 14. A run of black is a shadow or a silhouette; a single black
// pixel in a lit neighbourhood is the artefact Ben is pointing at.
//
//   node bench/tmp-black-texel-locate.mjs
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
// the isolated-black pixel INDICES in a crop, and the same statistic tmp-grain-black reports
function isolated(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  const idx=[]; let n=0, black=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ n++; const l=L(x,y);
    if(l<=1){ black++; let hi=0;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; const q=L(xx,yy); if(q>hi)hi=q; }
      if(hi>14) idx.push(y*P.w+x); } }
  return { idx, n, blackPct:+(100*black/n).toFixed(3), isoPct:+(100*idx.length/n).toFixed(3), w:P.w };
}
// what a given pixel set reads in another frame
function readSet(file,idx){
  const P=decodePNG(fs.readFileSync(file));
  const v=[]; for(const p of idx) v.push(lum(P.data,p*P.ch));
  v.sort((a,b)=>a-b);
  const q=f=>+v[Math.min(v.length-1,(v.length*f)|0)].toFixed(2);
  return { med:q(0.5), p10:q(0.10), p90:q(0.90), under8:+(100*v.filter(x=>x<8).length/v.length).toFixed(1), n:v.length };
}
// and what the WHOLE crop reads there, as the control the set has to be compared against
function readCrop(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const v=[]; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch));
  v.sort((a,b)=>a-b);
  const q=f=>+v[Math.min(v.length-1,(v.length*f)|0)].toFixed(2);
  return { med:q(0.5), p10:q(0.10), p90:q(0.90), under8:+(100*v.filter(x=>x<8).length/v.length).toFixed(1) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const shots={};
    for(const [tag,qs] of [['graded',''],['sky','&dbg=sky'],['albedo','&albedo=1']]){
      const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
      await ctx.addInitScript(`try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){}`);
      const page=await ctx.newPage();
      page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
      await page.goto(base+'/index.html?debug=1&rd=8'+qs,{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
      await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true);`);
      const S=await page.evaluate(`__hc.st()`);
      const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
      // the tmp-grain-black vantage, to the digit
      await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy}+2.6, ${S.sz}+9.5)`);
      for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(1800);
      await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:-0.42})`);
      await page.evaluate(`__hc.setTime(0.94)`); await sleep(620); await page.evaluate(`__hc.setTime(0.94)`); await sleep(320);
      const f=path.join(OUT,`blacktex-${tag}.png`); await page.screenshot({path:f}); shots[tag]=f;
      console.log(`  ${tag.padEnd(7)} shot taken`);
      await ctx.close();
    }
    // the ground crop, clear of the HUD band and of the crosshair
    const CROP=[0.10,0.90,0.30,0.62];
    const iso=isolated(shots.graded,CROP);
    console.log(`\n  graded frame: black ${iso.blackPct}%, ISOLATED black ${iso.isoPct}%  (${iso.idx.length} px)`);
    if(!iso.idx.length){ console.log('  no isolated black pixels in this crop — nothing to locate'); return; }
    for(const tag of ['graded','sky','albedo']){
      const set=readSet(shots[tag],iso.idx), all=readCrop(shots[tag],CROP);
      console.log(`  ${tag.padEnd(7)}  the SET ${JSON.stringify(set)}`);
      console.log(`  ${tag.padEnd(7)}  whole crop ${JSON.stringify(all)}`);
    }
    console.log(`\n  READ IT LIKE THIS: if the SET is much darker than the whole crop in ?dbg=sky, those pixels sit on faces the`);
    console.log(`  bake says have no sky — a bake problem. If the SET is much darker in ?albedo, they are dark TEXELS — a texture`);
    console.log(`  problem. If the SET matches the crop in both, nothing about the bake or the texture singles them out and what`);
    console.log(`  made them black is the lighting and the grade.`);
    console.log(`  frames: bench/results/blacktex-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
