// SHRUBS SITTING A BLOCK INTO THE GROUND (Ben 07-29). Place a bush next to a fern and tall grass on the same
// flat ground, from the same QA call, and photograph the row at eye level and from above — so "sunk" can be read
// off against neighbours that are known-good rather than judged from a single blob in isolation.
// Also dumps the tile artwork's own vertical extent, since the blob's alpha bounds inside the 16px tile decide
// where the shrub APPEARS to sit even when the block coordinate is right.
// usage: node bench/tmp-shot-shrub.mjs [tag]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
const TAG = process.argv[2] || 'shrub';
fs.mkdirSync(OUT, { recursive:true });

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
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
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl=`(()=>{try{const c=document.createElement('canvas');const g=c.getContext('webgl2')||c.getContext('webgl');if(!g)return 'NO';const e=g.getExtension('WEBGL_debug_renderer_info');return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):'?';}catch(e){return 'E';}})()`;
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&t=252&rd=6', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, {timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`, {timeout:90000});
    await page.evaluate(`__hc.stillFrame(true)`);

    // Candidate flat, above-water spots. Flat + above sea is NOT sufficient: the first pick landed on the DUNGEON
    // and every frame came back black under an "entered the dungeon" banner. So each candidate is teleported to and
    // then tested for OPEN SKY with the chunks actually loaded — 30 blocks of air above the ground — which is the
    // property the shot needs and the only one that catches an interior.
    const cands = await page.evaluate(`(()=>{ const SEA=__hc.island().sea; const P=__hc.pos(); const out=[];
      for(let r=8;r<160 && out.length<14;r++) for(let a=0;a<8;a++){
        const x=Math.round(P.x+Math.cos(a*0.785)*r*4), z=Math.round(P.z+Math.sin(a*0.785)*r*4);
        // ABOVE THE TREE BAND (SEA+4..SEA+44). Two lit-frame attempts failed inside the wood: at ground level under a
        // closed canopy the frame is genuinely near-black even at uDay 1, so there was nothing to judge. Bare high ground
        // carries no trees by construction, so the row is in direct sun and the shrub's seating is actually visible.
        const g=__hc.surfH(x,z); if(g<SEA+48 || g>SEA+80) continue;
        let flat=true; for(let dx=-4;dx<=4;dx++) for(let dz=-3;dz<=3;dz++) if(__hc.surfH(x+dx,z+dz)!==g) flat=false;
        if(flat){ out.push({x,z,g}); break; } }
      return out; })()`);
    let spot=null;
    for(const c of cands){
      await page.evaluate(`__hc.tp(${c.x}, ${c.z})`);
      await sleep(6500);
      // Relaxed from "30 blocks of clear air" — in a forest a canopy overhead is normal and that test rejected every
      // candidate. What actually matters: real solid ground under us, headroom to stand and see the row, and not being
      // inside the lair (the first pick was the dungeon and every frame came back black).
      const ok = await page.evaluate(`(()=>{ const g=${c.g};
        if(!(__hc.blockAt(${c.x},g,${c.z})|0)) return false;                       // chunk actually loaded + solid ground
        for(let y=g+1;y<=g+6;y++) if(__hc.blockAt(${c.x},y,${c.z})|0) return false;  // headroom
        const L=__hc.lairInfo(); if(L && Math.hypot(L.x-(${c.x}), L.z-(${c.z}))<120) return false;   // parenthesised: a negative Z interpolates as "L.z--207", which parses as a decrement
        return true; })()`);
      console.log('candidate', JSON.stringify(c), 'usable:', ok);
      if(ok){ spot=c; break; }
    }
    if(!spot) throw new Error('no open-sky flat spot found');
    console.log('flat spot', JSON.stringify(spot));

    // place, from the SAME code path, at surface+1 (dy=0): bush, fern, tallgrass, and a known-good reference
    const placed = await page.evaluate(`(()=>{ const s=${JSON.stringify(spot)}; const out=[];
      const kinds=['bush','fern','tallgrass','meadow_grass','berry'];
      kinds.forEach((k,i)=>{ out.push({k, r:__hc.place2(s.x+(i-2)*2, s.z, k, 0)}); });
      return out; })()`);
    console.log('placed', JSON.stringify(placed));

    // what block sits at each placed coordinate, and what is directly under it
    const cols = await page.evaluate(`(()=>{ const s=${JSON.stringify(spot)};
      const names={}; for(const k of __hc.bid()) names[__hc.bid(k)]=k;
      const kinds=['bush','fern','tallgrass','meadow_grass','berry']; const out=[];
      kinds.forEach((k,i)=>{ const x=s.x+(i-2)*2, z=s.z, g=__hc.surfH(x,z); const c=[];
        for(let y=g-1;y<=g+3;y++){ const b=__hc.blockAt(x,y,z)|0; c.push(y+':'+(b?(names[b]||b):'.')); }
        out.push({k, x, z, ground:g, col:c.join(' ')}); });
      return out; })()`);
    for(const c of cols) console.log('  ', c.k.padEnd(14), 'ground='+c.ground, c.col);

    // eye-level, a few blocks back, looking flat along the row. Diagnostics printed BEFORE each shot: the first
    // attempt came back pure black and there was no way to tell whether the eye was buried, the clock was wrong or
    // the crop simply missed — so pos, the block at the eye, and uDay are all reported alongside every frame.
    for(const [name,ey,ez] of [['eye',2.0,4],['above',5.0,5]]){
      await page.evaluate(`__hc.tp(${spot.x}, ${spot.g}+${ey}, ${spot.z}+${ez})`);
      await sleep(900);
      await page.evaluate(`__hc.look(${spot.x}, ${spot.g}+1.0, ${spot.z})`);
      await sleep(1400);
      const dg = await page.evaluate(`(()=>{ const P=__hc.pos();
        return { pos:[+P.x.toFixed(1),+P.y.toFixed(1),+P.z.toFixed(1)], yaw:+P.yaw.toFixed(2), pitch:+P.pitch.toFixed(2),
                 atFeet:__hc.blockAt(Math.floor(P.x),Math.floor(P.y),Math.floor(P.z))|0,
                 atEye:__hc.blockAt(Math.floor(P.x),Math.floor(P.y+1.6),Math.floor(P.z))|0,
                 uDay:__hc.seaColor().day }; })()`);
      console.log(name, JSON.stringify(dg));
      await page.screenshot({ path: path.join(OUT, TAG+'-'+name+'-full.png') });
      await page.screenshot({ path: path.join(OUT, TAG+'-'+name+'.png'), clip:{x:400,y:180,width:480,height:360} });
    }
    console.log('shots written');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
