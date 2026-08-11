// "THE PROBLEMS ARISE WHEN THERE IS MORE THAN ONE LIGHT SOURCE" (Ben, 2026-08-11).
//
// WHAT THAT WOULD MEAN IN THIS SHADER, and it is a specific, checkable claim. The scotopic pass gates everything it
// does on `_slit`, and `_slit` is a MAX over the light a fragment sees — the baked block-light volume, the sky, and
// the delivered direct light — never a sum. A fragment standing between two lamps, each reaching it at half strength,
// therefore gates as though only the nearer one existed: it can sit under the wash knee, take the descent's 0.02
// multiply and lose its dark texels, while the eye sees two lamps' worth of light on it. The baked volume propagates
// the same way (max of the neighbours, one level per block), which is ordinary voxel lighting and not a bug on its
// own — but combined with a gate that also maxes, the region BETWEEN two lights is exactly where a fragment can look
// lit and gate unlit.
//
// SO THE MEASUREMENT IS ONE LAMP AGAINST TWO, at the same vantage, with the crop on the ground BETWEEN them. If the
// max-gate story is right, the two-lamp frame has more black in the middle band than the one-lamp frame does in the
// same rows, not less.
//
//   node bench/tmp-two-lights.mjs [k/disp,...]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  const v=[]; let pure=0, iso=0, n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const l=L(x,y); v.push(l); n++;
    if(l<=2){ pure++;
      let bright=false;
      for(let dy=-2;dy<=2&&!bright;dy++) for(let dx=-2;dx<=2;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; if(L(xx,yy)>18){ bright=true; break; } }
      if(bright) iso++; } }
  v.sort((a,b)=>a-b);
  const q=f=>+v[Math.min(v.length-1,(v.length*f)|0)].toFixed(1);
  return { med:q(0.5), p10:q(0.10), p90:q(0.90), pureBlack:+(100*pure/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3) };
}
// The crop is the ground BETWEEN the two lamps and nothing else — the whole claim is about that band.
const CROP=[0.34,0.66,0.55,0.80];
const ROWS=(process.argv[2]||'0.030/0.008').split(',').map(s=>s.split('/').map(Number));
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const spot=await page.evaluate(`(()=>{
      for(let r=8;r<=110;r+=3) for(let a=0;a<24;a++){
        const x=Math.round(${SX}+Math.cos(a*Math.PI/12)*r), z=Math.round(${SZ}+Math.sin(a*Math.PI/12)*r);
        const g=__hc.groundY(x,z); if(g<=0) continue;
        let ok=true;
        for(let dx=-7;dx<=7&&ok;dx++) for(let dz=-8;dz<=4;dz++){
          if(Math.abs(__hc.groundY(x+dx,z+dz)-g)>1){ ok=false; break; }
          for(let yy=1;yy<=4;yy++) if(__hc.blockAt(x+dx,g+yy,z+dz)!==0){ ok=false; break; } }
        if(ok) return {x,z,g}; }
      return null; })()`);
    console.log(`  spot ${JSON.stringify(spot)}`);
    if(!spot) throw new Error('no open flat ground found');
    // Eye height, back from the pair, looking along +z at the gap between them. forward is (-sin yaw, -cos yaw).
    await page.evaluate(`__hc.tpAt(${spot.x}+0.5, ${spot.g}+2.4, ${spot.z}-9.5); __hc.cam({yaw:Math.atan2(-0,-1), pitch:-0.10})`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2500);
    const pin=async()=>{ await page.evaluate(`__hc.freezeT(0); __hc.setTime(0.75)`); await sleep(600); return await page.evaluate(`__hc.setTime(0.75)`); };
    console.log(`  uDay ${await pin()}`);
    // Lamps six blocks apart, either side of the crop. Placed one at a time so the SAME vantage answers both cases.
    const SETUPS=[
      ['one lamp',  `__hc.place2(${spot.x}-3, ${spot.z}, 'lantern', 0);`],
      ['two lamps', `__hc.place2(${spot.x}+3, ${spot.z}, 'lantern', 0);`],
    ];
    for(const [label,build] of SETUPS){
      await page.evaluate(build); await sleep(1600);
      for(const [k,disp] of ROWS){
        await page.evaluate(`__hc.scot({amt:0.85, floor:0.02}); __hc.texFloor({k:${k}, disp:${disp}})`); await sleep(300); await pin();
        const f=path.join(OUT,`twolight-${label.replace(/ /g,'_')}-k${String(k).replace('.','_')}-d${String(disp).replace('.','_')}.png`);
        await page.screenshot({path:f});
        const r=stat(f,CROP);
        console.log(`    ${label.padEnd(10)} k ${String(k).padEnd(6)} disp ${String(disp).padEnd(7)} med ${String(r.med).padEnd(6)} p10 ${String(r.p10).padEnd(6)} p90 ${String(r.p90).padEnd(6)} pureBlack ${String(r.pureBlack).padEnd(7)}% isoBlack ${r.isoBlack}%`);
      }
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
