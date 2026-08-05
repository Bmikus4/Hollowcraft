// CREATURE SHADOWS IN DARK PLACES (Ben 07-29). Built stage, not found terrain — same reasoning as the shrub probe:
// a stone platform in open air at NIGHT, a torch to one side, an animal in the middle, and the camera on the far side
// so the animal's shadow would fall toward the lens. Then shoot the identical frame with the torch-shadow caster ON
// and OFF (__hc.owShadow) and diff. A shadow is hard to assert on directly; a controlled A/B on a frozen, de-grained
// frame makes "a dark shape appeared beside the animal, and only when a caster existed" measurable.
// usage: node bench/tmp-mobshadow.mjs [tag]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
const TAG = process.argv[2] || 'mobsh';
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
    await page.goto(base+'/index.html?debug=1&rd=6', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, {timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, {timeout:90000});
    await page.evaluate(`__hc.stillFrame(true)`);
    await page.evaluate(`__hc.setTime(0.72)`);              // full night: uDay 0, so the sun casts nothing and only a torch can
    await sleep(1800);
    console.log('night uDay', await page.evaluate(`__hc.seaColor().day`));

    // A pale stone stage well above the canopy: a light floor shows a shadow far better than dark grass.
    const st = await page.evaluate(`(()=>{ const P=__hc.pos(); const bx=Math.floor(P.x), bz=Math.floor(P.z);
      const y=__hc.surfH(bx,bz)+34;
      for(let dx=-9;dx<=9;dx++) for(let dz=-9;dz<=9;dz++) __hc.setBlockAt(bx+dx, y, bz+dz, 'stone');
      __hc.setBlockAt(bx-4, y+1, bz, 'torch');                       // the caster, off to one side
      return { bx, bz, y }; })()`);
    console.log('stage', JSON.stringify(st));

    // Camera close on the far side of the creature from the torch. A wider framing put the creature out of shot
    // entirely: __hc.put sets the mob's Y from the PLAYER's Y, so with the camera raised it spawned in mid-air and fell.
    await page.evaluate(`__hc.tp(${st.bx+5}, ${st.y+1}, ${st.bz})`);
    await sleep(600);
    await page.evaluate(`(()=>{ __hc.summon(); __hc.put(-3, 0); __hc.freeze(true,false); })()`);
    await sleep(1800);
    await page.evaluate(`__hc.look(${st.bx+2}, ${st.y+2}, ${st.bz})`);
    await sleep(1200);

    const report={};
    for(const n of [1,0]){
      const s = await page.evaluate(`__hc.owShadow(${n})`);
      await sleep(1400);   // let the cadence fire a shadow update
      report['casters'+n]=s;
      console.log('owShadow('+n+') ->', JSON.stringify(s));
      await page.screenshot({ path: path.join(OUT, TAG+'-'+(n?'on':'off')+'.png') });
      await page.screenshot({ path: path.join(OUT, TAG+'-'+(n?'on':'off')+'-crop.png'), clip:{x:330,y:150,width:620,height:460} });
    }
    fs.writeFileSync(path.join(OUT,TAG+'.json'), JSON.stringify(report,null,1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
