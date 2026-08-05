// PARKED. THE DAYTIME HORIZON BAND CANNOT CURRENTLY BE MEASURED BY THIS PROBE. Do not trust any number it prints.
//
// Goal was to detect the band recorded as still open in 0ba0f22 (rgb ~(44,74,112), chroma 66 against a median of 46,
// about one degree below the sight line). It measures CHROMA, not luminance, because 0ba0f22 is explicit that the band is
// a saturation anomaly and DIMMER than the sky above it, so every brightness metric written for it walked straight past.
//
// FIVE SOURCES OF VARIANCE ELIMINATED, each by measurement. This is the durable result of the work:
//   1. The day clock advancing between captures. The hour is re-pinned immediately before every screenshot.
//   2. The waterline being re-detected per shot. It is locked once and reused. (This was a suggested cause and it was
//      NOT the cause -- locking it changed nothing.)
//   3. Weather, exposure and adaptive resolution. THIS ONE MATTERED: the `weather` object is constructed with
//      Math.random() in its rain and fog timers, and scene.fog plus renderer.toneMappingExposure both follow it, so two
//      captures seconds apart were not the same scene. __hc.pinScene() freezes all of it; __hc.sceneState() reports it.
//   4. A single unlucky frame. Each measurement is the median of three captures.
//   5. The camera yaw. lookDir uses x=-sin(yaw), z=-cos(yaw), so the inverse is atan2(-dx,-dz); the search had
//      -PI/2-atan2(dz,dx) and the camera never pointed where it intended.
// RULED OUT, not a cause: __hc.setTime(frac) is correct. It sets worldTime=DAY_LEN*frac. uDay is NOT a time fraction --
// it is smooth(-0.46,0.46,sunElevation), a daylight-amount curve -- so uDay=0.999 at frac=0.42 is right, not a mismatch.
//
// WHY IT IS PARKED. The final approach was column classification: accept a column only if the rows below the waterline
// read as water and the rows above read as sky (both blue-dominant), rejecting land instead of assuming the central 40%
// is clean. Five consecutive runs, control CAUGHT 0 of 5:
//   run 1  98.1 -> 99.8   NOT CAUGHT (a +1.7 move against a +2 threshold)
//   run 2  97.6 -> 0      NOT CAUGHT
//   run 3  0    -> 0      NOT CAUGHT
//   run 4  0    -> 0      NOT CAUGHT
//   run 5  0    -> 0      NOT CAUGHT
// A band chroma of 0 means fewer than 40 columns survived classification. Three runs in five produced NO usable sample
// at all, which corroborates the vantage diagnosis rather than contradicting it: from this spawn the frame genuinely
// contains very little open-water-under-open-sky, so a content-based classifier correctly rejects nearly all of it.
// The effect being chased is ~7 points of chroma; the residual run-to-run spread is larger than that even after five
// eliminations. It is not measurable this way.
//
// WHAT SOMEONE SHOULD TRY INSTEAD, in order. (a) Put the camera far out over open water away from the island entirely,
// rather than on a shore -- every version of this has fought the island being in frame. (b) Measure a single fixed
// column strip rather than a row mean: the per-row profile swings 21 to 174 inside the band window with an unelevated
// mean, and a thin spatially-uneven artefact is exactly what a mean-based metric cannot see. That swing is the most
// interesting unexplained signal here. (c) Ask Ben for a screenshot of the band as he sees it, and work backwards from
// the pixels, because it is not established that the artefact still exists -- three sky commits landed after 0ba0f22
// (a4d1ac2, 92e79b2, 0cfec7b).
//
// Already ruled out by 0ba0f22 itself, do not re-test: the backdrop ring, the sky anchor value, the water grazing sheen,
// the pine layer, the width of the sky convergence. Layer bisection is confounded -- hiding the sky dome exposes
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
// COLUMN CLASSIFICATION, replacing "assume the central 40% is clean". A column is usable only if the rows well BELOW the
// waterline read as water and the rows well ABOVE it read as sky -- both meaning blue-dominant. Land is green or brown,
// so a cliff, a treeline or a beach fails on the red/green channels and its column is dropped. This works from any spawn,
// makes the sample self-describing (the accepted-column count is reported), and removes the yaw-search problem entirely:
// it no longer matters where the camera happens to point, only which columns of the frame are open water under open sky.
function classifyColumns(img, wl){
  const {w,h,px}=img, ok=new Uint8Array(w);
  const avg=(x,y0,y1)=>{ let r=0,g=0,b=0,n=0; for(let y=Math.max(0,y0);y<=Math.min(h-1,y1);y++){ const i=(y*w+x)*4; r+=px[i]; g+=px[i+1]; b+=px[i+2]; n++; } return n?[r/n,g/n,b/n]:[0,0,0]; };
  for(let x=0;x<w;x++){
    const sea=avg(x, wl+40, wl+90), sky=avg(x, wl-60, wl-20);
    const blueSea = sea[2] > sea[0]+8 && sea[2] >= sea[1];
    const blueSky = sky[2] > sky[0]+8 && sky[2] >= sky[1];
    ok[x] = (blueSea && blueSky) ? 1 : 0; }
  return ok;
}
// Per-row mean chroma (max channel - min channel) over the ACCEPTED columns only. Deliberately not luminance: 0ba0f22
// records the band as dimmer than the sky above it, which is why every brightness metric written for it walked past.
function rowChroma(img, ok){
  const {w,h,px}=img, rows=new Float64Array(h), lum=new Float64Array(h);
  let n=0; for(let x=0;x<w;x++) if(ok[x]) n++;
  for(let y=0;y<h;y++){ let c=0,l=0;
    for(let x=0;x<w;x++){ if(!ok[x]) continue; const i=(y*w+x)*4, r=px[i],g=px[i+1],b=px[i+2];
      c += Math.max(r,g,b)-Math.min(r,g,b); l += 0.2126*r+0.7152*g+0.0722*b; }
    rows[y]=n?c/n:0; lum[y]=n?l/n:0; }
  return {rows,lum,cols:n};
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
  const all=new Uint8Array(img.w).fill(1);
  const first=rowChroma(img, all);
  const lo=Math.round(img.h*0.30), hi=Math.round(img.h*0.70);
  let wl=lo, step=-1;
  if(lockedWl!=null){ wl=lockedWl; step=Math.abs(first.lum[wl]-first.lum[wl+1]); }
  else for(let y=lo;y<hi;y++){ const d=Math.abs(first.lum[y]-first.lum[y+1]); if(d>step){ step=d; wl=y; } }
  const ok=classifyColumns(img, wl);
  const {rows,lum,cols}=rowChroma(img, ok);
  if(cols<40) return { waterlineY:wl, step:+step.toFixed(1), cols, band:0, bandPeak:0, sky:0, sea:0, excess:0, profile:[], lumBand:0, lumSky:0, thin:true };
  const band=[], sky=[], sea=[];
  for(let y=wl+1;  y<=wl+10; y++) if(rows[y]!=null) band.push(rows[y]);   // the first ~1.2 degrees BELOW the sight line
  for(let y=wl-60; y<=wl-20; y++) if(rows[y]!=null) sky.push(rows[y]);    // open sky well above it
  for(let y=wl+40; y<=wl+90; y++) if(rows[y]!=null) sea.push(rows[y]);    // open sea well below it
  const bC=mean(band), sC=mean(sky), wC=mean(sea), bMax=Math.max.apply(null,band.length?band:[0]);
  return { waterlineY:wl, step:+step.toFixed(1), cols,
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
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
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
    console.log('  waterline row y='+b.waterlineY+' (luminance step '+b.step+')   usable columns='+b.cols+' of 900');
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
