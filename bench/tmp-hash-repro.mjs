// REPRODUCE BEN'S "BLACK VOXELING / TEXTURE PIXELING" (plan §3, backlog "Voxel hash lighting").
//
// assert-night-crush.mjs measured the ground THREE BLOCKS FROM A LANTERN and found 0% crushed black, so §3 stands
// unreproduced. That crop is fully lit: it is the wrong place to look. The toe argument predicts the artefact at the
// EDGE of the light's puddle, where the per-texel value jitter baked by paintTile straddles the crush point — inside
// the puddle every texel survives, outside it none do, and only in the band between can half of them land on zero.
//
// So this walks OUT from a lantern in strips and reports, per strip: pure-black share, isolated-black share (a black
// texel with a much brighter neighbour — no real surface is lit and unlit one texel apart), and the strip's median so
// the black count is read against how lit that ground actually is. Vertical faces too (Ben photographed TRUNKS), and
// a ?dbg=bl pass at the same vantage, because if _bl itself is stepped the artefact is the light volume rather than
// the grade and the fix is a different one.
//
//   node bench/tmp-hash-repro.mjs
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
function stat(file, crop){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  let n=0, black=0, iso=0, dark=0; const v=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const l=L(x,y); n++; v.push(l);
    if(l<=1){ black++; let hi=0;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; const q=L(xx,yy); if(q>hi)hi=q; }
      if(hi>18) iso++; }
    if(l<=4) dark++; }
  v.sort((a,b)=>a-b);
  return { blackPct:+(100*black/n).toFixed(3), isoPct:+(100*iso/n).toFixed(3), darkPct:+(100*dark/n).toFixed(2),
           median:+v[n>>1].toFixed(1), p10:+v[(n*0.10)|0].toFixed(1), p90:+v[(n*0.90)|0].toFixed(1), n };
}
// CLASSIFY BY ALBEDO, MEASURE IN THE GRADED FRAMES. The night blotches are the same pixels as the day's brown dirt
// patches, so hand-picked crops cannot say whether the grade moved them: pick the pixel SET from ?albedo (flat texture,
// no lighting) and read that same set out of the day and night frames. Saturation is (max-min)/max, i.e. how far the
// colour is from grey — the thing that makes a dark patch read as RED rather than as dark ground.
function classify(albedoFile){
  const P=decodePNG(fs.readFileSync(albedoFile));
  const dirt=[], grass=[];
  const x0=(P.w*0.10)|0,x1=(P.w*0.80)|0,y0=(P.h*0.45)|0,y1=(P.h*0.85)|0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    if(r>60&&r<150&&g<r*0.75&&g>b*1.15) dirt.push([x,y]);          // brown: red-dominant, blue lowest
    else if(g>60&&g>r*1.25&&g>b*1.4) grass.push([x,y]); }
  return {dirt,grass,w:P.w,h:P.h,ch:P.ch};
}
function readSet(file, pts, ch){
  const P=decodePNG(fs.readFileSync(file));
  let R=0,G=0,B=0,S=0,n=0;
  for(const [x,y] of pts){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b); R+=r;G+=g;B+=b; S+= mx>0?(mx-mn)/mx:0; n++; }
  return { rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)], sat:+(S/n).toFixed(3),
           lum:+(0.2126*R/n+0.7152*G/n+0.0722*B/n).toFixed(1), n };
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
    const run=async(qs,tag,t=0.94)=>{
      const page=await ctx.newPage();
      page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
      await page.goto(base+'/index.html?debug=1&rd=8'+qs,{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
      await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
      const S=await page.evaluate(`__hc.st()`);
      const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
      // Stand BACK from the lamp and look along the ground, so one frame holds the puddle, its edge and the dark beyond.
      await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+2.6}, ${S.sz}+10.5)`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(1600);
      // Lantern on the ground ahead, plus a stone pillar beside it: a VERTICAL lit face in the same frame as the ground.
      await page.evaluate(`__hc.setBlock(${S.sx},${gy+1},${S.sz},'lantern')`);
      for(let k=1;k<=4;k++) await page.evaluate(`__hc.setBlock(${S.sx}+3,${gy+k},${S.sz}+2,'stone')`);
      await sleep(1200);
      await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:-0.30})`);   // look back down -z toward the lamp
      await page.evaluate(`__hc.setTime(${t})`); await sleep(700); await page.evaluate(`__hc.setTime(${t})`); await sleep(250);
      const f=path.join(OUT,'hash-'+tag+'.png'); await page.screenshot({path:f});
      await page.close();
      return f;
    };
    const nf=await run('','night');
    // Strips from the frame's bottom (ground at the camera's feet, dark) up toward the horizon, crossing the puddle edge.
    const STRIPS=[['y .52-.60',[0.20,0.80,0.52,0.60]],['y .60-.68',[0.20,0.80,0.60,0.68]],['y .68-.76',[0.20,0.80,0.68,0.76]],
                  ['y .76-.84',[0.20,0.80,0.76,0.84]],['y .84-.92',[0.20,0.80,0.84,0.92]],
                  ['pillar L',[0.55,0.72,0.42,0.60]],['left of lamp',[0.10,0.35,0.60,0.80]]];
    console.log('  NIGHT, lantern ahead on flat ground (t=0.94):');
    for(const [n,c] of STRIPS){ const s=stat(nf,c); console.log(`   ${n.padEnd(14)} black ${String(s.blackPct).padStart(6)}%  iso ${String(s.isoPct).padStart(6)}%  <=4 ${String(s.darkPct).padStart(6)}%  median ${String(s.median).padStart(6)}  p10 ${String(s.p10).padStart(5)}  p90 ${s.p90}`); }
    await run('','day',0.42);
    await run('&albedo=1','albedo',0.42);
    const C=classify(path.join(OUT,'hash-albedo.png'));
    console.log(`  classified from ?albedo: ${C.dirt.length} dirt px, ${C.grass.length} grass px`);
    for(const [tag,file] of [['albedo','hash-albedo.png'],['day','hash-day.png'],['night','hash-night.png']]){
      const d=readSet(path.join(OUT,file),C.dirt), g=readSet(path.join(OUT,file),C.grass);
      console.log(`   ${tag.padEnd(7)} dirt rgb ${JSON.stringify(d.rgb).padEnd(22)} sat ${d.sat} lum ${d.lum}   |   grass rgb ${JSON.stringify(g.rgb).padEnd(22)} sat ${g.sat} lum ${g.lum}`);
    }
    const bf=await run('&dbg=bl','bl');
    console.log('  ?dbg=bl at the same vantage (raw sampled block light, no grade):');
    for(const [n,c] of STRIPS){ const s=stat(bf,c); console.log(`   ${n.padEnd(14)} median ${String(s.median).padStart(6)}  p10 ${String(s.p10).padStart(5)}  p90 ${s.p90}`); }
    console.log('  frames: bench/results/hash-night.png, bench/results/hash-bl.png');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
