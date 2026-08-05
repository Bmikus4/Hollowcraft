// THE LINE WHERE THE FAR SEA MEETS REAL WATER. Ben: "there is still a slight gap, but a lot closer".
//
// Two surfaces draw the same ocean: chunk water, tessellated one quad per block, and the far-sea annulus, a ring of 44 radial
// segments spanning 0.55 to 16 render-walls. Both apply the same world curve in the vertex shader -- drop = k*(d-20)^2 -- but a
// parabola evaluated at the corners of a 56-block segment and interpolated across it is not the parabola: the chord sits below
// the curve by (2k/8)*span^2, which at k=0.0022 and a 56-block span is 1.7 blocks. So the annulus should be a scalloped surface
// that touches the true curve at its segment rings and sags between them, and the boundary with chunk water should be a WAVY
// line rather than a step of constant size.
//
// This measures that: hiding the ocean layer says which pixels the annulus owns, so its top edge on screen can be found per
// column, and the waviness of that edge is the tessellation error in pixels. A constant offset would mean something else -- the
// 3 cm z-fighting drop, or the depth attribute -- and this is the frame that tells those apart.
//
// usage: node bench/tmp-seaseam.mjs
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
    await sleep(8000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.35)');
    await page.evaluate('__hc.pinScene()');

    // OUT AT SEA, well past the coast, high enough that the boundary at 0.55 of the render wall is comfortably in frame, looking
    // back at the island so the near water, the boundary and the far sea are all on screen at once.
    const isle=await page.evaluate('__hc.isleStats()');
    const P=await page.evaluate('__hc.probe()');
    const cx=isle.x+isle.R+140, cz=isle.z;
    await page.evaluate('__hc.tpExact('+cx+','+cz+','+(P.sea+55)+')'); await sleep(4000);
    // Aim back toward the island: the bearing from the camera to the centre, pitched down.
    const yaw=Math.atan2(isle.z-cz, isle.x-cx);
    await page.evaluate('__hcBR.look('+yaw+',-0.42)'); await sleep(2500);
    await page.evaluate('__hc.tpExact('+cx+','+cz+','+(P.sea+55)+')'); await sleep(3000);
    console.log('  camera '+(isle.R+140-isle.R)+' blocks past the coast, '+JSON.stringify(await page.evaluate('__hc.vis&&__hc.vis()')).slice(0,160));

    const shoot=async(tag)=>{ const f=path.join(OUT,'seaseam-'+tag+'.png'); await page.screenshot({path:f}); return decodePNG(fs.readFileSync(f)); };
    const RFM=process.argv[2]!=null?Number(process.argv[2]):null;
    if(RFM!=null){ console.log('  ringfademul -> '+JSON.stringify(await page.evaluate('__hc.vis({ringfademul:'+RFM+'})'))); await sleep(1200); }
    const both=await shoot('both');
    await page.evaluate('__hc.horizonDbg(false,true)'); await sleep(1200);
    const noOcean=await shoot('no-ocean');
    await page.evaluate('__hc.horizonDbg(true,true)'); await sleep(1200);

    const L=(im,x,y)=>{ const i=(y*im.w+x)*im.ch; return 0.2126*im.data[i]+0.7152*im.data[i+1]+0.0722*im.data[i+2]; };
    // THE ANNULUS'S TOP EDGE, per column: the first row from the top where the two frames disagree is where the annulus starts
    // drawing. Attribution by difference rather than by colour, because the two water surfaces are nearly the same colour --
    // which is the whole reason the seam is hard to see and easy to mismeasure.
    // EVERY HORIZONTAL STEP IN THE OPEN-WATER COLUMN, top to bottom, with the same rows measured in the no-ocean frame so each
    // one can be attributed. The left quarter of this view is clear of the island, so a step there is between water surfaces and
    // nothing else. Averaged across columns: a real divider runs the width of the frame, a wave crest does not.
    { const x0=Math.floor(both.w*0.03), x1=Math.floor(both.w*0.26);
      const rowLum=(im,y)=>{ let s=0,n=0; for(let x=x0;x<x1;x++){ s+=L(im,x,y); n++; } return s/n; };
      const steps=[];
      for(let y=Math.floor(both.h*0.14); y<Math.floor(both.h*0.90); y++){
        const d=rowLum(both,y+2)-rowLum(both,y-2);
        if(Math.abs(d)>2.0) steps.push({y, d:+d.toFixed(1), noOcean:+(rowLum(noOcean,y+2)-rowLum(noOcean,y-2)).toFixed(1),
          above:+rowLum(both,y-4).toFixed(1), below:+rowLum(both,y+4).toFixed(1)});
      }
      steps.sort((a,b)=>Math.abs(b.d)-Math.abs(a.d));
      console.log('  horizontal steps in open water (biggest first; "noOcean" is the same step with the ocean layer hidden):');
      for(const s of steps.slice(0,6)) console.log('     row '+s.y+'  step '+(s.d>0?'+':'')+s.d+'   lum '+s.above+' -> '+s.below+'   without the ocean layer '+(s.noOcean>0?'+':'')+s.noOcean);
      if(!steps.length) console.log('     none above 2.0 luminance');
    }

    const edge=[];
    for(let x=Math.floor(both.w*0.22); x<Math.floor(both.w*0.78); x+=2){
      let y0=null;
      for(let y=Math.floor(both.h*0.10); y<Math.floor(both.h*0.92); y++) if(Math.abs(L(both,x,y)-L(noOcean,x,y))>1.5){ y0=y; break; }
      if(y0!=null) edge.push({x, y:y0});
    }
    if(!edge.length){ console.log('  the ocean layer changes nothing in this view -- wrong vantage, not a verdict'); }
    else {
      const ys=edge.map(e=>e.y), mean=ys.reduce((a,b)=>a+b,0)/ys.length;
      const sd=Math.sqrt(ys.reduce((a,b)=>a+(b-mean)**2,0)/ys.length);
      let jag=0; for(let i=1;i<edge.length;i++) jag=Math.max(jag, Math.abs(edge[i].y-edge[i-1].y));
      console.log('  the annulus\'s top edge: '+edge.length+' columns, mean row '+mean.toFixed(1)+', spread (sd) '+sd.toFixed(2)
        +' rows, worst neighbour jump '+jag+' rows');
      // AND THE STEP ACROSS IT in the composed frame: a seam you can see is a luminance jump at that row.
      let step=0, sy=0;
      for(const e of edge){ const a=L(both,e.x,Math.max(0,e.y-3)), b=L(both,e.x,Math.min(both.h-1,e.y+3));
        if(Math.abs(b-a)>step){ step=Math.abs(b-a); sy=e.y; } }
      console.log('  worst luminance step across the boundary: '+step.toFixed(1)+' at row '+sy);
      await page.screenshot({ path:path.join(OUT,'seaseam-zoom.png'),
        clip:{ x:Math.floor(both.w*0.22), y:Math.max(0,Math.round(mean)-45), width:Math.floor(both.w*0.56), height:110 } });
    }
    console.log('  frames: bench/results/seaseam-both.png, seaseam-no-ocean.png, seaseam-zoom.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
