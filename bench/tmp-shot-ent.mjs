// THE DARK FOREST ENTRANCEWAY — frame it using the solved yaw from __hc.entrance(), and shoot an A/B pair
// (mouth on / mouth off) from the identical camera so the difference is provably the feature and not the weather.
// usage: node bench/tmp-shot-ent.mjs <tag>
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
const TAG = process.argv[2] || 'ent';
fs.mkdirSync(OUT, { recursive:true });

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base = 'http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    let browser = await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    let page = await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,400)));
    page.on('console', m=>{ const t=m.text(); if(/shader|GLSL|WebGL|ERROR/i.test(t)) console.log('CONSOLE:', t.slice(0,400)); });
    await page.goto('about:blank');
    const glProbe = `(()=>{try{const c=document.createElement('canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');if(!gl)return 'NO';const e=gl.getExtension('WEBGL_debug_renderer_info');return e?String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)):'?';}catch(e){return 'E';}})()`;
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(glProbe))){
      await browser.close();
      browser = await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx = await browser.newContext({ viewport:{width:1280,height:720} });
      page = await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,400)));
    }
    await page.goto(base+'/index.html?debug=1&t=252&rd=6', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, { timeout:90000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, { timeout:90000 });
    console.log('island', JSON.stringify(await page.evaluate(`__hc.island()`)));

    // (500,0) is the mid-island vantage the existing pine harness already proves shows a wrapping treeline. Teleporting to
    // the computed island CENTROID instead put the eye inside a hill — tp ground-snaps, and the centroid of this island sits
    // in low ground — so the frame was backfaces of terrain overhead. Then lift the eye clear of the canopy, because at
    // ground level the near trees fill the frame and the horizon backdrop is never visible at all.
    // FIND an open vantage instead of naming one. Hard-coded spots kept landing the eye inside a mountain (the frame was
    // backfaces of terrain), and there is no known-good coordinate to fall back on: the older harnesses only appeared to
    // work because __hc.tp was shadowed and never went where they asked. So sample the island, and require of a spot that
    // (a) its ground sits low, in the forest band, and (b) looking along the entranceway bearing, nothing for 90 blocks
    // rises above the eye — which is the actual property a horizon shot needs and the one a coordinate cannot promise.
    const ent0 = await page.evaluate(`__hc.entrance()`);
    const spot = await page.evaluate(`(()=>{
      const groundY=(x,z)=>__hc.surfH(x,z);   // the noise heightfield, not blockAt: unloaded chunks read as air and the scan finds nothing
      const az=${ent0.az}, dx=Math.cos(az), dz=Math.sin(az);
      const SEA=__hc.island().sea, CANOPY=30;   // pines run 18..31 blocks; clear them or the near wood fills the frame
      let best=null;
      for(let x=240; x<=860; x+=20) for(let z=-320; z<=320; z+=20){
        const g=groundY(x,z);
        if(g < SEA+6) continue;                                   // above water — an absolute height test put the eye under the sea
        // The eye goes ABOVE THE LOCAL CANOPY. At ground level in forest the near trunks occlude the horizon backdrop
        // completely (measured: a spot scoring 14/14 forest with a perfectly clear terrain sightline still framed nothing
        // but trunks), and the treeline is a HORIZON element — it is seen from clearings, the shore and high ground.
        const eye=g+CANOPY; let clear=1e9, forest=0, n=0;
        for(let r=20; r<=340; r+=10){ const sx=Math.round(x+dx*r), sz=Math.round(z+dz*r), sg=groundY(sx,sz); n++;
          clear=Math.min(clear, eye-(sg+CANOPY));                 // headroom over the CANOPY out there, not just the ground
          if(sg>SEA+4 && sg<=SEA+44) forest++; }                  // the ground toward the mouth must be forest, or the mask discards the treeline and there is no wall to cut a mouth into
        const score = Math.min(clear,40) + forest*1.5;
        if(!best || score>best.score) best={x,z,g,eye,clear,forest:forest+'/'+n,score,sea:SEA};
      }
      return best; })()`);
    console.log('vantage', JSON.stringify(spot));
    await page.evaluate(`__hc.tp(${spot.x}, ${spot.eye}, ${spot.z})`);
    await sleep(7000);
    console.log('eye', JSON.stringify(await page.evaluate(`__hc.pos()`)));

    // ASSERT there are pines at the mouth's bearing from HERE. The mask is per-position, so an entranceway aimed at an
    // azimuth the mask has discarded would simply not be in the frame, and the shot would "fail" for the wrong reason.
    const ent = await page.evaluate(`(()=>{ const e=__hc.entrance(); const m=__hc.pines().mask;
      const i=Math.round(((e.az+Math.PI)/(2*Math.PI))*m.length)%m.length;
      const at=(k)=>{ const v=m[(k+m.length)%m.length]; return (v&&v.vis!=null)?v.vis:v; };
      return Object.assign(e,{ maskIdx:i, maskAtMouth:at(i), maskNear:[at(i-2),at(i-1),at(i),at(i+1),at(i+2)] }); })()`);
    console.log('entrance', JSON.stringify(ent));
    if(!(ent.maskAtMouth>50)) console.log('WARNING: mask at the mouth bearing is', ent.maskAtMouth, '- the treeline is discarded there, so the entranceway cannot show in this frame');

    // KILL EVERY SOURCE OF FRAME-TO-FRAME NOISE before the A/B. The first attempt reported 35% of pixels changed between
    // mouth-on and mouth-off with identical mean colour inside the bounding box — that was film grain (randomised per frame)
    // plus swaying foliage and the ocean shimmer, not the feature. Frozen and de-grained, a diff isolates the mouth alone.
    console.log('stillFrame', JSON.stringify(await page.evaluate(`__hc.stillFrame(true)`)));
    await sleep(600);
    console.log('postfx', JSON.stringify(await page.evaluate(`__hc.postfx()`)));

    for(const [name,frac] of [['day',0.42],['dusk',0.575],['night',0.72]]){
      await page.evaluate(`__hc.setTime(${frac})`);
      await sleep(1500);
      for(const on of [1,0]){
        await page.evaluate(`__hc.entranceOn(${on})`);
        // re-read the bearing each shot: it is live, and standing at the centre it will not have moved
        const e2 = await page.evaluate(`__hc.entrance()`);
        await page.evaluate(`__hc.cam({yaw:${e2.yawToFace}, pitch:-0.045})`);
        await sleep(800);
        await page.screenshot({ path: path.join(OUT, TAG+'-'+name+'-'+(on?'on':'off')+'.png') });
        // …and a tight crop on the mouth. The whole-frame diff proves WHERE it changed; only a crop shows whether it READS
        // as an opening in a treeline rather than a few dark pixels.
        await page.screenshot({ path: path.join(OUT, TAG+'-'+name+'-'+(on?'on':'off')+'-crop.png'),
                                clip:{ x:440, y:120, width:400, height:400 } });
      }
      console.log('shot pair', name, 'uDay', await page.evaluate(`__hc.seaColor().day`));
    }
    await page.evaluate(`__hc.entranceOn(1)`);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
