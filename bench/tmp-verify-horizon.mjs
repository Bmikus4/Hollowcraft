// One-off visual verify: horizon pine treeline wrap + sky-past-RD coverage.
// Opens the game, pins day, places the player mid-island at low RD, screenshots 4 compass yaws,
// then a coastal shot looking seaward (should show ocean, no floating pines).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/1add4dd8-b3db-4a10-84e0-d4dd2ea79567/scratchpad';

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
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const glProbe = `(()=>{try{const c=document.createElement('canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');if(!gl)return 'NO';const e=gl.getExtension('WEBGL_debug_renderer_info');return e?String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)):'?';}catch(e){return 'E';}})()`;
    let gpu = await page.evaluate(glProbe);
    if(/swiftshader|software|llvmpipe|^NO$/i.test(gpu)){
      console.log('headless GPU is software ('+gpu+') — relaunching headed off-screen');
      await browser.close();
      browser = await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx = await browser.newContext({ viewport:{width:1280,height:720} });
      page = await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&t=252', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, { timeout:90000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`, { timeout:90000 });
    console.log('game up. GPU:', await page.evaluate(glProbe));

    // mid-island, low RD → treeline should WRAP all landward azimuths
    await page.evaluate(`(()=>{ __hc.rd(4); __hc.tp(500,0); })()`);
    await sleep(4000);   // chunks stream + mask sweep
    for(const [name,yaw] of [['mid-N',0],['mid-E',Math.PI/2],['mid-S',Math.PI],['mid-W',-Math.PI/2]]){
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:0.02})`);
      await sleep(700);
      await page.screenshot({ path: path.join(OUT, 'horizon-'+name+'.png') });
      console.log('shot', name);
    }
    // coast, looking seaward → ocean horizon, no pines over water
    await page.evaluate(`__hc.tp(500,-380)`);
    await sleep(4000);
    await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:0.02})`);   // face -Z = out to sea
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'horizon-coast-sea.png') });
    console.log('shot coast-sea');
    // coast looking back inland → tall treeline
    await page.evaluate(`__hc.cam({yaw:0, pitch:0.02})`);
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'horizon-coast-inland.png') });
    console.log('shot coast-inland');
    // higher RD sanity: treeline should recede but still cover past-RD land
    await page.evaluate(`(()=>{ __hc.rd(8); __hc.tp(500,0); })()`);
    await sleep(6000);
    await page.evaluate(`__hc.cam({yaw:0, pitch:0.02})`);
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'horizon-mid-N-rd8.png') });
    console.log('shot mid-N-rd8');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
