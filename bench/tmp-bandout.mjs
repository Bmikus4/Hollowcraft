// HOW FAR ROUND THE HORIZON THE WOOD REACHES. Ben: "the wooden part of the horizon pines should extend farther out (brown)".
//
// The band is clipped to the same mask the pines are, and then drowned by 1-smoothstep(0, uBandOut, hs) where hs is the mask's
// land strength -- so uBandOut IS the reach, and at 0.22 the wood gave up while the canopy above it carried on round the horizon.
// "Extends farther out" measured as a number: how many screen columns carry brown under the treeline, and how many brown pixels
// in total. Brown here means red at least green: the canopy is green-dominant and the wood is not, and that is the only
// distinction that survives the fog wash.
//
// usage: node bench/tmp-bandout.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.pinScene()');
    const P=await page.evaluate('__hc.probe()');
    // ON THE BEACH, looking along the coast: the view every band measurement in this repo uses, and the one where the anchoring
    // uniforms are exactly 1 so the treeline is at its signed-off angular size.
    // OUT AT SEA, LOOKING AWAY FROM THE ISLAND. The shore view has real forest filling exactly the rows the backdrop occupies, and
    // three measurements in a row ended up profiling near trees -- alternating green crowns and brown trunks, which looks just
    // like a treeline over a woody band. The backdrop is a cylinder centred on the camera, so it is there in every direction:
    // facing out to sea puts nothing but water between the eye and it.
    // Back to the shore view -- the one Ben's eye signed off, anchoring uniforms exactly 1. Out at sea the yaw convention put the
    // camera back on the island's beach twice; aiming here is the known-good pair of numbers from every other band harness.
    await page.evaluate('__hc.tpExact('+(P.x-30)+','+P.z+','+(P.sea+16)+')'); await sleep(3500);
    await page.evaluate('__hcBR.look('+Math.PI+',0.012)'); await sleep(10000);
    console.log('  anchor: '+JSON.stringify(await page.evaluate('__hc.treelineAnchor()')));

    // WHICH ROWS THE HORIZON LAYER OWNS in this view, established by hiding it. Sand, sea and beach are all brown-ish or dark in
    // the rows under the treeline, and the first version of this measurement counted 12,682 "brown" pixels across 676 columns --
    // most of them real terrain, which is why it reported the dial doing nothing when the dial was simply not what it measured.
    // PER PIXEL, not per row. Averaging a row across a third of the frame mixes the thin horizon band with the real forest in
    // front of it, and the average then reads green-dominant everywhere -- the first version of this found zero rows of wood at
    // every setting of the dial, which is a property of the average and not of the band.
    const shot=async(tag)=>{ const f=path.join(OUT,'bandout-'+tag+'.png'); await page.screenshot({path:f}); return decodePNG(fs.readFileSync(f)); };
    const at=(im,x,y)=>{ const i=(y*im.w+x)*im.ch; return {r:im.data[i], g:im.data[i+1], b:im.data[i+2], lum:0.2126*im.data[i]+0.7152*im.data[i+1]+0.0722*im.data[i+2]}; };
    await page.evaluate('__hc.setTime(0.35)'); await sleep(1400);
    const shotA=await shot('skirt-base');
    await page.evaluate('__hc.horizonDbg(true,false)'); await sleep(1000);
    const noLayer=await shot('layer-off');
    await page.evaluate('__hc.horizonDbg(true,true)'); await sleep(1000);
    const X0=Math.floor(shotA.w*0.06), X1=Math.floor(shotA.w*0.94);
    // The canopy's row per column: the topmost pixel the layer owns that is green-dominant. Per column, because the treeline is
    // a noisy silhouette and one global row would sit above the crowns in some columns and inside the wood in others.
    const canopy=[];
    for(let x=X0;x<X1;x+=2){ let y0=null;
      for(let y=0;y<shotA.h;y++){ const a=at(shotA,x,y), b=at(noLayer,x,y);
        if(Math.abs(a.lum-b.lum)>2.0 && a.g-(a.r+a.b)/2>3){ y0=y; break; } }
      if(y0!=null) canopy.push({x,y:y0}); }
    const med=a=>{ const s=a.slice().sort((p,q)=>p-q); return s.length?s[s.length>>1]:null; };
    console.log('  canopy found in '+canopy.length+' columns, median row '+med(canopy.map(c=>c.y)));

    const reach=async(skirt)=>{
      const st=await page.evaluate('__hc.bandFog(null,null,'+(skirt==null?'null':skirt)+')');
      await page.evaluate('__hc.setTime(0.35)'); await sleep(900); await page.evaluate('__hc.setTime(0.35)'); await sleep(300);
      const im=await shot('skirt-'+skirt);
      // For each column: how far below its own canopy pixel does the layer keep drawing something that is NOT green-dominant?
      // That run is the wood, and its length is what "further down" means as a number.
      const runs=[], tops=[];
      for(const c of canopy){ let low=null;
        for(let y=c.y; y<Math.min(im.h, c.y+220); y++){ const a=at(im,c.y!=null?c.x:0,y), b=at(noLayer,c.x,y);
          if(Math.abs(a.lum-b.lum)<=2.0) continue;
          if(a.g-(a.r+a.b)/2 < 3) low=y; }
        if(low!=null){ runs.push(low-c.y); tops.push(c.y); } }
      return { st, n:runs.length, median:med(runs), max:runs.length?Math.max(...runs):null, canopyMedian:med(tops) };
    };
    // THE PROFILE, PRINTED. Three attempts at automating this classification all reported confident nonsense -- a fixed row
    // window that sampled the beach, a row average that read green everywhere because it mixed the horizon band with the forest
    // in front of it, and a frame-difference anchor that latched onto sky noise at row 0. So the strip is narrow, chosen over
    // open water where nothing stands between the camera and the horizon, and the numbers are printed rather than thresholded.
    const strip=async(im, xc, w=20)=>{ const out=[];
      for(let y=0;y<im.h;y++){ let r=0,g=0,b=0,n=0;
        for(let x=xc-w/2;x<xc+w/2;x++){ const p=at(im,Math.round(x),y); r+=p.r; g+=p.g; b+=p.b; n++; }
        out.push({y, r:r/n, g:g/n, b:b/n}); }
      return out; };
    for(const skirt of (process.argv[2]?[Number(process.argv[2])]:[0.22, 0.85])){
      await page.evaluate('__hc.bandFog(null,null,'+skirt+')');
      await page.evaluate('__hc.setTime(0.35)'); await sleep(900); await page.evaluate('__hc.setTime(0.35)'); await sleep(300);
      const im=await shot('skirt-'+skirt);
      // The crop the eye judges: the horizon strip in the accepted shore view, magnified. Rows 350-430 are where every earlier
      // measurement in this repo located the backdrop treeline from here.
      await page.screenshot({ path:path.join(OUT,'bandout-strip-'+skirt+'.png'), clip:{ x:340, y:348, width:600, height:86 } });
      for(const frac of []){
        const pr=await strip(im, Math.round(im.w*frac));
        // Find the greenest row in the strip -- the canopy -- and print from ten rows above it to forty below, which spans the
        // canopy, the wood and the water beneath at this angular size.
        let gy=0, gb=-1e9; for(const p of pr){ const gr=p.g-(p.r+p.b)/2; if(gr>gb){ gb=gr; gy=p.y; } }
        const fmt=p=>'y'+String(p.y).padStart(3)+' rgb('+[p.r,p.g,p.b].map(v=>String(Math.round(v)).padStart(3)).join(',')+') green '+String(Math.round(p.g-(p.r+p.b)/2)).padStart(4);
        console.log('  skirt '+skirt+'  x='+Math.round(im.w*frac)+'  canopy y'+gy+' greenness '+gb.toFixed(1));
        for(let y=gy-6; y<=gy+40; y+=2){ const p=pr[y]; if(p) console.log('       '+fmt(p)); }
      }
    }
    console.log('  frames: bench/results/bandout-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
