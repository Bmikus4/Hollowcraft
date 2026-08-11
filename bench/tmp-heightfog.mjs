// HEIGHT FOG, OFF AND ON, AT THE VANTAGES WHERE IT SHOULD AND SHOULD NOT SHOW.
//
// The pass is shipped off and is not even in the composer chain until it is turned on, so the first question is whether
// it turns on at all — `inChain:false` with a note is the honest failure here, and it is the likely one, because the
// pass needs the depth attachment that only exists on the motion-blur path.
//
// THREE THINGS HAVE TO BE TRUE AT ONCE and one vantage cannot show them:
//   · a valley from above reads as depth rather than as a grey wash        (shore, elevated)
//   · a wood at eye level does NOT turn into soup                          (forest)
//   · the sky is untouched, because three tuned horizon layers own it      (measured on the sky band only)
// The sky check is the one worth automating: uSky ships at 0, so the top of the frame must be identical off and on, to
// the digit, and if it is not then the pass is bleeding into a part of the image it was told not to draw on.
//
//   node bench/tmp-heightfog.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
function band(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let s=0,n=0; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
  return +(s/n).toFixed(2);
}
const SKY=[0.05,0.95,0.02,0.14], MID=[0.10,0.90,0.35,0.65], NEAR=[0.20,0.80,0.75,0.95];
// THE FIRST SWEEP SATURATED BEFORE ITS LIGHTEST ROW. density 0.018 / 0.030 / 0.060 gave a near band of 177 / 180 / 181
// against 80 with the pass off - three settings that are all the same wall of grey. Looking DOWN a ray descends into
// ever-denser air, so the integral grows fast, and the useful range turned out to be an order of magnitude below where
// this started. These values are chosen to bracket "can you see it at all" rather than "which thickness".
const CFGS=[
  ['off',      null],
  ['0.001',    {density:0.0010, falloff:0.055, aniso:0.45}],
  ['0.003',    {density:0.0030, falloff:0.055, aniso:0.45}],
  ['0.006',    {density:0.0060, falloff:0.055, aniso:0.55}],
  ['0.012',    {density:0.0120, falloff:0.055, aniso:0.55}],
  ['off',      null],
];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    page.on('console',m=>{ const t=m.text(); if(/ERROR: 0:|GL_INVALID|shader/i.test(t)) console.log('  GLSL:',t.slice(0,300)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(HELPERS);
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cinema(true); __hc.freezeAnimals(true); __hc.holdNone();`);
    console.log(`  turning it on: ${JSON.stringify(await page.evaluate(`__hc.heightFog({on:true})`))}`);
    for(const [vname, go] of [
      ['shore_high', `H.setTime(0.44); goShore(); { const p=__hc.pos(); __hc.tpAt(p.x,p.y+38,p.z); } H.cam({yaw:0.7, pitch:-0.16});`],
      ['forest_eye', `H.setTime(0.35); goForest(); { const p=__hc.pos(); __hc.tpAt(p.x,p.y+14,p.z); } H.cam({yaw:0.7, pitch:-0.30});`],
    ]){
      console.log(`  === ${vname}`);
      await page.evaluate(`(function(){ ${go} })()`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(3500);
      for(const [label,cfg] of CFGS){
        await page.evaluate(cfg? `__hc.heightFog(${JSON.stringify(Object.assign({amt:1},cfg))})` : `__hc.heightFog({amt:0})`);
        await sleep(500);
        const f=path.join(OUT,`hfog-${vname}-${label}.png`); await page.screenshot({path:f});
        console.log(`    ${label.padEnd(12)} sky ${String(band(f,SKY)).padEnd(7)} mid ${String(band(f,MID)).padEnd(7)} near ${band(f,NEAR)}`);
      }
    }
    await page.evaluate(`__hc.heightFog({on:false})`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
