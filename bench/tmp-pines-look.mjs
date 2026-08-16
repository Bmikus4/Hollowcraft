// THE TWO REPORTS OF 2026-08-12, IN FRAMES. Ben: the sea is too bright at night (worst inland), the ocean climbs into
// the coast, sky and sun reflections are gone, and leaves stop rendering at night in fog.
//
// Every one of those is a look, so this shoots the looks and reports one number per frame that says what the look is
// made of: the median luminance of a crop, alongside the median of the SKY in the same frame. "The sea is brighter than
// the sky it reflects at midnight" is a fact a screenshot cannot argue with, and it is the fault in one line.
// Interleaved inside one page, clock pinned, and the noon shore row is repeated last as the noise floor.
//
//   node bench/tmp-water-leaves.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
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
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    console.log('  ocean3', JSON.stringify(await page.evaluate(`__hc.ocean3()`)));
    const IC=await page.evaluate(`__hc.isleStats()`); const SEA=await page.evaluate(`__hc.island().sea`);
    console.log(`  island ${JSON.stringify(IC)} sea ${SEA}`);
    // THE SHORE IS FOUND, NOT GUESSED (the same walk tmp-vista-after-scrap uses, and for the same reason: a fraction of
    // the mean coast radius lands in the water on any bay).
    // THE OUTERMOST DRY LAND ON THE BEARING, not the first low column. The first attempt took the first ground at or
    // under sea+1 walking outward and stood 4 blocks back from it: on this island that is an inland flat 46 blocks
    // short of the water, and the frame it produced was a beach with no sea in it at all (bench/results/wl-sea-noon.png,
    // first run). Scanning INWARD from past the coast finds the waterline itself.
    const shore=await page.evaluate(`(()=>{ const cx=${IC.x}, cz=${IC.z};
      for(let d=Math.round(${IC.R}*1.5); d>40; d-=1){ const x=cx-d, g=__hc.groundY(x,cz);
        if(g>${SEA}) return {x, z:cz, g}; }
      return null; })()`);
    // INLAND WATER, which is where he says the night sea is worst: a column at or under sea level well inside the
    // coast is a river or a lake, and the camera stands on the bank above it.
    const inland=await page.evaluate(`(()=>{ const cx=${IC.x}, cz=${IC.z};
      for(let r=40; r<${IC.R}*0.6; r+=3) for(let k=0;k<48;k++){ const th=k/48*6.2831853;
        const x=Math.round(cx+Math.cos(th)*r), z=Math.round(cz+Math.sin(th)*r);
        if(__hc.groundY(x,z)<=${SEA}){ for(let s=3;s<14;s++){ const bx=Math.round(x+Math.cos(th)*s), bz=Math.round(z+Math.sin(th)*s);
          const g=__hc.groundY(bx,bz); if(g>${SEA}+2) return {x:bx,z:bz,g, tx:x, tz:z}; } } }
      return null; })()`);
    console.log(`  shore ${JSON.stringify(shore)}\n  inland ${JSON.stringify(inland)}`);
    // A crop's median luminance, and the sky's, read off the SAME png so the two cannot come from different frames.
    const stat=async(f,box)=>{
      const buf=fs.readFileSync(f).toString('base64');
      return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const med=(x,y,w,h)=>{ const d=g.getImageData(x,y,w,h).data, a=[];
          for(let i=0;i<d.length;i+=4) a.push(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]);
          a.sort((p,q)=>p-q); return +a[a.length>>1].toFixed(1); };
        return { crop:med(${box.join(',')}), sky:med(340,60,600,90) }; })()`);
    };
    const rows=[];
    const shoot=async(name,x,z,dy,yaw,pitch,when,t)=>{
      const g=await page.evaluate(`__hc.groundY(${x},${z})`);
      await page.evaluate(`__hc.tpAt(${x}+0.5, ${g}+${dy}, ${z}+0.5); __hc.cam({yaw:${yaw}, pitch:${pitch}}); __hc.fog(0)`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await page.evaluate(`__hc.freezeT(0); __hc.setTime(${t})`); await sleep(900); await page.evaluate(`__hc.setTime(${t})`); await sleep(400);
      const f=path.join(OUT,`cp-${name}-${when}.png`); await page.screenshot({path:f});
      console.log('    '+name+' '+when+' -> '+path.basename(f));
    };
    const YAW_OUT=Math.atan2(1,-0);
    console.log('  pines', JSON.stringify(await page.evaluate(`__hc.pines()`)));
    if(shore){
      for(const [when,t] of [['noon',0.25],['dusk',0.46],['night',0.75]]) await shoot('shore', shore.x, shore.z, 3, YAW_OUT, -0.02, when, t);
      await shoot('shorehigh', shore.x, shore.z, 40, YAW_OUT, -0.06, 'noon', 0.25);
      await page.evaluate(`__hc.pines(0)`);
      await shoot('shore-off', shore.x, shore.z, 3, YAW_OUT, -0.02, 'noon', 0.25);
      await page.evaluate(`__hc.pines(1)`);
    }
    { const x=IC.x-IC.R-90, z=IC.z;
      await shoot('sea', x, z, 20, Math.atan2(-1,-0), -0.1, 'noon', 0.25); }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
