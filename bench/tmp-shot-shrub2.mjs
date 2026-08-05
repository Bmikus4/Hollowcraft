// SHRUBS SITTING A BLOCK INTO THE GROUND (Ben 07-29) — judged on a BUILT platform, not on found terrain.
// Four attempts to find natural ground failed for four different reasons (inside the dungeon; under a closed canopy
// where the frame is near-black even at uDay 1; no 9x7 patch of exactly-level ground above the treeline). So the
// platform is constructed: a grass slab in open air well above the canopy, with the row laid on top of it. That
// removes terrain, lighting and occlusion from the question entirely and leaves only the thing being measured —
// where a bush sits relative to the block it stands on, against a fern and tall grass placed the same way.
// usage: node bench/tmp-shot-shrub2.mjs [tag]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
const TAG = process.argv[2] || 'shrub2';
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
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, {timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, {timeout:90000});
    await page.evaluate(`__hc.stillFrame(true)`);
    await page.evaluate(`__hc.setTime(0.42)`);
    await sleep(1200);

    const built = await page.evaluate(`(()=>{
      const P=__hc.pos(); const bx=Math.floor(P.x), bz=Math.floor(P.z);
      const y=__hc.surfH(bx,bz)+34;                       // clear of the tallest pine (31) → open sky, direct sun
      const kinds=['bush','fern','tallgrass','meadow_grass','berry'];
      for(let dx=-7;dx<=7;dx++) for(let dz=-4;dz<=4;dz++) __hc.setBlockAt(bx+dx, y, bz+dz, 'grass');
      const names={}; for(const k of __hc.bid()) names[__hc.bid(k)]=k;
      const rows=[];
      kinds.forEach((k,i)=>{ const x=bx+(i-2)*3;
        __hc.setBlockAt(x, y+1, bz, k);
        const col=[]; for(let yy=y-1; yy<=y+3; yy++){ const b=__hc.blockAt(x,yy,bz)|0; col.push(yy+':'+(b?(names[b]||b):'.')); }
        rows.push({k, x, col:col.join(' ')}); });
      return { bx, bz, y, rows }; })()`);
    console.log('platform y='+built.y+' at ('+built.bx+','+built.bz+')');
    for(const r of built.rows) console.log('  ', r.k.padEnd(14), r.col);

    // stand ON the platform, a few blocks back, eye level with the row
    for(const [name,dy,dz,pitch] of [['eye',1.0,7,0],['low',0.2,4,0],['above',4.0,5,0]]){
      await page.evaluate(`__hc.tp(${built.bx}, ${built.y+1+dy}, ${built.bz+dz})`);
      await sleep(700);
      await page.evaluate(`__hc.look(${built.bx}, ${built.y+1.4}, ${built.bz})`);
      await sleep(1300);
      const dg = await page.evaluate(`(()=>{ const P=__hc.pos(); return { pos:[+P.x.toFixed(1),+P.y.toFixed(1),+P.z.toFixed(1)], pitch:+P.pitch.toFixed(2), uDay:__hc.seaColor().day }; })()`);
      console.log(name, JSON.stringify(dg));
      await page.screenshot({ path: path.join(OUT, TAG+'-'+name+'.png'), clip:{x:390,y:170,width:500,height:380} });
    }
    console.log('shots written');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
