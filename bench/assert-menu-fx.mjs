// ASSERT: the main menu is a LIT, WET, SOUNDING STILL and the world is not drawn behind it (Ben 08-11).
//
// Four claims, and each needs a different instrument:
//   1. NO CINEMATIC. Not "the art is on top of it" — the engine must not be drawing the world at all. Measured as
//      renderer draw calls per frame while the menu is up, which is zero only if the composer never runs.
//   2. THE GLOWS LAND ON THEIR LAMPS. The art is object-fit:cover, so the hotspots are pinned to the ART's rectangle,
//      not the window's. Checked at three aspect ratios: the cover rect must always cover the viewport exactly.
//   3. IT IS RAINING. A screenshot cannot tell a moving drop field from a frozen one — two frames, differenced.
//   4. IT IS SOUNDING. Audio has no pixels: read the bed's own state through __hc.menuFx().
//
// usage: node bench/assert-menu-fx.mjs   -> bench/results/menu-fx-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\Code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(46)+' got='+JSON.stringify(got)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const errs=[];
    const SIZES=[{width:1280,height:720},{width:1920,height:820},{width:900,height:1000}];
    for(const vp of SIZES){
      const ctx=await browser.newContext({ viewport:vp }); const page=await ctx.newPage();
      page.on('pageerror',e=>errs.push('PAGEERROR '+(e&&e.stack||e)));
      await page.goto(base+'/index.html',{waitUntil:'load'});
      await sleep(5000);
      const fx=await page.evaluate(()=>window.__hc.menuFx());
      const tag=vp.width+'x'+vp.height;
      console.log('\n['+tag+']');
      ok('fx running',            fx.on===true, fx.on);
      ok('every hotspot built',   fx.glows>=14, fx.glows);
      ok('drop field seeded',     fx.drops>200, fx.drops);
      // THE COVER RECT MUST COVER. left<=0, top<=0 and the far edges past the viewport is exactly object-fit:cover:
      // if either were positive the art would not fill the screen and the glows would sit inside a letterbox.
      const L=parseFloat(fx.rect.x), T=parseFloat(fx.rect.y), W=parseFloat(fx.rect.w), H=parseFloat(fx.rect.h);
      ok('art covers the viewport', L<=0.5 && T<=0.5 && L+W>=vp.width-0.5 && T+H>=vp.height-0.5, {L:+L.toFixed(1),T:+T.toFixed(1),W:+W.toFixed(1),H:+H.toFixed(1)});
      ok('art aspect preserved',  Math.abs(W/H - 1672/941) < 0.01, +(W/H).toFixed(4));
      // THE WORLD IS NOT BEING DRAWN. drawProbe would itself render, so this reads the live counter across a second of
      // frames instead: with the composer skipped, renderer.info.render.calls stops moving.
      const calls=await page.evaluate(async()=>{ const a=window.__hc.menuFx().drawCalls; await new Promise(r=>setTimeout(r,1000)); return {a,b:window.__hc.menuFx().drawCalls}; });
      ok('no world drawn behind the menu', calls.a===calls.b, calls);
      // IT IS ACTUALLY RAINING: two grabs of the rain canvas a moment apart must differ.
      const moved=await page.evaluate(async()=>{ const c=document.getElementById('rainfar'), g=c.getContext('2d');
        const a=g.getImageData(0,0,c.width,Math.min(200,c.height)).data;
        await new Promise(r=>setTimeout(r,260));
        const b=g.getImageData(0,0,c.width,Math.min(200,c.height)).data;
        let d=0; for(let i=3;i<a.length;i+=4) if(a[i]!==b[i]) d++; return d; });
      ok('rain is moving',        moved>500, moved);
      await page.screenshot({path:path.join(OUT,'menu-fx-'+tag+'.png')});
      if(vp.width===1280){
        // THE AMBIENCE. Headless mutes the output but the graph is real, so the bed can still be counted.
        // A KEYPRESS, NOT A CLICK, for the gesture audio needs: a click anywhere on #boot is a click the menu may act
        // on, and an earlier version of this bench started the game with it and then measured the load sequence from
        // the wrong instant — the plate had already been up for three seconds when it thought it had just pressed play.
        await page.keyboard.press('Shift');
        await sleep(2500);
        const a2=await page.evaluate(()=>window.__hc.menuFx().audio);
        ok('audio graph up',      !!(a2&&a2.ctx), a2&&a2.state);
        ok('rain bed running',    !!(a2&&a2.beds===2), a2&&a2.beds);
        ok('ambient one-shots armed', !!(a2&&a2.timers>=4), a2&&a2.timers);
      }
      await ctx.close();
    }
    // THE LOAD SEQUENCE GETS A PAGE OF ITS OWN, four seconds old, because it is a claim about TIME. Measured on the
    // page the checks above had been probing for fifteen seconds, the world was already meshed when play was pressed —
    // so the plate released inside a second and there was no sequence left to measure. That is a real (good) outcome
    // for a warmed menu, and useless as a test of the blackout.
    {
      const ctx=await browser.newContext({ viewport:{width:1280,height:720} }); const page=await ctx.newPage();
      page.on('pageerror',e=>errs.push('PAGEERROR '+(e&&e.stack||e)));
      await page.goto(base+'/index.html',{waitUntil:'load'});
      await sleep(4000);
      console.log('\n[load sequence]');
      // getComputedStyle on the black layer is only meaningful while the plate is DISPLAYED: a transition on a
      // display:none element does not run, so its opacity jumps straight to the target and reads 1 the moment the
      // plate is dismissed. Every assertion below is therefore paired with the plate's own visibility.
      const plate=()=>page.evaluate(()=>({ vis:getComputedStyle(document.getElementById('load')).display,
        black:+getComputedStyle(document.getElementById('loadblack')).opacity,
        done:window.__hc.loadState().circleDone }));
      const t0=Date.now();
      await page.click('#mb-solo');
      await sleep(900);
      const early=await plate(); await page.screenshot({path:path.join(OUT,'menu-fx-load-0.9s.png')});
      ok('plate opens on the ART',  early.vis!=='none' && early.black<0.05, early);
      await sleep(2200);
      const mid=await plate(); await page.screenshot({path:path.join(OUT,'menu-fx-load-3.1s.png')});
      ok('black by ~3.1s',          mid.done || mid.black>0.9, mid);
      while(!(await plate()).done && Date.now()-t0<45000) await sleep(200);
      ok('the world arrives',       (await plate()).done, ((Date.now()-t0)/1000).toFixed(1)+'s after play');
      await sleep(1200);
      await page.screenshot({path:path.join(OUT,'menu-fx-load-done.png')});
      const gone=await page.evaluate(()=>getComputedStyle(document.getElementById('load')).display);
      ok('plate is gone after the fade', gone==='none', gone);
      const fxOff=await page.evaluate(()=>window.__hc.menuFx());
      ok('menu fx torn down on play', fxOff.on===false && fxOff.audio===null, {on:fxOff.on,audio:fxOff.audio});
      await ctx.close();
    }
    if(errs.length){ console.log('\n--- page errors ---'); for(const e of errs.slice(0,10)) console.log(e); }
    ok('no page errors', errs.length===0, errs.length);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\n'+(fails?'FAILED ':'PASSED ')+(checks-fails)+'/'+checks);
  process.exit(fails?1:0);
})();
