// THE SPECKLE AT THE EDGE OF A LIGHT POOL. Ben's frame, 2026-08-11 13:47 (Desktop/Screenshot 2026-08-11 134750.png):
// a lantern on the forest floor at night, and the canopy and shrubs around its pool broken into hard black shapes with
// orange fringes — "faces with light projecting on them, they are considered lit, yet they still have black texels on
// them", and "dark shadow groupings appear on textures instead of as a mask on otherwise normal textures".
//
// WHY THE SHIPPED RULE CANNOT REACH IT. f1eeb7c floors the ALBEDO at 0.030 and applies it as a scale. Leaf and grass
// albedo already sits at or above that, so on exactly the surfaces in his screenshot the scale is 1.0 — it is inert.
// What takes those texels to zero is not the albedo, it is the multiplies AFTER it: at the pool's edge the delivered
// light drops under the wash knee, the scotopic descent multiplies the fragment by uScotH.y, and a texture whose dark
// texels are twenty times darker than its bright ones loses the dark ones through the 8-bit floor while the bright
// ones survive. That is the "grouping" — the descent is an even multiply and the texture is not even.
//
// SO THE FAULT IS MEASURED IN RENDERED UNITS, AT THE POOL EDGE, ON FOLIAGE. Not on a flat wall at point-blank range:
// that vantage reads 0% black at every setting of the dial, because a lantern 1.5 blocks away clears the knee outright.
//
//   node bench/tmp-lightpool-speckle.mjs
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
// isoBlack IS Ben's report: a black pixel whose neighbour is lit. A night sky and a shadowed hillside are runs of
// black and score zero here; a crushed texel in a lit pool scores every time. litShare is the guard against buying the
// metric with brightness — it says how much of the crop is actually in the pool, and it must not move.
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  const v=[]; let pure=0, iso=0, n=0, lit=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const l=L(x,y); v.push(l); n++; if(l>18) lit++;
    if(l<=2){ pure++;
      let bright=false;
      for(let dy=-2;dy<=2&&!bright;dy++) for(let dx=-2;dx<=2;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; if(L(xx,yy)>18){ bright=true; break; } }
      if(bright) iso++; } }
  v.sort((a,b)=>a-b);
  const q=f=>+v[Math.min(v.length-1,(v.length*f)|0)].toFixed(1);
  return { med:q(0.5), p10:q(0.10), p90:q(0.90),
           pureBlack:+(100*pure/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3), litShare:+(100*lit/n).toFixed(1) };
}
const CROP=[0.22,0.78,0.20,0.78];
// Rows are "k,disp" pairs — the albedo floor and the rendered-luminance floor, which are in different units and have
// to be swept separately or a move in one is read as a move in the other.
// Rows are k/disp[/extra js] — an extra term is run after the two floors are set, for attribution rows that turn a
// whole term off (the descent, the wash) rather than moving a dial.
const KS=(process.argv[2]||'0.030/0').split(',').map(s=>{ const p=s.split('/'); return [Number(p[0]), Number(p[1]), p.slice(2).join('/')]; });
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    // UNDER REAL CANOPY, with room to stand back: the fault lives in the ring where the pool dies, so the frame needs
    // the lantern, the lit ground, the leaves above it and the dark beyond — all at once.
    const spot=await page.evaluate(`(()=>{ let best=null;
      for(let r=10;r<=110;r+=4) for(let a=0;a<24;a++){
        const x=Math.round(${SX}+Math.cos(a*Math.PI/12)*r), z=Math.round(${SZ}+Math.sin(a*Math.PI/12)*r);
        const g=__hc.groundY(x,z); if(g<=0) continue;
        const cov=(__hc.canAt(x,g+1,z)||{}).layers||0; if(cov<8) continue;
        let clear=true;
        for(let d=1;d<=7&&clear;d++) if(__hc.blockAt(x,g+1,z-d)!==0 || Math.abs(__hc.groundY(x,z-d)-g)>1) clear=false;
        if(!clear) continue;
        if(!best||cov>best.cov) best={x,z,g,cov:+cov.toFixed(1)}; }
      return best; })()`);
    console.log(`  spot ${JSON.stringify(spot)}`);
    if(!spot) throw new Error('no covered clearing found');
    const built=await page.evaluate(`__hc.place2(${spot.x}, ${spot.z}, 'lantern', 0)`);
    console.log(`  lantern ${JSON.stringify(built)}`);
    await sleep(1500);
    // SEVEN BLOCKS BACK, EYE LEVEL. forward is (-sin yaw, -cos yaw) — see lookDir() — so facing +z is yaw = atan2(0,-1).
    const aim=await page.evaluate(`(()=>{ __hc.tpAt(${spot.x}+0.5, ${spot.g}+2.4, ${spot.z}-7.5);
      __hc.cam({yaw:Math.atan2(-0,-1), pitch:0.02}); return __hc.cam({}); })()`);
    console.log(`  aim ${JSON.stringify(aim)}`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2000);
    // 0.75 is midnight (setTime: 0 sunrise, 0.25 noon). Set twice and read back — the cycle runs on between the call
    // and the frame, and uDay 0 is the proof it took.
    // AND THE WIND IS PINNED. The thing being measured IS the canopy, and the canopy sways: with uTime free the same
    // configuration read pure black 13.7% and 13.0% on two runs, which is the order of the effect being looked for.
    // __hc.freezeT pins the shader clock, so every row below is the same leaf in the same place.
    const pin=async()=>{ await page.evaluate(`__hc.freezeT(0); __hc.setTime(0.75)`); await sleep(500); return await page.evaluate(`__hc.setTime(0.75)`); };
    console.log(`  uDay ${await pin()}`);
    for(const [k,disp,extra] of KS){
      // RESTORED TO THE SHIPPED VALUES, EXPLICITLY, and not with `scot({on:1})` — that writes amt 1.0 over the
      // shipped 0.85, which moved this crop's pure black from 12.8% to 28.2% and read as the floor having got worse.
      await page.evaluate(`__hc.scot({amt:0.85, floor:0.02}); __hc.texFloor({k:${k}, disp:${disp}}); ${extra||''}`); await sleep(300); await pin();
      const tag=`k${String(k).replace('.','_')}-d${String(disp).replace('.','_')}`;
      const f=path.join(OUT,`pool-${tag}.png`); await page.screenshot({path:f});
      const r=stat(f,CROP);
      console.log(`    k ${String(k).padEnd(6)} disp ${String(disp).padEnd(8)} med ${String(r.med).padEnd(6)} p10 ${String(r.p10).padEnd(6)} p90 ${String(r.p90).padEnd(6)} pureBlack ${String(r.pureBlack).padEnd(7)}% isoBlack ${String(r.isoBlack).padEnd(7)}% lit ${r.litShare}%`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
