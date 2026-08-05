// Pine-treeline shots that actually FRAME pines: read __hc.pines() and aim at the azimuth with the strongest
// forest mask, instead of guessing a yaw and photographing open sea (which is what the first pass did).
// usage: node bench/tmp-shot-pines.mjs <tag>
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
const TAG = process.argv[2] || 'pines';
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

// Pick the azimuth whose mask R (forest visibility) is highest, averaged over a window so we aim at the
// MIDDLE of a forested arc rather than at its fringe.
const BEST_AZ = `(()=>{ const p=__hc.pines(); const m=p.mask||p; const N=m.length;
  let best=-1,bi=0; for(let i=0;i<N;i++){ let s=0; for(let k=-3;k<=3;k++) s+=(m[(i+k+N)%N].vis!=null?m[(i+k+N)%N].vis:m[(i+k+N)%N]);
    if(s>best){best=s;bi=i;} }
  return { i:bi, score:best, az:(bi/N)*6.2831853-3.14159265, N, sample:JSON.stringify(m[bi]) }; })()`;

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
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(glProbe))){
      await browser.close();
      browser = await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx = await browser.newContext({ viewport:{width:1280,height:720} });
      page = await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&t=252&rd=6', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, { timeout:90000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, { timeout:90000 });
    console.log('game up.');

    for(const [spot,x,z] of [['mid',500,0],['inland',300,200]]){
      await page.evaluate(`__hc.tp(${x},${z})`);
      await sleep(6000);
      const best = await page.evaluate(BEST_AZ);
      console.log(spot, 'best az', JSON.stringify(best));
      for(const [name,frac] of [['day',0.42],['night',0.72]]){
        await page.evaluate(`__hc.setTime(${frac})`);
        await sleep(1400);
        // The shader's azimuth is atan2(vPos.z,vPos.x); the player's forward is (-sin yaw, -cos yaw), which makes
        // az = -PI/2 - yaw. Solved and spot-checked at the four cardinals rather than guessed — the inverse with the
        // sign flipped aims at the arc 180 degrees away, which is how the first pass photographed open sea.
        await page.evaluate(`__hc.cam({yaw:${-Math.PI/2 - best.az}, pitch:0.05})`);
        await sleep(900);
        await page.screenshot({ path: path.join(OUT, TAG+'-'+spot+'-'+name+'.png') });
        console.log('  shot', spot, name, 'uDay', await page.evaluate(`__hc.seaColor().day`));
      }
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
