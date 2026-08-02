// PROBE: what does the overworld's 10-light cap actually look like in the worst realistic case?
//
// Ben was asked to accept a trade -- with a fixed light pool, standing among more torches than it holds means the
// furthest stop casting. Measurement says that trade is ALREADY made and always has been: LIGHT_POOL is 10, the ten
// lights are created once and never hidden, and assignPointLights lights the nearest ten emitters and leaves the rest
// dark. So there is no before/after to show, only what the shipped cap looks like.
//
// This builds the worst realistic case -- a long line of torches down a forest path at night -- and photographs it.
//
// usage: node bench/tmp-torchline.mjs   -> bench/results/torchline-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

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

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
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
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.setTime(0.80)');   // night
    await sleep(2000);

    // A straight run of torches away from the camera: 24 of them, one every 2 blocks, far more than the pool of 10.
    const info = await page.evaluate(`(()=>{ const P=__hc.pos(); const x0=Math.floor(P.x), z0=Math.floor(P.z); const out=[];
      for(let i=1;i<=24;i++){ const x=x0, z=z0+i*2; const g=__hc.surfH(x,z);
        try{ __hc.setBlockAt(x,g+1,z,'torch'); out.push([x,g+1,z]); }catch(e){} }
      return { placed:out.length, x0, z0, first:out[0]||null, last:out[out.length-1]||null }; })()`);
    console.log('placed '+info.placed+' torches in a line from '+JSON.stringify(info.first)+' to '+JSON.stringify(info.last));
    await sleep(3000);
    await page.evaluate(`__hc.tpAt(${info.x0}, (__hc.surfH(${info.x0},${info.z0})+2), ${info.z0-3})`);
    await sleep(4000);
    await page.evaluate('__hc.cam({yaw:0, pitch:-0.05})');   // yaw 0 looks toward +z, down the line
    await sleep(2500);

    const L = await page.evaluate('__hc.lights()');
    console.log('lights while standing at the near end: poolLit '+L.poolLit+'/'+L.poolSize
                +'   visible point lights '+L.point+'  (three keys the shader on this, and it does not move)');
    await page.screenshot({ path: path.join(OUT,'torchline-near.png') });

    // and from partway down, so the cap's far edge is in frame
    await page.evaluate(`__hc.tpAt(${info.x0}, (__hc.surfH(${info.x0},${info.z0+20})+2), ${info.z0+20})`);
    await sleep(4000);
    await page.evaluate('__hc.cam({yaw:3.14159, pitch:-0.05})');   // look back along the line
    await sleep(2500);
    const L2 = await page.evaluate('__hc.lights()');
    console.log('lights from 20 blocks down the line:   poolLit '+L2.poolLit+'/'+L2.poolSize+'   visible point lights '+L2.point);
    await page.screenshot({ path: path.join(OUT,'torchline-far.png') });
    console.log('shots: bench/results/torchline-near.png, torchline-far.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
