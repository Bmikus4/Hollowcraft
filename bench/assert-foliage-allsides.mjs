// A PLANT MUST BE VISIBLE FROM EVERY ANGLE.
//
// A cross block is two quads at right angles. Single-sided, each quad fronts a half-space, and the two
// half-spaces cover every direction — so the plant never vanishes outright, which is what the first version of
// this check wrongly asserted. What it loses is the OTHER quad: from most angles one of the two is back-facing
// and culled, so the cross renders as one flat blade and reads as half-missing. The claim being checked is
// therefore about how MUCH of the plant survives at its worst angle, not whether any of it does.
//
// The measurement is a pixel count inside a small crop centred on the plant, against the same crop with the
// plant absent — so it measures the PLANT, not the scene. It runs the whole orbit twice: once on FrontSide
// (which must fail somewhere, or the check is not measuring anything) and once on DoubleSide.
//
//   node bench/assert-foliage-allsides.mjs [--block foxglove]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const argv=process.argv.slice(2); const arg=(k,d)=>{ const i=argv.indexOf('--'+k); return i>=0?argv[i+1]:d; };
const BLOCK=arg('block','foxglove'), STEPS=+arg('steps',12);
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// difference in non-matching pixels between two PNG crops, via raw pixel readback in the page instead of a
// PNG decoder here: the page can already read the canvas.
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:900,height:600},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    // NOON, sun overhead. At 0.35 the sun sits near the horizon and three of the twelve orbit angles look
    // straight into it: the crop blows out to white with and without the plant alike, the diff is zero, and it
    // reads as "the plant is invisible here" in BOTH FrontSide and DoubleSide. The blind arc being measured is
    // supposed to be a property of the geometry, not of where the sun is.
    await page.evaluate(`window.__hcPERF.arm(); __hc.lock(true); __hc.pinScene(); __hc.setTime(0.5);`);
    const pr = await page.evaluate(`__hc.probe()`);
    // clear a flat spot, plant one specimen, then orbit it at eye height
    const spot = await page.evaluate(`(()=>{ const bx=${pr.spawnX+8}, bz=${pr.spawnZ+8};
      __hc.tp(bx,bz); const gy=Math.floor(__hc.probe().gyHere);
      // a clear arena: the camera orbits at 2.2 m, so anything within 4 blocks could put it inside terrain or
      // put a leaf between it and the specimen
      for(let dy=1;dy<=5;dy++) for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) __hc.setBlockAt(bx+dx,gy+dy,bz+dz,0);
      window.__spot={bx,bz,gy}; return window.__spot; })()`);
    await sleep(2500);
    // count the plant's own pixels: read the centre crop with the plant, then without it, and diff
    const countAt = async (angle) => page.evaluate(`(async()=>{
      const s=window.__spot, R=2.2, a=${angle};
      const cx=s.bx+0.5+Math.cos(a)*R, cz=s.bz+0.5+Math.sin(a)*R;
      __hc.tpAt(cx, s.gy+1.2, cz);
      __hc.cam({ yaw:Math.atan2(-(s.bx+0.5-cx), -(s.bz+0.5-cz)), pitch:-0.10 });
      const read=()=>{ const c=document.querySelector('canvas'); const g=c.getContext('webgl2')||c.getContext('webgl');
        const w=120,h=120, x=((c.width-w)/2)|0, y=((c.height-h)/2)|0, px=new Uint8Array(w*h*4);
        g.readPixels(x,y,w,h,g.RGBA,g.UNSIGNED_BYTE,px); return px; };
      const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      // WAIT FOR THE REMESH, do not count frames. Placing a block queues a remesh; reading pixels three frames
      // later sometimes caught the world BEFORE the plant existed and sometimes after, which is why the first
      // version of this reported 0 pixels at angles where the plant was plainly there.
      const settled=async()=>{ for(let i=0;i<80;i++){ const q=__hc.editQ(); if(!q.remesh && !q.relight) break; await wait(); } await wait(); await wait(); };
      __hc.setBlockAt(s.bx, s.gy+1, s.bz, ${JSON.stringify(BLOCK)});
      await settled();
      const withP=read();
      __hc.setBlockAt(s.bx, s.gy+1, s.bz, 0);
      await settled();
      const without=read();
      let diff=0; for(let i=0;i<withP.length;i+=4){
        if(Math.abs(withP[i]-without[i])+Math.abs(withP[i+1]-without[i+1])+Math.abs(withP[i+2]-without[i+2]) > 24) diff++; }
      return diff;
    })()`);
    const orbit = async (side) => {
      await page.evaluate(`__hc.folSide(${side})`);
      const counts=[];
      for(let i=0;i<STEPS;i++){ counts.push(await countAt((i/STEPS)*Math.PI*2)); }
      return counts;
    };
    const front = await orbit(0);
    const dbl   = await orbit(2);
    const minF=Math.min(...front), minD=Math.min(...dbl);
    console.log(`  FrontSide  pixels per angle: [${front.join(', ')}]   min ${minF}`);
    console.log(`  DoubleSide pixels per angle: [${dbl.join(', ')}]   min ${minD}`);
    const ratio = +(minD/Math.max(1,minF)).toFixed(2);
    check(`DoubleSide keeps the ${BLOCK} substantial from all ${STEPS} angles`, minD>2500, `weakest angle ${minD} px`);
    // THE CONTROL IS THE SPREAD ACROSS ANGLES, not the single thinnest sample. Comparing the two minima put the whole
    // control on ONE of twenty-four measurements, and which angle happens to catch the culled quad edge-on moves with the
    // plant's wind phase: the same code measured 1.68x standalone and 1.46x in the suite, so a 1.5 threshold failed a
    // feature that was working. What FrontSide actually does is make the silhouette depend on where you stand — max/min
    // across the orbit is 4.5-5.0x with one quad culled and 1.7-1.8x with both drawn, and that gap is what this proves.
    const spread = c => +(Math.max(...c)/Math.max(1,Math.min(...c))).toFixed(2);
    const spF=spread(front), spD=spread(dbl);
    console.log(`  angular spread (max/min): FrontSide ${spF}x, DoubleSide ${spD}x`);
    check(`FrontSide's silhouette swings with the angle and DoubleSide's does not (proves the check works)`,
      spF > spD*2, `FrontSide ${spF}x against DoubleSide ${spD}x across ${STEPS} angles`);
    check(`and at FrontSide's worst angle DoubleSide is fatter`, ratio>1.2,
      `worst angle ${minF} px vs ${minD} px, ${ratio}x — one of the two crossed quads is culled there`);
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
