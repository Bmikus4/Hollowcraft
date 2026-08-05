// PROBE (not an assertion): how many shader programs are compiled while the player is PLAYING, rather than behind the
// loading screen? Each one stalls the frame it lands on.
//
// It was written as an assertion for a prewarm fix. The fix was measured and does not work -- ?prewarm=1 costs 575 ms of
// loading screen, warms 23 programs, and removes NONE of the 28 in-play compiles, because three keys a program on runtime
// state so an early compile produces different cache keys than the real draw. The flag ships OFF; this stays as the probe
// that measures the problem, and demoting it to tmp-* is deliberate: there is no shipped fix here to guard.
//
// The number that matters is programs compiled AFTER the loading screen hides, because a program is built on the frame
// its material is first drawn and that frame stalls. `started` is NOT the boundary -- it flips ~4 s before the loading
// screen goes away, and conflating the two is how a previous pass reported "58 programs in the first 10 seconds" when
// 42 of those were behind the loading screen and cost the player nothing.
//
// The loading-screen cost is reported either way. Ben accepted a trade on feel and is owed the seconds.
//
// usage: node bench/assert-prewarm.mjs [flags]     e.g. noprewarm=1
//        exit 0 = pass, 1 = fail
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const FLAGS = process.argv[2] ? ('&'+process.argv[2]) : '';
const KILLED = false;   // no fix to guard — this reports a number, it does not judge
const MAX_IN_PLAY = 8;   // baseline with the prewarm OFF measured 16; steady state needs 0. 8 is the halfway line.

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
  let fail=false; const pageErrors=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    page.on('pageerror', e=>{ const m=String(e.message||e).slice(0,300); pageErrors.push(m); console.log('PAGEERROR:', m); });
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
      page.on('pageerror', e=>{ const m=String(e.message||e).slice(0,300); pageErrors.push(m); console.log('PAGEERROR:', m); });
    }
    const t0=Date.now();
    await page.goto(base+'/index.html?debug=1&perf=1'+FLAGS, { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:120000});
    console.log('prewarm flag: '+(/prewarm/.test(FLAGS)?'ON (?prewarm=1)':'off (shipped default)'));

    // Wait for the loading screen to hide, and record the program count at exactly that moment.
    let readyAt=null, progsAtReady=null;
    for(let i=0;i<90;i++){
      const L=await page.evaluate('__hc.loadState()');
      if(L.initialReady){ readyAt=Date.now()-t0; progsAtReady=L.programs;
        console.log('loading screen hid at '+readyAt+'ms   programs behind it: '+progsAtReady+'   prewarm cost: '+L.prewarmMs+'ms');
        break; }
      await sleep(200);
    }
    if(readyAt==null){ console.log('loading screen never hid'); process.exit(1); }

    // Now play. Anything compiled from here is a stall the player feels.
    let peak=progsAtReady;
    for(let i=0;i<40;i++){
      await sleep(500);
      const s=await page.evaluate('__hc.shaders()'); peak=Math.max(peak,s.n);
      const f=await page.evaluate('__hc.fill()');
      if(f.meshed>=f.want) break;
    }
    // let shadows/late materials settle, and look around so more of the world is drawn
    for(const y of [1.6,3.1,4.7,0]){ await page.evaluate('__hc.look('+y+',0)').catch(()=>{}); await sleep(1200);
      const s=await page.evaluate('__hc.shaders()'); peak=Math.max(peak,s.n); }
    await sleep(3000);
    const fin=await page.evaluate('__hc.shaders()'); peak=Math.max(peak,fin.n);
    const inPlay=peak-progsAtReady;
    const prof=await page.evaluate('__hc.frameProf(120)');

    console.log('total programs '+peak+'   compiled IN PLAY: '+inPlay+'   (limit '+MAX_IN_PLAY+')');
    console.log('steady frame '+prof.avgFrameMs+'ms  draw '+(prof.ms&&prof.ms.draw)+'ms');
    if(pageErrors.length){ console.log('page errors: '+pageErrors.length); fail=true; }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }

  process.exit(pageErrors.length?1:0);   // non-zero only on a page error — the compile count is reported, not judged
})().catch(e=>{ console.error(e); process.exit(1); });
