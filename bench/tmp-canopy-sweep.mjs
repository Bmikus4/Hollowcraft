// WHAT A CANOPY IS WORTH — the instrument for picking globalU.uCanopy, at the two vantages that can disagree.
//
// Ben 08-10: "there needs to be real daytime darkness ... intensely covered forested areas should still be dark during
// the day". The term is per-leaf transmittance `t` with a `floor`, and the two ends of it fail differently: too little
// and a wood at noon is the flat lit green it has always been, too much and the wood is a black hole with no form and
// the isolated-black share (the artefact Ben named) goes with it.
//
// Reads the SAME crops and the SAME statistics as assert-daylight-black, so a row here is directly comparable to that
// guard's ceilings: isoBlack <= 0.05% is the hard one, pureBlack is a shadow and is allowed to rise.
//
//   node bench/tmp-canopy-sweep.mjs
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
  const v=[]; let pure=0, iso=0, n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const l=L(x,y); v.push(l); n++;
    if(l<=1){ pure++;
      let bright=false;
      for(let dy=-1;dy<=1&&!bright;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; if(L(xx,yy)>14){ bright=true; break; } }
      if(bright) iso++; } }
  v.sort((a,b)=>a-b);
  const q=f=>v[Math.min(v.length-1,(v.length*f)|0)];
  const lo=v.slice(0,(v.length*0.2)|0), hi=v.slice((v.length*0.8)|0);
  const med=a=>a.length?a[a.length>>1]:0;
  return { pureBlack:+(100*pure/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3),
           med:+q(0.5).toFixed(2), p10:+q(0.10).toFixed(2), p90:+q(0.90).toFixed(2),
           sunShade:+(med(hi)/Math.max(0.5,med(lo))).toFixed(2) };
}
// SANDWICHED: the term is measured OFF first and OFF again last. The first row of the previous run was taken before the
// chunks had streamed and read as a fog plate, which would have been recorded as the baseline the whole sweep is judged
// against. Two OFF rows that agree are the proof the rows between them are comparable.
const GRID=[ [1.00,0.00], [0.98,0.60], [0.97,0.55], [0.95,0.45], [0.93,0.40], [0.90,0.35], [1.00,0.00] ];
const CROP=[0.10,0.90,0.16,0.62];
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
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.42)`); await sleep(560); await page.evaluate(`__hc.setTime(0.42)`); await sleep(280); };
    const gy=await page.evaluate(`__hc.groundY(${SX},${SZ})`);
    // A STAND, NOT A TREE, AND NOT AN EDGE. assert-daylight-black maximises cover over ONE column, which finds the
    // densest single crown in range — and the densest crown near spawn is a shoreline tree, so its frame is half beach.
    // Ben's report is about being inside a wood, so the score is the WEAKEST column of a 5x5 (the whole neighbourhood
    // has to be covered, which is what "intensely covered" means) and the camera has to be able to see floor: two clear
    // cells at head height here and in every one of the eight columns around it.
    const spot=await page.evaluate(`(()=>{ let best=null;
      for(let r=16;r<=160;r+=6) for(let a=0;a<24;a++){
        const x=Math.round(${SX}+Math.cos(a*Math.PI/12)*r), z=Math.round(${SZ}+Math.sin(a*Math.PI/12)*r);
        const g=__hc.groundY(x,z); if(g<=0) continue;
        let clear=true;
        for(let dx=-1;dx<=1&&clear;dx++) for(let dz=-1;dz<=1;dz++){
          const gg=__hc.groundY(x+dx,z+dz);
          if(Math.abs(gg-g)>1 || __hc.blockAt(x+dx,gg+1,z+dz)!==0 || __hc.blockAt(x+dx,gg+2,z+dz)!==0){ clear=false; break; } }
        if(!clear) continue;
        let worst=999;
        for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
          const c=__hc.canAt(x+dx,g+1,z+dz); const n=(c&&c.layers)||0; if(n<worst) worst=n; }
        if(!best || worst>best.cover) best={x,z,g,cover:+worst.toFixed(1)}; }
      return best; })()`);
    console.log(`  canopy spot ${spot.x},${spot.z} — ${spot.cover} covered cells overhead`);
    console.log(`  bake says   ${JSON.stringify(await page.evaluate(`__hc.canAt(${spot.x},${spot.g}+1,${spot.z})`))}`);
    const shot=async(tag,v)=>{
      await page.evaluate(`__hc.tpAt(${v[0]},${v[1]},${v[2]}); __hc.cam({yaw:${v[3]}, pitch:${v[4]}})`);
      for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(900); await pin();
      const f=path.join(OUT,`canopy-${tag}.png`); await page.screenshot({path:f}); return stat(f,CROP); };
    // THE THIRD VANTAGE IS THE POINT OF THE EXERCISE. assert-daylight-black's canopy spot is a forest EDGE facing the
    // bay: half that crop is sea, sand and sky, so its median is set by how much beach is between the trunks and not by
    // how dark the wood is. `deep` is the same stand looking the other way, inland, which is the frame Ben is describing.
    const V={ canopy:[spot.x+0.5,spot.g+1.7,spot.z+0.5,Math.PI*0.5,-0.30],
              deep:  [spot.x+0.5,spot.g+1.7,spot.z+0.5,Math.PI*1.5,-0.30],
              open:  [SX+0.5,gy+7,SZ+14.5,Math.PI,-0.40] };
    for(const [t,fl] of GRID){
      await page.evaluate(`__hc.canopy({t:${t},floor:${fl}})`); await sleep(300);
      const c=await page.evaluate(`__hc.canopy({})`);
      const out=[];
      for(const k of ['canopy','deep','open']){ const r=await shot(`${t}-${fl}-${k}`,V[k]);
        out.push(`${k} med ${String(r.med).padEnd(7)} p10 ${String(r.p10).padEnd(6)} p90 ${String(r.p90).padEnd(7)} sun/shade ${String(r.sunShade).padEnd(7)} black ${r.pureBlack}%/${r.isoBlack}%`); }
      console.log(`  t ${String(t).padEnd(5)} floor ${String(fl).padEnd(5)} (1 leaf ${c.at1}, 4 ${c.at4}, 13 ${c.at13})\n     ${out.join('\n     ')}`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
