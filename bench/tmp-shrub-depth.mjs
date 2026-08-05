// IS A SHRUB SEATED ON THE GROUND OR SUNK INTO IT? A decisive geometric test instead of an opinion.
//
// Put the EYE exactly at the height of the ground's top face and look horizontally. The ground plane then projects to
// the exact vertical centre of the frame. Anything standing ON the ground must render ABOVE centre; anything below
// centre is below the ground line. So the measurement is simply: what is the lowest and highest frame row containing
// this plant's pixels, relative to centre. Run for bush plus fern/tallgrass as controls, on a built stone platform
// (deterministic, lit, no slope) and again on real generated forest ground.
//
// Ben has reported shrubs one block deep twice. The previous check was vacuous: its "pristine" control reported
// deco=0 across 2025 columns, which is impossible in forest, so ordinary terrain was never actually tested.
// usage: node bench/tmp-shrub-depth.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
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

// Find rows containing "plant" pixels: greener than the flat stone/grass backdrop by a margin, inside a centre window.
function plantRows(file, x0f, x1f){
  const img = decodePNG(fs.readFileSync(file));
  const { w,h,ch,data } = img;
  const x0=Math.round(w*x0f), x1=Math.round(w*x1f);
  // reference: the column strip's own median colour per row is the backdrop; a plant is a local departure toward green
  const rows=[];
  for(let y=0;y<h;y++){
    let hits=0;
    for(let x=x0;x<x1;x++){ const i=(y*w+x)*ch, r=data[i], g=data[i+1], b=data[i+2];
      if(g>r+14 && g>b+10 && g>18) hits++; }          // green-dominant = foliage, not stone/sand/sky
    rows.push(hits);
  }
  const centre=Math.round(h/2);
  let top=-1, bot=-1, total=0;
  for(let y=0;y<h;y++){ if(rows[y]>=3){ if(top<0)top=y; bot=y; total+=rows[y]; } }
  return { centre, top, bot, px:total,
           topAboveCentre: top<0?null:centre-top, botAboveCentre: bot<0?null:centre-bot };
}

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
    await page.goto(base+'/index.html?debug=1&rd=6', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, {timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, {timeout:90000});
    await page.evaluate(`__hc.stillFrame(true)`);
    await page.evaluate(`__hc.setTime(0.42)`);
    await sleep(1500);
    const EYE = await page.evaluate(`(()=>{ const P=__hc.pos(); return 1.62; })()`);

    // ---- BUILT PLATFORM: stone slab high in open air, plants on top, one plant per shot dead centre ----
    const st = await page.evaluate(`(()=>{ const P=__hc.pos(); const bx=Math.floor(P.x), bz=Math.floor(P.z);
      const y=__hc.surfH(bx,bz)+34;   // stone floor, not grass: grass is green and the foliage detector cannot tell it from a plant
      for(let dx=-6;dx<=6;dx++) for(let dz=-14;dz<=6;dz++) __hc.setBlockAt(bx+dx,y,bz+dz,'stone');
      // A STONE BACKDROP WALL 3 blocks behind the plant. With the eye exactly IN the ground plane the floor is edge-on
      // and invisible, so everything below centre was distant forest — green, and the detector counted it as plant,
      // reporting every plant as extending 250+ rows underground. With a wall filling the frame, green == plant.
      for(let dx=-6;dx<=6;dx++) for(let dy=-2;dy<=6;dy++) __hc.setBlockAt(bx+dx, y+dy, bz-3, 'stone');
      return { bx, bz, y }; })()`);
    console.log('platform grass block index y='+st.y+'  (its TOP FACE is at y='+(st.y+1)+')');

    for(const kind of ['bush','fern','tallgrass']){
      await page.evaluate(`(()=>{ for(const k of ['bush','fern','tallgrass']) __hc.setBlockAt(${st.bx}, ${st.y+1}, ${st.bz}, 0);
        __hc.setBlockAt(${st.bx}, ${st.y+1}, ${st.bz}, '${kind}'); })()`);
      // EYE exactly on the ground's top face -> ground plane lands on the frame's vertical centre
      await page.evaluate(`__hc.tpAt(${st.bx}, ${st.y+1-EYE}, ${st.bz+6})`);
      await sleep(700);
      await page.evaluate(`__hc.cam({yaw:0, pitch:0})`);
      await sleep(1100);
      const f = path.join(OUT,'sd-plat-'+kind+'.png');
      await page.screenshot({ path:f });
      const m = plantRows(f, 0.47, 0.53);
      console.log('  '+kind.padEnd(11)+' rows '+m.top+'..'+m.bot+'  centre '+m.centre+
                  '  topAboveCentre '+m.topAboveCentre+'  botAboveCentre '+m.botAboveCentre+'  px '+m.px);
    }
    console.log('  (botAboveCentre <= 0 means the plant extends BELOW the ground line = sunk)');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
