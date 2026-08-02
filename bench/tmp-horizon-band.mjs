// UNFINISHED PROBE — ITS CONTROL STILL FAILS. Do not trust any number this prints.
//
// Goal: detect the daytime horizon band recorded as still open in 0ba0f22 (rgb ~(44,74,112), chroma 66 against a median
// of 46, about one degree below the sight line). It measures CHROMA, not luminance, because 0ba0f22 is explicit that the
// band is a saturation anomaly and DIMMER than the sky above it, so every brightness metric written for it walked past.
//
// WHAT HAS BEEN ELIMINATED as a source of run-to-run variance, each by measurement:
//   - the day clock advancing between captures (the hour is re-pinned before every screenshot)
//   - the waterline being re-detected per shot (it is locked once and reused; this was a guess and it was NOT the cause)
//   - weather, exposure and adaptive resolution — __hc.pinScene() freezes them. This one mattered: the `weather` object
//     is constructed with Math.random() in its rain and fog timers, and scene fog plus toneMappingExposure follow it.
//   - a single unlucky frame (each measurement is the median of three captures)
//
// WHAT IS STILL WRONG, and it is the vantage. Look at bench/results/band-vib0.png: the camera is not pointing at open
// ocean. Sea fills the left, a forested cliff fills the right, and the sample window — the central 40% of the width —
// straddles the shoreline, so trees and terrain sit inside the measurement. Terrain and foliage streaming differing
// slightly between runs is easily worth the 27-point chroma spread the orchestrator measured across three runs of this
// same command (93.7, 104.9, 77.6) against an effect of about 7 points. The camera yaw formula was also wrong for this
// engine and is fixed here (lookDir uses x=-sin(yaw), z=-cos(yaw), so the inverse is atan2(-dx,-dz), not
// -PI/2-atan2(dz,dx)), and the vantage search now requires a whole +/-25 degree fan of water rather than one ray — but
// neither was enough: from this spawn the search still returns a shore with land inside the frame.
//
// THE NEXT MOVE, for whoever picks this up: stop trying to find a clean vantage by searching the shore. Either place the
// camera out over open water away from the island entirely, or reject sample COLUMNS that contain land instead of
// assuming the central 40% is clean — the frame can be classified per column before any chroma is averaged.
//
// Also unresolved and worth knowing: __hc.setTime(0.42) leaves globalU.uDay at 0.99924, so uDay is not the 0..1 fraction
// the call takes. The frame does look like day, but "midday" here is asserted, not verified.
//
// Already ruled out by 0ba0f22 itself, do not re-test: the backdrop ring, the sky's anchor value, the water's grazing
// sheen, the pine layer, the width of the sky convergence. Layer bisection is confounded — hiding the sky dome exposes
// scene.background and repaints the upper frame.
//
// usage: node bench/tmp-horizon-band.mjs
//
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT  = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// --- minimal PNG reader (RGBA8, non-interlaced) so the harness carries no image dependency ---
function readPNG(file){
  const buf=fs.readFileSync(file); let p=8, w=0,h=0, idat=[];
  while(p<buf.length){ const len=buf.readUInt32BE(p), type=buf.toString('ascii',p+4,p+8);
    if(type==='IHDR'){ w=buf.readUInt32BE(p+8); h=buf.readUInt32BE(p+12); }
    else if(type==='IDAT') idat.push(buf.slice(p+8,p+8+len));
    else if(type==='IEND') break;
    p += 12+len; }
  const raw=zlib.inflateSync(Buffer.concat(idat)); const stride=w*4, px=Buffer.alloc(w*h*4);
  let o=0;
  for(let y=0;y<h;y++){ const ft=raw[o++]; const line=raw.slice(o,o+stride); o+=stride;
    const cur=px.slice(y*stride,(y+1)*stride), prev=y?px.slice((y-1)*stride,y*stride):Buffer.alloc(stride);
    for(let i=0;i<stride;i++){ const a=i>=4?cur[i-4]:0, b=prev[i], c=i>=4?prev[i-4]:0; let v=line[i];
      if(ft===1)v+=a; else if(ft===2)v+=b; else if(ft===3)v+=((a+b)>>1);
      else if(ft===4){ const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c); v+= (pa<=pb&&pa<=pc)?a:(pb<=pc?b:c); }
      cur[i]=v&255; } }
  return {w,h,px};
}
// Per-row mean chroma (max channel - min channel). Deliberately NOT luminance: the band is dimmer than the sky above it.
// Central 40% of the width ONLY. The vantage points at open ocean, but land and trees sit at the frame edges, and
// averaging a full row folds them into the number -- which would dilute a band that exists only over the water.
function rowChroma(img){
  const {w,h,px}=img, rows=new Float64Array(h), lum=new Float64Array(h);
  const x0=Math.round(w*0.30), x1=Math.round(w*0.70), n=x1-x0;
  for(let y=0;y<h;y++){ let c=0,l=0;
    for(let x=x0;x<x1;x++){ const i=(y*w+x)*4, r=px[i],g=px[i+1],b=px[i+2];
      c += Math.max(r,g,b)-Math.min(r,g,b); l += 0.2126*r+0.7152*g+0.0722*b; }
    rows[y]=c/n; lum[y]=l/n; }
  return {rows,lum};
}
const mean=a=>a.reduce((x,y)=>x+y,0)/(a.length||1);
// Anchored to the WATERLINE, not to the frame centre and not to the frame median. 0ba0f22 puts the band about one degree
// BELOW the sight line, and at 600px over a 74-degree vertical FOV that is ~8px — far too fine to find with a "strongest
// row within 10% of the frame" search, which picks up the sky gradient instead and reports a number about the wrong thing.
// The waterline is the sharpest luminance step in the middle of the frame, i.e. where sea meets sky.
// THE WATERLINE IS LOCKED ONCE AND REUSED. Detecting it per screenshot is what broke the control: changing horizon
// vibrance shifts the luminance step slightly, the detector picks a different row, and the two shots then measure
// different rows — which read as chroma going DOWN when it had gone up. Pass a fixed wl for every comparison shot.
function findBand(img, lockedWl){
  const {rows,lum}=rowChroma(img);
  const lo=Math.round(img.h*0.30), hi=Math.round(img.h*0.70);
  let wl=lo, step=-1;
  if(lockedWl!=null){ wl=lockedWl; step=Math.abs(lum[wl]-lum[wl+1]); }
  else for(let y=lo;y<hi;y++){ const d=Math.abs(lum[y]-lum[y+1]); if(d>step){ step=d; wl=y; } }
  const band=[], sky=[], sea=[];
  for(let y=wl+1;  y<=wl+10; y++) if(rows[y]!=null) band.push(rows[y]);   // the first ~1.2 degrees BELOW the sight line
  for(let y=wl-60; y<=wl-20; y++) if(rows[y]!=null) sky.push(rows[y]);    // open sky well above it
  for(let y=wl+40; y<=wl+90; y++) if(rows[y]!=null) sea.push(rows[y]);    // open sea well below it
  const bC=mean(band), sC=mean(sky), wC=mean(sea), bMax=Math.max.apply(null,band.length?band:[0]);
  return { waterlineY:wl, step:+step.toFixed(1),
           band:+bC.toFixed(1), bandPeak:+bMax.toFixed(1), sky:+sC.toFixed(1), sea:+wC.toFixed(1),
           profile:Array.from({length:22},(_,i)=>+(rows[wl-6+i]||0).toFixed(0)),
           excess:+(bC-Math.max(sC,wC)).toFixed(1),
           lumBand:+mean(Array.from({length:10},(_,i)=>lum[wl+1+i]||0)).toFixed(1),
           lumSky:+mean(Array.from({length:41},(_,i)=>lum[wl-60+i]||0)).toFixed(1) };
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  let fail=false;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(6000);

    // open-ocean coastal vantage (same search tmp-horizon-reverify uses)
    const cam = await page.evaluate(`(()=>{ const SEA=__hc.island().sea; const P=__hc.pos();
      for(let r=6;r<140;r++) for(let a=0;a<48;a++){ const th=a/48*6.2831853;
        const x=Math.round(P.x+Math.cos(th)*r*6), z=Math.round(P.z+Math.sin(th)*r*6);
        const g=__hc.surfH(x,z); if(g<SEA+1 || g>SEA+5) continue;
        const dx=Math.cos(th), dz=Math.sin(th); let open=true;
        // the WHOLE forward sector must be water, not just the centre ray: the sample window is the middle 40% of the
        // frame, so land anywhere in a +/-25 degree fan lands inside it and swamps the measurement
        for(let a2=-0.44; a2<=0.44 && open; a2+=0.11){ const ux=Math.cos(th+a2), uz=Math.sin(th+a2);
          for(let s=12;s<=260;s+=8) if(__hc.surfH(Math.round(x+ux*s), Math.round(z+uz*s))>SEA){ open=false; break; } }
        if(!open) continue;
        return { x, z, g, az:Math.atan2(dz,dx), yaw:Math.atan2(-dx,-dz) }; }
      return null; })()`);
    if(!cam){ console.log('ABORT: no open-ocean coastal camera found — nothing to measure.'); process.exit(1); }
    await page.evaluate(`__hc.tpAt(${cam.x}, ${cam.g+3}, ${cam.z})`);
    await sleep(7000);
    await page.evaluate('__hc.setTime(0.42)');                     // midday
    await sleep(1500);
    // Freeze the scene BEFORE anything is measured, and wait for the ring to finish so streaming progress cannot differ
    // between runs either. Weather alone was worth ~27 points of chroma spread on a ~7 point effect.
    console.log('pinned: '+JSON.stringify(await page.evaluate('__hc.pinScene()')));
    for(let i=0;i<60;i++){ const f=await page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(500); }
    await page.evaluate('__hc.pinScene()');
    await sleep(2500);
    await page.evaluate(`__hc.cam({yaw:${cam.yaw}, pitch:0.0})`);  // pitch 0 → the sight line is the frame's centre row
    await sleep(1500);

    // Lock the waterline ONCE, from the shipped state, then reuse that row for every shot in the run.
    let WL=null;
    // The day clock keeps running between shots. Two captures 2 s apart are at different sun angles, and that difference
    // is larger than the effect being measured — so the hour is re-pinned immediately before every screenshot.
    // Median of three captures a few frames apart: one screenshot can land on a frame where something transient is on
    // screen, and the median rejects that without hiding a real change the way a mean would.
    const shot=async(tag)=>{ const runs=[];
      for(let k=0;k<3;k++){ await page.evaluate('__hc.setTime(0.42)'); await page.evaluate('__hc.pinScene()'); await sleep(350);
        const f=path.join(OUT,'band-'+tag+(k?'-'+k:'')+'.png'); await page.screenshot({path:f});
        const img=readPNG(f); if(WL==null) WL=findBand(img).waterlineY; runs.push(findBand(img, WL)); }
      runs.sort((a,b)=>a.band-b.band); return runs[1]; };

    // ---------- CONTROL: does the metric respond to chroma at all? ----------
    await page.evaluate('__hc.vis({seavib:0})');   await sleep(900);
    const v0 = await shot('vib0');
    await page.evaluate('__hc.vis({seavib:1.5})'); await sleep(900);
    const v15 = await shot('vib15');
    await page.evaluate('__hc.vis({seavib:0})');   await sleep(900);
    const caught = v15.band > v0.band + 2;
    console.log('CONTROL  horizon vibrance 0 -> 1.5   band chroma '+v0.band+' -> '+v15.band
                +'   '+(caught?'CAUGHT — the metric tracks real saturation':'NOT CAUGHT — THE METRIC IS BLIND'));
    if(!caught){ console.log('ABORT: a check that cannot fail is not evidence.'); process.exit(1); }

    // ---------- the shipped state ----------
    const b = await shot('shipped');
    console.log('\nSHIPPED (seavib at its default)');
    console.log('  waterline row y='+b.waterlineY+' (luminance step '+b.step+')');
    console.log('  chroma  band(just below sight line)='+b.band+' peak='+b.bandPeak+'   open sky='+b.sky+'   open sea='+b.sea+'   EXCESS='+b.excess);
    console.log('  chroma profile, waterline-6 .. waterline+15: '+b.profile.join(' '));
    console.log('  luminance  band='+b.lumBand+'   sky='+b.lumSky
                +'   (band dimmer than sky: '+(b.lumBand<b.lumSky)+' — 0ba0f22 says it should be, which is why luminance metrics miss it)');
    // 0ba0f22 measured chroma 66 against a median of 46 -> an excess of 20. Half that is the line.
    if(b.excess>10){ console.log('  -> BAND PRESENT (excess '+b.excess+' > 10)'); fail=true; }
    else console.log('  -> no band (excess '+b.excess+' <= 10)');
    console.log('\nshots in bench/results/band-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log(fail?'RESULT: FAIL':'RESULT: PASS');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
