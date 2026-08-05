// ASSERTION: meshing starts while generation is still running, rather than waiting for it to finish.
//
// THIS FAILS ON MAIN, deliberately. Measured in bf0230f: on a cold boot 211 generation units run before meshing gets its
// SECOND unit. Nothing is drawn for ~9 seconds and then the whole ring appears at once. Both halves share one frame
// deadline and generation is scheduled first in streamChunks, so while any chunk still needs generating, generation takes
// the budget and meshing gets what is left, which during a cold boot is nothing. A chunk with no mesh is invisible, so
// all of that generation buys the player nothing to look at.
//
// WHAT THIS DOES AND DOES NOT CLAIM. It measures ORDERING, not duration. Overlapping the two halves was tried and made
// the total WORSE (12.1s -> 13.2s, twice), because the main thread is already saturated during the fill -- which the
// shader work later explained: draw costs 13x its steady value while programs compile. So this is not an independent
// contributor to the 8.5-second load. It explains the SHAPE of the wait (nothing, then everything at once) and not its
// length. Both statements are needed; neither supersedes the other.
//
// CONTROL: teleport into terrain that is ALREADY generated. There, mesh work exists with no generation competing, so the
// ratio must inpect the other way -- meshing climbs while generation stays flat. Without that, a run could report the
// same starved ratio whatever the engine did, and the number would mean nothing.
//
// usage: node bench/assert-mesh-not-starved.mjs
//        exit 0 = pass (meshing is not starved), 1 = fail
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
// Generation units allowed to run before meshing has produced 2. The bound is PRINCIPLED, not fitted: meshing a chunk
// needs only that chunk and its 8 neighbours generated (see neighbors8), so meshing can legitimately begin after roughly
// 9-25 units and anything beyond that is scheduling, not dependency. Observed on this build across 5 runs with the exact
// in-engine milestone: 74, 53, 53, 41, 48. The earlier limit of 40 sat inside that spread, so a run landing at 41 was one
// step from reporting a false PASS on a starvation that is plainly still there.
const MAX_GEN_BEFORE_MESH = 25;

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
    const t0=Date.now();
    await page.goto(base+'/index.html?debug=1&perf=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:120000});

    // ---- the cold boot: how much generation runs before meshing gets going? ----
    // The milestone is latched INSIDE the engine (__hc.fill().genAtMesh2) rather than sampled here. Reading it from a
    // poll made the answer depend on the poll interval: this measurement reported 211 and later 78 on the same code,
    // because generation that landed between two 250ms polls was attributed to whichever side the poll happened to see.
    let last=null;
    for(let i=0;i<120;i++){
      const f=await page.evaluate('__hc.fill()'); last=f;
      if(f.meshed>=f.want) break;
      await sleep(250);
    }
    const genAt2Mesh = last.genAtMesh2;
    console.log('COLD BOOT   ring visible after '+(Date.now()-t0)+'ms');
    console.log('  generation units run before meshing produced its 2nd unit: '+genAt2Mesh+'   (limit '+MAX_GEN_BEFORE_MESH+')');
    console.log('  final totals: gen='+last.genUnits+'  mesh='+last.meshUnits);
    if(genAt2Mesh==null){ console.log('ABORT: meshing never reached 2 units.'); process.exit(1); }
    const starved = genAt2Mesh > MAX_GEN_BEFORE_MESH;

    // ---- CONTROL: already-generated terrain, where mesh work exists with no generation competing ----
    // Wait for STREAMING TO SETTLE after each move rather than for a fixed 4000ms: the counters only mean something once
    // the move has been fully absorbed, and a fixed window either cuts the move short or bills idle time to it.
    const settled = async (ms=15000) => { const t0=Date.now(); let prev=-1;
      for(;;){ const f=await page.evaluate('__hc.fill()'); const n=f.genUnits+f.meshUnits;
        if(n===prev) return f; prev=n;
        if(Date.now()-t0>ms) return f; await sleep(250); } };
    await settled();
    const before=await page.evaluate('__hc.fill()');
    const P=await page.evaluate('__hc.pos()');
    // walk back and forth over ground already generated so chunks re-enter the ring needing mesh, not gen
    await page.evaluate('__hc.tp('+Math.round(P.x+40)+','+Math.round(P.z)+')'); await settled();
    await page.evaluate('__hc.tp('+Math.round(P.x)+','+Math.round(P.z)+')');    await settled();
    const after=await page.evaluate('__hc.fill()');
    const dGen=after.genUnits-before.genUnits, dMesh=after.meshUnits-before.meshUnits;
    const inverted = dMesh > dGen;
    console.log('CONTROL  revisiting generated ground: gen +'+dGen+'  mesh +'+dMesh
                +'   '+(inverted?'CAUGHT — meshing can outpace generation, so the ratio is a real signal'
                               :'NOT CAUGHT — the ratio looks the same either way, so it measures nothing'));
    if(!inverted){ console.log('ABORT: a check that cannot fail is not evidence.'); process.exit(1); }

    if(starved){ console.log('\n-> MESHING IS STARVED: '+genAt2Mesh+' generation units before the 2nd mesh unit.'); fail=true; }
    else console.log('\n-> meshing keeps up with generation.');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log(fail?'RESULT: FAIL':'RESULT: PASS');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
