// #67 — UNDERWATER KELP. The item asks for strands on the seabed that sway slower than land foliage and more at the
// tip, and it says occludesSky must be 0. All of that follows from ONE design decision worth pinning:
//
//   KELP IS NOT A BLOCK. This game has no waterlogging anywhere in it, so a kelp block would replace the water cell it
//   stood in and every strand would stand in its own pocket of air — the thing you would be staring at while
//   submerged. Kelp is derived from the seabed at mesh time instead. That is why there is no BID.kelp to test, why
//   nothing collides, why occludesSky is satisfied by construction, and why this harness counts VERTICES rather than
//   blocks. If someone later "tidies" kelp into a real block, checks 1 and 4 here are what fail.
//
//   1 strands exist at all, and land foliage still does
//   2 every sampled strand vertex sits in a cell that is genuinely WATER
//   3 the strands are below sea level and none pokes out of the surface
//   4 there is no kelp block id — the design, asserted
//   5 it sways, and SLOWER than the grass on the shore beside it
// usage: node bench/assert-kelp.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,760']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:180000});
    const pr=await page.evaluate('__hc.probe()');
    await page.evaluate(`__hc.tp(${pr.spawnX},${pr.spawnZ})`);
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',{timeout:90000}).catch(()=>{});
    await sleep(4000);

    const cen=await page.evaluate('__hc.kelpCensus()');
    console.log('  census '+JSON.stringify(cen).slice(0,220));

    console.log('\n--- 1  strands exist, and land foliage is untouched ---');
    chk(cen.strandVerts>200, 'kelp geometry was built', cen.strandVerts+' strand verts');
    chk(cen.foliageVerts>200, 'land foliage still built alongside it', cen.foliageVerts+' foliage verts');

    console.log('\n--- 2  every strand stands in water, not in a pocket of air ---');
    chk(cen.sampled>0 && cen.inWater===cen.sampled, 'sampled strand cells are WATER',
      cen.inWater+' of '+cen.sampled+(cen.inWater===cen.sampled?'':'  offenders: '+JSON.stringify(cen.spots)));

    console.log('\n--- 3  it is underwater, and does not break the surface ---');
    chk(cen.yHigh!=null && cen.yHigh<=cen.sea+0.5, 'no strand pokes out of the sea', 'highest '+cen.yHigh+' against sea '+cen.sea);
    chk(cen.yLow!=null && cen.yLow<cen.sea, 'strands start below sea level', 'lowest '+cen.yLow);

    console.log('\n--- 4  kelp is not a block, which is the whole design ---');
    const isBlock=await page.evaluate('(()=>{try{ return !!(window.BID && BID.kelp!=null); }catch(e){ return false; }})()');
    chk(!isBlock, 'no kelp block id exists', isBlock?'BID.kelp is defined — a block would punch an air pocket in the sea':'derived from the seabed at mesh time');

    console.log('\n--- 5  it sways, slower than the grass on the shore ---');
    // Read off the SHADER THAT COMPILED, not off the screen. Sway lives entirely in the vertex stage, so nothing
    // CPU-side moves and a frame diff can only ever report "something changed" — it cannot tell kelp from grass, from
    // a cloud, or from the sea. These are the constants the GPU is running.
    const wm=await page.evaluate('__hc.windModes()');
    console.log('  wind '+JSON.stringify(wm));
    chk(wm.spd1 && wm.spd1.kelp < wm.spd1.land, 'kelp sways SLOWER than land foliage',
      wm.spd1?('land '+wm.spd1.land+' -> kelp '+wm.spd1.kelp):'no wind source');
    chk(wm.spd2 && wm.spd2.kelp < wm.spd2.land, 'on the cross axis too', wm.spd2?('land '+wm.spd2.land+' -> kelp '+wm.spd2.kelp):'-');
    chk(wm.amp1 && wm.amp1.kelp > wm.amp1.land, 'and FURTHER, because water carries a plant further than air',
      wm.amp1?('land '+wm.amp1.land+' -> kelp '+wm.amp1.kelp):'-');
    chk(wm.spd1 && wm.spd1.land===1.6 && wm.spd2.land===1.3 && wm.amp1.land===0.10 && wm.amp2.land===0.07,
      'the land numbers are untouched, to the digit', 'grass on shore must not have changed for this item');
    // A frame for the record. Daylight, because you cannot see into water at night and this is the shot a human
    // judges the item by.
    // AND PUT THE CAMERA IN THE SEA. Spawn faces along the shore, so the default view photographs a beach and proves
    // nothing about a plant that only exists below the waterline. The census hands back real strand coordinates;
    // stand just above one and look straight down at the seabed.
    await page.evaluate('__hc.setTime(0.30)'); await sleep(600);
    if(cen.spots && cen.spots.length){ const [sx,sy,sz]=cen.spots[0];
      await page.evaluate('__hc.tpAt('+(sx+0.5)+','+(cen.sea+2.5)+','+(sz+0.5)+')'); await sleep(1200);
      await page.evaluate('__hc.look('+(sx+0.5)+','+(sy-3)+','+(sz+0.5)+')'); await sleep(1500);
      fs.writeFileSync(path.join(ROOT,'bench','results','kelp-scene.png'), await page.screenshot());
      // submerged as well: the roster asks for it to be checked from in the water
      await page.evaluate('__hc.tpAt('+(sx+0.5)+','+(cen.sea-1.2)+','+(sz+0.5)+')'); await sleep(1500);
      fs.writeFileSync(path.join(ROOT,'bench','results','kelp-submerged.png'), await page.screenshot());
      chk(true, 'wrote kelp-scene.png and kelp-submerged.png for judging', 'from '+sx+','+sz);
    } else chk(false, 'the census gave no strand coordinate to stand at'); 

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
