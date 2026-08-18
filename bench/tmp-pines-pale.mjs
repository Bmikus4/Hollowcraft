// WHAT PAINTS THE PALE OPAQUE MASS UNDER THE TREELINE.
//
// Ben's standing fault: "a huge PALE GREY band ... OPAQUE and drawn IN FRONT OF THE WORLD ... the inverse of your mask
// is being painted opaque." Deleting the crown wave (bbc7c62) did not remove it — it is still in frame at the shore
// vantage with the band drawing correctly above it. This turns each candidate off one at a time at ONE vantage and
// shoots the same frame, so the layer responsible is identified rather than inferred.
//
//   node bench/tmp-pines-pale.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// The pale mass is bright and almost colourless. Measure exactly that: over the lower-right quadrant, the fraction of
// pixels that are BOTH bright and near-neutral, which the dark blue sea is not and the sky above the horizon is not.
async function pale(page,file){
  const buf=fs.readFileSync(file).toString('base64');
  return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
    await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
    const g=c.getContext('2d'); g.drawImage(im,0,0);
    const W=im.width,H=im.height, x0=(W*0.45)|0, y0=(H*0.55)|0;
    const d=g.getImageData(x0,y0,W-x0,H-y0).data; let n=0,tot=0,ls=0;
    for(let i=0;i<d.length;i+=4){ const R=d[i],G=d[i+1],B=d[i+2];
      const mx=Math.max(R,G,B), mn=Math.min(R,G,B), L=0.2126*R+0.7152*G+0.0722*B;
      tot++; ls+=L; if(L>140 && (mx-mn)<42) n++; }
    return { paleFrac:+(n/tot).toFixed(4), meanLum:+(ls/tot).toFixed(1) }; })()`);
}

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.25);`);

    // The same vantage the pale mass was photographed at: the shore on the mask's strongest bearing, re-probed AFTER
    // the teleport because the mask is rebuilt around the player.
    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    const az=(await page.evaluate('__hc.pinesProbe()')).strongestBearing.azRad;
    const shore=await page.evaluate(`(()=>{ const dx=Math.cos(${az}), dz=Math.sin(${az});
      for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){ const x=Math.round(${IC.x}+dx*d), z=Math.round(${IC.z}+dz*d);
        if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z),d}; } return null; })()`);
    await page.evaluate(`__hc.tpAt(${shore.x}+0.5, ${shore.g}+1, ${shore.z}+0.5);`);
    for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2500);
    const pr2=await page.evaluate('__hc.pinesProbe()');
    await page.evaluate('__hc.cam({yaw:'+pr2.strongestBearing.lookYaw+', pitch:0});');
    await sleep(1500);
    console.log('vantage', JSON.stringify(shore), 'cell', pr2.strongestBearing.cell);

    const CASES=[
      ['all-on',        ''],
      ['pines-off',     '__hc.pines(0)'],
      ['ocean3-off',    '__hc.ocean3(false)'],
      ['ring-on',       '__hc.horizonBand({on:true})'],
    ];
    for(const [tag,cmd] of CASES){
      // Every case starts from the same known state, so one case cannot leak into the next.
      await page.evaluate('__hc.pines(1); __hc.ocean3(true); __hc.horizonBand({on:false});'); await sleep(900);
      if(cmd) await page.evaluate(cmd);
      await sleep(1200);
      // RE-ASSERT THE VANTAGE IMMEDIATELY BEFORE THE SHOT. The first cut of this let two seconds pass between cases
      // and the frames came back from different viewpoints — the diff then claimed the ocean plane was painting the
      // SKY, which is impossible and is how you know the control moved. Position and yaw are logged per shot so a
      // frame that drifted anyway is visible in the output rather than silently compared.
      await page.evaluate(`__hc.tpAt(${shore.x}+0.5, ${shore.g}+1, ${shore.z}+0.5); __hc.cam({yaw:`+pr2.strongestBearing.lookYaw+`, pitch:0});`);
      await sleep(600);
      const cam=await page.evaluate('__hc.pos()');
      const f=path.join(OUT,`pale-${tag}.png`); await page.screenshot({path:f});
      const p=await pale(page,f);
      console.log(`  ${tag.padEnd(12)} paleFrac ${String(p.paleFrac).padStart(7)}  meanLum ${String(p.meanLum).padStart(6)}`
                  + `  cam ${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.z.toFixed(1)} yaw ${cam.yaw.toFixed(3)}  -> ${path.basename(f)}`);
    }
    await page.evaluate('__hc.pines(1); __hc.ocean3(true); __hc.horizonBand({on:false});');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
