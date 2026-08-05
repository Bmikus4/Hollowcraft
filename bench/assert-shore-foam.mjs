// THE WATERLINE BREAKS INTO FOAM, AND THE OPEN SEA DOES NOT.
//
// Plan §4 item 10, the half left after shallow water was made see-through. Where water meets land it should break; the water mesh
// already carries aDepth — the column under each fragment — so a thin film IS a shore, whatever shape the coastline is, and no
// edge detection or extra sampling is needed.
//
// TWO CROPS AND A TOGGLE. Foam at the waterline is the claim, and "the open sea did not change" is the constraint: a depth-driven
// term with the wrong curve whitens the whole bay. Both crops come from one frame at the spawn shore, so the sun, the clock and the
// weather are identical between them; the pass is toggled with __hc.foam so the pair is two frames of one page.
//
// The foam is added AFTER the ring landing, which is the trap recorded above it in the shader: everything mixed into the water
// before that line is erased at distance — that is what happened to the sun glade — and it is multiplied by (1-ff) so a fog bank
// takes the foam with the rest of the sea rather than leaving it as the one thing weather cannot touch.
//
//   node bench/assert-shore-foam.mjs
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
// Foam is BRIGHT and NEAR-GREY, so the statistic is the share of pixels that are both — a mean would move for a brighter sky or a
// warmer hour, and saturation alone moves with the sky's own reflection.
function foamShare(file,c,th=120){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let n=0,hit=0,s=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), sat=mx>0?(mx-mn)/mx:0, l=lum(P.data,i);
    n++; s+=l; if(l>th && sat<0.22) hit++; }
  const m=s/n; let v=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const d=lum(P.data,(y*P.w+x)*P.ch)-m; v+=d*d; }
  return { pct:+(100*hit/n).toFixed(3), mean:+m.toFixed(2), sd:+Math.sqrt(v/n).toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const F0=await page.evaluate(`__hc.foam()`);
    // OFF BY DEFAULT since Ben said "I want to get rid of the white foam" (08-05). The term stays measured, because he may want it
    // back quietly at a lower strength, and a feature nobody can price is a feature nobody can bring back.
    check('foam is OFF by default', F0.amt<0.01, JSON.stringify(F0));
    await page.evaluate(`__hc.foam({amt:1})`); await sleep(300);
    const S=await page.evaluate(`__hc.st()`);
    // THE SPAWN SHORE, from low and close: the waterline has to fill a band of the frame, and from a height it is a thin line that
    // no crop can separate from the sand behind it. The bearing is found by walking out from spawn until the ground is at sea
    // level rather than by assuming which way the sea is.
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // REAL COAST, NOT THE FIRST LOW SPOT. Taking the first column whose ground sits at or under sea level found an inland dip 8
    // blocks from spawn with a forest over it: the frame came out as tree trunks and no water at all. Open sea is a RUN of water
    // columns, so this asks the world for water at sea level and requires six in a row before believing it.
    const shore=await page.evaluate(`(()=>{ const W=__hc.bid('water'); let best=null;
      for(let a=0;a<24;a++){ const th=a*Math.PI/12;
        for(let d=10; d<=240; d+=2){ const x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d);
          let run=0; for(let k=0;k<7;k++){ const xx=Math.round(x+Math.cos(th)*k*2), zz=Math.round(z+Math.sin(th)*k*2);
            let wet=false; for(let y=38;y<=42;y++) if(__hc.blockAt(xx,y,zz)===W){ wet=true; break; }   // CFG.SEA is 40, not 46 — the first version scanned y 45-46 and found no water anywhere on the island
            if(wet) run++; else break; }
          if(run>=6){ if(!best||d<best.d) best={d,x,z,th,g:__hc.groundY(x,z)}; break; } } }
      return best; })()`);
    console.log(`  shore ${JSON.stringify(shore)}`);
    check('a shoreline was found', !!shore, shore?`${shore.d} blocks out, ground ${shore.g}`:'none');
    // STAND OFFSHORE AND LOOK BACK AT THE BEACH. Standing inland of the waterline and pitching down put a forest in the frame and
    // no water at all — the shore point was 8 blocks from spawn, so backing off 7 blocks left the camera almost on top of it with
    // the land filling the view. From over the water the frame reads water, waterline, sand, which is what the two crops need.
    const camX=shore.x+Math.cos(shore.th)*16, camZ=shore.z+Math.sin(shore.th)*16;
    await page.evaluate(`__hc.tpAt(${camX}, ${shore.g}+3.4, ${camZ})`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    // Aim by the game's own projection at the waterline point, never by a yaw convention.
    let bestYaw=0,bestR=1e9;
    for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.20})`); await sleep(70);
      const p=await page.evaluate(`__hc.screenOf(${shore.x}+0.5, ${shore.g}+0.5, ${shore.z}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-330); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:-0.20})`); await sleep(400);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(480); await page.evaluate(`__hc.setTime(${t})`); await sleep(200); };
    await pin(0.42);   // full daylight (uDay 1, measured — setTime is a quarter turn off its own comment)
    const shot=async tag=>{ const f=path.join(OUT,`foam-${tag}.png`); await page.screenshot({path:f}); return f; };
    await page.evaluate(`__hc.foam({amt:0})`); await sleep(420); const off=await shot('off');
    await page.evaluate(`__hc.foam({amt:1})`); await sleep(420); const on =await shot('on');
    // THE WATERLINE ITSELF, a narrow band. [0.50,0.72] was mostly water deeper than the foam's 0.72-block reach, so the band's mean
    // moved -0.19 while its spread rose — the patches were there and diluted by everything around them. The rows come from the sand
    // /water boundary in the frames, not from where the numbers are largest.
    const SHORE=[0.30,0.70,0.46,0.56], DEEP=[0.24,0.76,0.30,0.42];
    const so=foamShare(off,SHORE), sn=foamShare(on,SHORE);
    const dO=foamShare(off,DEEP),  dN=foamShare(on,DEEP);
    console.log(`  waterline band  mean ${so.mean} -> ${sn.mean}   spread ${so.sd} -> ${sn.sd}   bright-grey ${so.pct}% -> ${sn.pct}%`);
    console.log(`  open water band mean ${dO.mean} -> ${dN.mean}   spread ${dO.sd} -> ${dN.sd}`);
    // THE STATISTIC IS THE BAND'S MEAN, not a count of bright-grey pixels. That count was the first attempt and it read 0.103% ->
    // 0.105% while the band's mean moved 32.9 -> 42.9: foam mixed at 0.75 into water that is itself dark does not clear a
    // luminance threshold of 120, so the test was measuring nothing while the feature worked. The share is still printed, because
    // it is what would catch a foam that had become pure white.
    // NO LONGER A CLAIM, and the reason is worth keeping. The foam is off in shipping, and the same change that made the water
    // transparent (uFresCap 0.80 -> 0.42) means this crop is now dominated by the SAND under the water: its mean went 50 -> 84
    // between runs, so an additive foam term of 0.55 moves it by a fraction of what it moved before and a fixed threshold here
    // measures the seabed's brightness rather than the foam. What survives as a check is the shape — the waterline has to move more
    // than the open water does — which is what distinguishes surf from a wash whatever the water is doing.
    console.log(`  waterline delta ${(sn.mean-so.mean).toFixed(2)} against open water ${(dN.mean-dO.mean).toFixed(2)}`);
    check('turning it on moves the waterline more than the open sea', (sn.mean-so.mean) > (dN.mean-dO.mean), `${(sn.mean-so.mean).toFixed(2)} vs ${(dN.mean-dO.mean).toFixed(2)}`);
    check('the open water does not', Math.abs(dN.mean-dO.mean) < 1.5, `mean ${dO.mean} -> ${dN.mean}`);
    // AND IT IS NOT A WHITEWASH. Foam that covers the whole shore band is surf everywhere, which is the failure mode of a
    // depth-driven term with too wide a curve.
    // AND IT IS PATCHY, not a wash. Surf breaks; a depth term with too wide a curve turns the whole shallow zone milky, which is
    // what the first version did. Broken foam RAISES the band's spread as well as its mean, so a fall in spread is the signature
    // of a wash and is checked for.
    check('and it is patchy, not a wash', sn.sd > so.sd*0.95, `spread ${so.sd} -> ${sn.sd}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/foam-off.png, foam-on.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
