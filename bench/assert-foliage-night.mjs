// ASSERTION: at night, real forest foliage and the horizon pine backdrop fade toward the SAME darkness.
//
// Ben: "volumetric darkness at night is applied to horizon pines, but not to forest trees." Measured, the two fade to
// different targets: the backdrop to _uPineFog (night luminance ~0.008) and real leaves to scene.fog.color (~0.041,
// about five times brighter). So after dusk the treeline sinks into black and the wood in front of it stays a readable
// navy, which is the discrepancy on screen.
//
// A first version of this check compared NEAR canopy brightness against FAR canopy brightness in a night frame. It
// passed identically with the fix compiled out (far was 15% of near either way) because it was measuring fog DENSITY,
// which was never the complaint. The complaint is a difference of TARGET, so that is what is measured here.
//
// ?nofolnight=1 compiles the night term out, so the check is proved capable of failing on this build.
// usage: node bench/assert-foliage-night.mjs [flags]     exit 0 = pass, 1 = fail
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const FLAGS = process.argv[2] ? ('&'+process.argv[2]) : '';
const OFF = /nofolnight/.test(FLAGS);

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
    await page.goto(base+'/index.html?debug=1&rd=8'+FLAGS, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.evaluate('__hc.setTime(0.72)');
    await sleep(2500);

    const t = await page.evaluate('__hc.fadeTargets()');
    console.log('night term '+(OFF?'DISABLED (?nofolnight=1)':'enabled')+'   '+JSON.stringify(t));
    if(t.err){ console.log('ABORT: '+t.err); fail=true; }
    else if(t.day > 0.05){ console.log('ABORT: not actually night (uDay '+t.day+'); this measurement is only about the night end.'); fail=true; }
    else if(t.termOn === OFF){ console.log('ABORT: the flag did not take — termOn='+t.termOn+' with OFF='+OFF+'. The A/B would be meaningless.'); fail=true; }
    else if(t.ratio > 1.6){
      console.log('FAIL: real foliage fades to '+t.ratio+'x the luminance the horizon pines fade to.');
      console.log('      fogLum='+t.fogLum+'  pineLum='+t.pineLum+'  folEffLum='+t.folEffLum);
      console.log('      the wood stays that much brighter than the treeline behind it, at every distance.');
      fail=true;
    } else {
      console.log('PASS: foliage and horizon pines fade to within '+t.ratio+'x of each other  (pineLum='+t.pineLum+', folEffLum='+t.folEffLum+')');
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log(fail?'RESULT: FAIL':'RESULT: PASS');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
