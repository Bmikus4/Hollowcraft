// Horizon ground truth: day + dusk + night, from the coast looking seaward and inland.
// Also dumps __hc.seaColor()/seaMatch() + a pixel probe of the actual rendered horizon band.
// usage: node bench/tmp-shot-horiz2.mjs <tag>
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
const TAG = process.argv[2] || 'before';
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

// sample the rendered frame in a vertical strip down the middle: report sRGB 0-255 per band
const STRIP = `(()=>{ const c=document.querySelector('canvas'); const w=c.width,h=c.height;
  const g=document.createElement('canvas'); g.width=w; g.height=h; const x=g.getContext('2d'); x.drawImage(c,0,0);
  const rows=[]; for(let f=0.30; f<=0.70; f+=0.025){ const y=Math.round(h*f);
    const d=x.getImageData(Math.round(w*0.35), y, Math.round(w*0.30), 1).data;
    let r=0,gg=0,b=0,n=0; for(let i=0;i<d.length;i+=4){ r+=d[i]; gg+=d[i+1]; b+=d[i+2]; n++; }
    rows.push({ y:+f.toFixed(3), rgb:[Math.round(r/n),Math.round(gg/n),Math.round(b/n)] }); }
  return rows; })()`;

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
      console.log('headless GPU software ('+gpu+') — relaunching headed off-screen');
      await browser.close();
      browser = await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx = await browser.newContext({ viewport:{width:1280,height:720} });
      page = await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&t=252&rd=6', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, { timeout:90000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`, { timeout:90000 });
    console.log('game up. GPU:', await page.evaluate(glProbe));
    console.log('vis dials:', JSON.stringify(await page.evaluate(`__hc.vis()`)));

    // coast, so the sea horizon fills the frame
    await page.evaluate(`__hc.tp(500,-380)`);
    await sleep(6000);

    const report = {};
    // setTime takes a FRACTION (0=midnight, 0.5=noon). Assert uDay actually moved before shooting — an earlier run passed
    // worldTime units to time() and got uDay 0.84 for all three "hours", so every frame was the same noon.
    // Calibrated against uDay, not assumed: frac 0.42 is the full-day plateau (uDay 1.0), 0.72 is full night (uDay 0.0),
    // and 0.575 sits on the twilight ramp between them. setTime's fraction is NOT clock-aligned to noon/midnight.
    for(const [name,frac] of [['day',0.42],['dusk',0.575],['night',0.72]]){
      await page.evaluate(`__hc.setTime(${frac})`);
      await sleep(1500);
      const uday = await page.evaluate(`__hc.seaColor().day`);
      console.log(name, 'frac', frac, '-> uDay', uday);
      // seaward: pure sea horizon
      await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:0.0})`);
      await sleep(900);
      await page.screenshot({ path: path.join(OUT, TAG+'-'+name+'-sea.png') });
      report[name+'-sea'] = { strip: await page.evaluate(STRIP), sea: await page.evaluate(`__hc.seaColor()`), match: await page.evaluate(`__hc.seaMatch()`) };
      // inland: pine treeline
      await page.evaluate(`__hc.cam({yaw:0, pitch:0.04})`);
      await sleep(900);
      await page.screenshot({ path: path.join(OUT, TAG+'-'+name+'-pines.png') });
      report[name+'-pines'] = { strip: await page.evaluate(STRIP) };
      console.log('shot', name);
    }
    fs.writeFileSync(path.join(OUT, TAG+'-horizon.json'), JSON.stringify(report,null,1));
    console.log(JSON.stringify(report,null,1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
