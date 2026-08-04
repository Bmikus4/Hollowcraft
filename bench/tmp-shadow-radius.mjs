// IS shadow.radius A LEVER IN THIS RENDERER? Plan Tier 1 item 4 says "sunLight.shadow.radius is untouched with a 46-block
// frustum", i.e. treats it as free softness waiting to be dialled in. three.js only honours it for PCFShadowMap and VSM; with
// PCFSoftShadowMap the filter uses a fixed tap pattern and the property is ignored. Before spending the item, measure whether
// changing it changes a pixel.
//
// RESULT: type is PCFSoftShadowMap, honoursRadius is false, and radius 1 -> 25 changes nothing. Radius is untouched in this
// renderer because it does nothing, not because nobody got to it. Buying penumbra means changing the FILTER, which is a GPU
// cost — see the §0 correction in the plan before doing that.
//
// THE PENUMBRA NUMBER BELOW IS NOT TRUSTWORTHY and no conclusion here rests on it. It takes the NARROWEST 10-90% transition in
// the crop, so it finds the sharpest edge in frame — a block boundary, a leaf, the column's own silhouette — rather than the
// shadow's edge, and duly reported 1-2 px for every setting including the PCF ones that do honour radius. Left in place, and
// left labelled, because the trap is worth more than the metric: an edge-width measurement has to be anchored to the edge you
// mean, and this one never was. The finding is the honoursRadius reading, which comes from the renderer, not from a pixel.
//
//   node bench/tmp-shadow-radius.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
// Scan one row across the frame; find the steepest dark→light run and report how many pixels it takes to go 10%→90%.
function penumbra(file, crop){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  let best=null;
  for(let y=y0;y<y1;y+=2){
    const row=[]; for(let x=x0;x<x1;x++) row.push(lum(P.data,(y*P.w+x)*P.ch));
    const lo=Math.min(...row), hi=Math.max(...row); if(hi-lo<18) continue;
    const t10=lo+(hi-lo)*0.10, t90=lo+(hi-lo)*0.90;
    // leftmost crossing of t10 followed by the next crossing of t90
    for(let i=0;i<row.length;i++){
      if(row[i]<=t10){ let j=i; while(j<row.length && row[j]<t90) j++;
        if(j<row.length){ const w=j-i; if(!best || w<best.width) best={ y, width:w, lo:+lo.toFixed(1), hi:+hi.toFixed(1) }; }
        break; } }
  }
  return best||{none:true};
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    console.log('  shadow state: '+JSON.stringify(await page.evaluate(`__hc.shadowSoft()`)));

    // A COLUMN ON FLAT GROUND, and the camera looking down at the shadow it throws. t=0.10 puts the sun ~34 degrees up, so the
    // shadow is long enough to have an edge well clear of the block itself.
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+3}, ${S.sz}+0.5); __hc.setTime(0.10);`); await sleep(1200);
    await page.evaluate(`(()=>{ for(let dy=0;dy<5;dy++) __hc.setBlock(3,dy,0,'stone'); })()`); await sleep(1200);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+9}, ${S.sz}+0.5); __hc.cam({yaw:-1.571, pitch:-0.75}); __hc.setTime(0.10);`);
    await sleep(1600);
    for(const cfg of [{t:"PCFSoft",r:1},{t:"PCF",r:1},{t:"PCF",r:4},{t:"PCF",r:9}]){ const r=cfg.r;
      const st=await page.evaluate(`__hc.shadowSoft({radius:${r}, type:"${cfg.t}"})`); await sleep(1200);
      await page.evaluate(`__hc.setTime(0.10)`); await sleep(900);
      const f=path.join(OUT,`shadowrad-${cfg.t}-${r}.png`); await page.screenshot({path:f});
      console.log(`  ${st.typeName} radius ${String(r).padStart(2)} (honoursRadius=${st.honoursRadius})  penumbra ${JSON.stringify(penumbra(f,[0.20,0.80,0.30,0.75]))}`);
    }
    await page.evaluate(`__hc.shadowSoft({radius:1})`);
    console.log('  frames: bench/results/shadowrad-*.png');
    console.log('DONE');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
