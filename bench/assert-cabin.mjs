// ASSERT: the cabin near spawn is BUILT and STANDING. Backlog item "cabin not loading" (Ben 07-27). A fix for it landed
// at index.html:3217 -- an edit arriving mid-staged-build left blocks in c.blocks that never render -- but the item was
// never measured afterwards, and this list has a history of entries closed by a wrong measurement.
//
// Two independent questions, because either one alone can lie:
//   1. Are the BLOCKS there? Read the voxels in the cabin's own footprint through blockAt.
//   2. Are they DRAWN? The whole point of the 3217 bug is blocks that exist and never mesh, so voxels alone prove
//      nothing. The frame is the second answer.
//
// usage: node bench/assert-cabin.mjs   -> bench/results/cabin-assert-*.png
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
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(46)+' got='+JSON.stringify(got)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,760']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    }
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(6000);
    // dayLock, NOT setTime. setTime sets the clock and the clock then RUNS: this file spent 0.42 (late afternoon)
    // and then waited through a teleport, a chunk fill and two aims, by which point the world was past sunset and
    // the frame was BLACK — 0.0% wood-toned pixels and a "the cabin is not DRAWN" failure with the cabin standing
    // there in 19 block kinds. dayLock pins worldTime so the hour cannot walk out from under the measurement.
    await page.evaluate('__hc.dayLock(0.42)');

    // The cabin is at a fixed seeded offset from spawn: buildCabin uses cx=spawnX+22, cz=spawnZ-14.
    const S = await page.evaluate('(()=>{const p=__hc.probe(); return {sx:p.spawnX, sz:p.spawnZ, x:p.x, z:p.z};})()');
    console.log('  spawn/state: '+JSON.stringify(S));
    if(S.sx==null) throw new Error('probe() has no spawnX — cannot locate the cabin, and guessing a location is how this check lied the first time');
    // THE CABIN'S OWN RECORD, not this file's memory of buildCabin's arithmetic: cx/cz, the floor it was sited on, and
    // whether the builder has run at all — which is the actual backlog question and was never asked directly.
    const C = await page.evaluate('__hc.cabinInfo()');
    console.log('  cabinInfo: '+JSON.stringify(C));
    if(C.err) throw new Error('cabinInfo: '+C.err);
    const cx = C.cx, cz = C.cz;
    ok('buildCabin has run', C.built===true, C.built);

    // Stand outside the front (the door faces +z) and look at it, so the walls fill the frame.
    await page.evaluate('__hc.tp('+cx+','+(cz+9)+')'); await sleep(3500);
    // AIM AT THE CABIN, as a world point. This file used to call __hc.look(yaw,pitch) — but look() takes a world POINT, so
    // z was undefined, the camera's yaw went NaN, and every frame it photographed was the renderer's clear colour. That is
    // why the "is it drawn" check read 0.4% wood while the cabin stood in front of it.
    await page.evaluate('__hc.look('+cx+','+(C.gy+2)+','+cz+')'); await sleep(1500);

    // 1. THE BLOCKS. Sweep the footprint and count non-air; the walls are logs/planks, so a standing cabin is hundreds.
    const B = await page.evaluate(`(()=>{ const cx=${cx}, cz=${cz};
      // THE GROUND, not the first solid found from the sky. Scanning down from y=90 stops at the tree CANOPY over the
      // cabin: measured, that put gy at 57 with the ground at 44, so the eight-block sweep above it counted 422 leaves and
      // 7 logs and this file reported the cabin as one block kind and undrawn while it stood in shade underneath.
      let gy=${C.gy};
      let solid=0, wood=0, glass=0, air=0; const seen={};
      // the structure's OWN box: 7x7 footprint, floor at gy, ridge at gy+6. The old box was 13x17x9 anchored on a canopy
      // height, so it sampled mostly leaves and air and could not tell a cabin from a tree.
      for(let x=cx-3;x<=cx+3;x++) for(let z=cz-3;z<=cz+3;z++) for(let y=gy;y<=gy+6;y++){
        const b=__hc.blockAt(x,y,z); if(!b){ air++; continue; } solid++; seen[b]=(seen[b]||0)+1; }
      return {gy, solid, air, kinds:Object.keys(seen).length, top:Object.entries(seen).sort((a,b)=>b[1]-a[1]).slice(0,6)}; })()`);
    console.log('  footprint: '+JSON.stringify(B));
    ok('the cabin has a ground level', B && B.gy>1, B&&B.gy);
    ok('a hundred or more blocks stand in its footprint', B && B.solid>100, B&&B.solid);   // 7x7x7 is 343 cells and the inside is hollow, so the old >250 was a threshold for the wrong box
    ok('built of several block kinds, not one slab', B && B.kinds>=4, B&&B.kinds);

    // 2. DRAWN. Blocks that exist and never mesh is the exact bug this item was about, so count how much of the frame is
    // NOT sky or grass -- a cabin filling the view moves that a long way from an empty clearing.
    const shot=path.join(OUT,'cabin-assert-front.png');
    await page.screenshot({path:shot});
    const img=decodePNG(fs.readFileSync(shot));
    let wooden=0, tot=0;
    for(let y=Math.floor(img.h*0.30); y<Math.floor(img.h*0.88); y++) for(let x=Math.floor(img.w*0.22); x<Math.floor(img.w*0.78); x++){
      const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2]; tot++;
      // plank/log browns: red dominant, blue clearly lowest, and not the near-black of deep shadow
      if(r>60 && r>g*1.12 && g>b*1.02 && r<230) wooden++; }
    const pct = 100*wooden/tot;
    console.log('  wood-toned pixels in the centre band: '+wooden+' / '+tot+' = '+pct.toFixed(1)+'%');
    ok('the cabin is DRAWN, not just present in blocks', pct>12, +pct.toFixed(1));

    await page.evaluate('__hc.tp('+(cx+8)+','+(cz+8)+')'); await sleep(2500);
    await page.evaluate('__hc.look('+cx+','+(C.gy+2)+','+cz+')'); await sleep(1200);
    await page.screenshot({path:path.join(OUT,'cabin-assert-corner.png')});

    ok('no page errors', errs.length===0, errs.length);
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    console.log('shots: bench/results/cabin-assert-front.png, cabin-assert-corner.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
