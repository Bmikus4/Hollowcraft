// THE SEA KEEPS ITS DEPTH AT EYE LEVEL, NOT ONLY FROM ABOVE.
//
// Ben 08-04: "look at the ocean during the ceraphim boss battle, it is clear, and shows clear layers when looked at from above,
// we need the water to look like that."
//
// Nothing about the water changes during that fight. Every water uniform, the fog, the ring, the depth dial and the visibility
// of every horizon layer were snapshotted before and after the boss was raised and came back identical — bench/tmp-boss-water.mjs
// prints the diff, and the only things that moved were the frame rate and the creature's own form. What changes is where he is
// LOOKING: the boss is airborne, so he is looking DOWN.
//
// waterMat mixes the whole surface onto skyRefl by Fresnel — 0.02 looking straight down, 1.0 at a grazing angle. From above you
// see the depth colour with the seabed and its layers in it; at eye level you see skyRefl, which is uRing, ONE FLAT COLOUR. That
// would be correct if it were a reflection. It is not, so the sea at eye level was a painted lid by construction.
//
// Three claims:
//   1. Looking DOWN, the water carries spatial structure — this is the look he is pointing at, and it must not have changed.
//   2. At EYE LEVEL the cap gives the depth colour back — REPORTED, not asserted: see the note at that measurement for the three
//      vantages that failed to put depth steps in the near crop.
//   3. The structure is DEPTH, not noise: it survives being measured as the spread of block means over a grid, which ripple
//      detail and tile jitter do not.
//
//   node bench/assert-water-clarity.mjs
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
// LAYERS ARE A LOW-FREQUENCY PATTERN — depth steps tens of pixels across — so they are measured as the spread of BLOCK means
// over a grid, the same statistic the cloud-shadow harness uses. A per-pixel standard deviation would be dominated by the
// ripple normal and the tile jitter and would barely move.
function blockSpread(file, crop, blocks=12){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  const bw=(x1-x0)/blocks, bh=(y1-y0)/blocks, means=[];
  for(let by=0;by<blocks;by++) for(let bx=0;bx<blocks;bx++){
    let s=0,n=0;
    for(let y=(y0+by*bh)|0;y<(y0+(by+1)*bh)|0;y++) for(let x=(x0+bx*bw)|0;x<(x0+(bx+1)*bw)|0;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
    if(n) means.push(s/n); }
  const m=means.reduce((a,b)=>a+b,0)/means.length;
  return { mean:+m.toFixed(2), spread:+Math.sqrt(means.reduce((a,b)=>a+(b-m)*(b-m),0)/means.length).toFixed(3) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    // OVER WATER, found rather than assumed (the spawn is inland — a glade harness measured a working reflection on grass that
    // way). Walk out along bearings until the heightfield is below sea level.
    let wx=S.sx, wz=S.sz, found=false;
    for(let r=80; r<=900 && !found; r+=40) for(let i=0;i<12 && !found;i++){
      const a=i*Math.PI/6, x=Math.round(S.sx+Math.cos(a)*r), z=Math.round(S.sz+Math.sin(a)*r);
      const g=await page.evaluate(`__hc.groundY(${x},${z})`);
      if(g!=null && g<38){ wx=x; wz=z; found=true; } }
    console.log(`  over water at ${wx},${wz}`);
    await page.evaluate(`__hc.tpAt(${wx}+0.5, 54, ${wz}+0.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2200);
    const shot=async name=>{ await page.evaluate(`__hc.setTime(0.22)`); await sleep(380); await page.evaluate(`__hc.setTime(0.22)`); await sleep(200);
      const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };
    const WATER=[0.24,0.76,0.42,0.74];
    // A SEPARATE CROP FOR THE GRAZING TEST, of NEAR water only. At eye level the first version cropped the middle of the frame,
    // which is water hundreds of blocks out — and out there the ring landing forces a flat colour unconditionally, whatever
    // Fresnel says, so the cap could not possibly show and both readings came back 46.48. The bottom of the frame is water
    // within tens of blocks, inside the ring fade, where the Fresnel mix is the thing deciding the colour.
    const NEARW=[0.28,0.72,0.60,0.78];
    let _yaw=0.5;
    const at=async(cap,pitch,tag,crop)=>{ await page.evaluate(`__hc.glade({fresCap:`+cap+`}); __hc.cam({yaw:`+_yaw+`, pitch:`+pitch+`});`); await sleep(400);
      const f=await shot(`clarity-${tag}.png`); const r=blockSpread(f,crop||WATER);
      console.log(`  fresCap ${cap}, pitch ${pitch}:  block spread ${r.spread}  mean ${r.mean}`); return r; };

    // 1. LOOKING DOWN — the look Ben is pointing at. Must be unchanged by the cap, since Fresnel is already ~0 there.
    const downOld=await at(1.0,-1.05,'down-old'), downNew=await at(0.80,-1.05,'down-new');
    check('looking down is unchanged', Math.abs(downNew.spread-downOld.spread) < Math.max(1.5, downOld.spread*0.25),
      `block spread ${downOld.spread} -> ${downNew.spread}; the Fresnel term is near zero at this angle, so the cap must not bite here`);
    check('and looking down really does show structure', downNew.spread > 2.5, `block spread ${downNew.spread} — this is the layered read he asked for`);

    // 2. AT EYE LEVEL, AND OVER A SHELF. Layers are depth STEPS, so they can only be revealed where the depth varies: measured
    // from 54 blocks up over open water the cap darkened the near sea (mean 24.88 -> 24.05) and added no structure at all,
    // because deep water has no layers in it to give back. The shore is where the seabed climbs.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`)}+4, ${S.sz}+0.5)`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    // Face the water: the bearing whose near crop is darkest is the sea rather than the beach.
    let sy=0.5, sdark=1e9;
    for(let i=0;i<12;i++){ const yaw=i*Math.PI/6;
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.30})`); await sleep(200);
      const f=await shot('clarity-scan.png'); const m=blockSpread(f,NEARW).mean;
      if(m<sdark){ sdark=m; sy=yaw; } }
    _yaw=sy; await page.evaluate(`__hc.cam({yaw:${sy}, pitch:-0.30})`); await sleep(300);
    console.log(`  shelf vantage: yaw ${sy.toFixed(2)}, near-crop mean ${sdark.toFixed(1)}`);
    const eyeOld=await at(1.0,-0.30,'eye-old',NEARW), eyeNew=await at(0.80,-0.30,'eye-new',NEARW);
    // NOT ASSERTED. The cap demonstrably gives the depth colour back at a grazing angle — it is a min() on the mix — but I could
    // not build a vantage where that shows as LAYERS in a number, and three attempts are worth recording so the fourth starts
    // further along. Over open water from height the near sea has no depth variation to reveal, so the cap only darkened it
    // (mean 24.88 -> 24.05, spread 3.645 -> 3.57). Cropping the middle of the frame at eye level measured water hundreds of
    // blocks out, where the ring landing forces a flat colour whatever Fresnel says, and both readings came back 46.48. And the
    // shore vantage found by scanning for the darkest near crop landed on something reading mean 6.8 while the measured frames
    // read 131.7 — the scan and the measurement were not looking at the same thing, so that number means nothing either.
    // What the layer read needs is a known shallow SHELF in the near crop, which means placing the water rather than finding it:
    // flatten a shelf with /setblock at three depths and look along it. That is the way in next time.
    console.log(`  NOT ASSERTED: grazing-angle layers ${eyeOld.spread} -> ${eyeNew.spread} spread, ${eyeOld.mean} -> ${eyeNew.mean} mean — no vantage here has depth steps in the near crop`);
    // 3. It is still SEA and not a hole: the mean must not collapse.
    check('and it is still water, not a hole', Math.abs(eyeNew.mean-eyeOld.mean) < 26, `mean ${eyeOld.mean} -> ${eyeNew.mean}`);
    await page.evaluate(`__hc.glade({fresCap:0.80})`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/clarity-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
