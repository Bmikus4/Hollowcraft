// PROBE: is there an ARM under the offhand shield, and is it SEEN? The board hung in the air with no body attached.
//
// A boolean is not evidence here. The offhand shield reported offView='shield' with a real mesh and the right tag for a
// day while sitting inside the near plane and being clipped away every frame. So this pins the scene, photographs the
// empty left hand as a BASELINE, and counts how many pixels of the lower-left crop CHANGE per state. The scene is
// pinned, so a changed pixel in that crop is the left-hand rig and nothing else.
//
// MEASURE THE PNG, NOT THE CANVAS. The first version of this probe read the canvas in-page with drawImage +
// getImageData and reported 0 changed pixels for a shield plainly visible in the screenshot: a WebGL canvas without
// preserveDrawingBuffer reads back CLEARED outside its own draw call. page.screenshot() composites properly, so the
// frame is decoded here instead.
//
// The board is also photographed with hideBoard, because at its shipped scale (1.55) it covers the lower-left of the
// frame outright -- an arm behind it cannot be seen however correct it is.
//
// usage: node bench/tmp-offarm.mjs   -> bench/results/offarm-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

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

// Lower-left crop only: x < 42% of width, y > 42% of height. The main hand lives on the RIGHT and must not be counted.
const CROP = img => { const {w,h}=img; return { x0:0, y0:Math.floor(h*0.42), x1:Math.floor(w*0.42), y1:h }; };
function diffPx(a,b){ const c=CROP(a); let n=0;
  for(let y=c.y0;y<c.y1;y++) for(let x=c.x0;x<c.x1;x++){
    const i=(y*a.w+x)*a.ch, j=(y*b.w+x)*b.ch;
    if(Math.abs(a.data[i]-b.data[j])+Math.abs(a.data[i+1]-b.data[j+1])+Math.abs(a.data[i+2]-b.data[j+2]) > 24) n++; }
  return n; }
function cropArea(img){ const c=CROP(img); return (c.x1-c.x0)*(c.y1-c.y0); }

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
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.setTime(0.42)');
    await page.evaluate('__hc.pinScene()');
    await sleep(1500);

    const shots={};
    const shoot=async(name)=>{ const p=path.join(OUT,'offarm-'+name+'.png'); await page.screenshot({path:p}); shots[name]=decodePNG(fs.readFileSync(p)); return shots[name]; };

    // BASELINE, twice. pinScene stops the clock, NOT the water and foliage animation: the first version of this probe
    // reported 26.8% of the crop "changed" by the arm while the screenshot showed an empty corner -- it was measuring
    // the sea. Two empty frames a second apart give the noise floor any real finding has to beat.
    await page.evaluate('__hc.shieldHold("none")'); await sleep(1000);
    await shoot('empty0'); await sleep(1000);
    const B = await shoot('empty');
    const NOISE = diffPx(shots.empty0,B);
    console.log('lower-left crop = '+cropArea(B)+' px of '+(B.w*B.h)+'   NOISE FLOOR (two empty frames) = '+NOISE+' px = '+(100*NOISE/cropArea(B)).toFixed(2)+'%');

    // ARM ALONE, TINTED. The board is taken away and the limb is painted magenta -- a hue this world has nowhere, since
    // every terrain tone is either r>g>b (earth, wood, sand) or b>=g>r (sea, sky). Magenta needs r and b high with g far
    // below both, so a magenta pixel is the arm and can be nothing else. No noise floor to beat.
    const magenta = img => { let n=0, minx=1e9, maxx=-1, miny=1e9, maxy=-1;
      for(let y=0;y<img.h;y++) for(let x=0;x<img.w;x++){ const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2];
        if(r>80 && b>80 && g < Math.min(r,b)*0.5){ n++; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; } }
      return {n, box:n?[minx,miny,maxx,maxy]:null}; };
    await page.evaluate('__hc.shieldHold("off")'); await sleep(900);
    console.log('rig: '+JSON.stringify(await page.evaluate('__hc.offRig({hideBoard:true,armTint:"#ff00ff"})')));
    await sleep(700);
    const A = await shoot('alone');
    const M = magenta(A), M0 = magenta(B);
    console.log('ARM ALONE   magenta px = '+M.n+' (control, empty hand = '+M0.n+')   box='+JSON.stringify(M.box)
      +'   '+(M.n > 400 && M0.n < 100 ? 'ARM IS IN FRAME' : 'ARM NOT SEEN'));

    // HIDE PATH, measured the same decisive way while the arm is still tinted: turn the HUD off and the magenta must go
    // to zero. A crop diff cannot answer this one either -- switching the HUD off also removes the compass and hotbar,
    // which sit in this very crop and would swamp it.
    const onS=await page.evaluate('__hc.shield()');
    await page.evaluate('(()=>{ try{ return __hc.hud? __hc.hud(false) : "no hook"; }catch(e){ return String(e.message||e); } })()');
    await sleep(700);
    const offS=await page.evaluate('__hc.shield()');
    const H=await shoot('hudoff');
    const MH=magenta(H);
    console.log('HUD OFF     magenta px = '+MH.n+'   booleans: board '+onS.offGroupVisible+' -> '+offS.offGroupVisible
      +', arm '+onS.armVisible+' -> '+offS.armVisible+'   '+(MH.n===0?'RIG GONE FROM THE FRAME':'STILL DRAWN'));

    // The board back with a real flesh arm, at the shipped scale and two smaller ones. Ben picks; these are the pictures.
    await page.evaluate('(()=>{ try{ return __hc.hud? __hc.hud(true) : "no hook"; }catch(e){ return String(e.message||e); } })()');
    await sleep(500);
    await page.evaluate('__hc.offRig({rebuildArm:true,hideBoard:false})'); await sleep(500);
    for(const s of [1.55, 1.05, 0.75]){
      await page.evaluate('__hc.offRig({hideBoard:false,scale:'+s+'})');
      await sleep(700);
      const G = await shoot('scale-'+String(s).replace('.','_'));
      console.log('scale '+s+'  frame taken; magenta left over = '+magenta(G).n+' (must be 0 -- the flesh arm is back)');
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
