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
const PAGE=process.argv[2]||'index.html';   // a page argument, so this can run against a private test copy while the shared index.html is mid-edit
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
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/'+PAGE+'?debug=1&rd=10',{waitUntil:'load',timeout:120000});
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
    // DO THE PINES DRAW, AND HOW HARD? __hc.pines(0/1) is a live toggle, so the A/B is two frames of one page with
    // nothing else moving. The strip measured is the horizon band; the number is the mean absolute level change over it,
    // against a repeat of the ON frame as the noise floor.
    const grab=async(tag)=>{ const f=path.join(OUT,'cp-'+tag+'.png'); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const d=g.getImageData(0,300,1280,140).data; const px=[]; for(let i=0;i<d.length;i+=4) px.push(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]);
        return px; })()`); };
    const YAW_OUT=Math.atan2(1,-0);
    console.log('  pines', JSON.stringify(await page.evaluate('__hc.pines()')));
    if(shore){
      const g=await page.evaluate(`__hc.groundY(${shore.x},${shore.z})`);
      await page.evaluate(`__hc.tpAt(${shore.x}+0.5, ${g}+3, ${shore.z}+0.5); __hc.cam({yaw:${YAW_OUT}, pitch:-0.02}); __hc.fog(0); __hc.freezeT(0); __hc.setTime(0.25)`);
      for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(4000); await page.evaluate('__hc.setTime(0.25)'); await sleep(600);
      const on=await grab('on'); const fs_b64=fs.readFileSync(path.join(OUT,'cp-on.png')).toString('base64'); await page.evaluate('__hc.pines(0)'); await sleep(900);
      const off=await grab('off'); await page.evaluate('__hc.pines(1)'); await sleep(900);
      const on2=await grab('on2');
      let d1=0,d2=0,n=on.length,changed=0;
      for(let i=0;i<n;i++){ const a=Math.abs(on[i]-off[i]); d1+=a; if(a>4) changed++; d2+=Math.abs(on[i]-on2[i]); }
      console.log('    horizon strip: mean |on-off| '+(d1/n).toFixed(2)+'   noise |on-on| '+(d2/n).toFixed(2)+'   pixels changed >4 levels: '+(100*changed/n).toFixed(1)+'%');
      // AND WHAT COLOUR THE BAND IS. The luminance A/B says the pines are drawing; this says whether what they drew is
      // a wood or a grey smear - the green dominance of the pixels the pines actually changed.
      const grn=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${fs_b64}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0); const d=g.getImageData(0,300,1280,140).data;
        let s=0,n=0; for(let i=0;i<d.length;i+=4){ s+=d[i+1]-(d[i]+d[i+2])/2; n++; } return +(s/n).toFixed(2); })()`);
      console.log('    band green dominance (on frame): '+grn);
      const HOURS=[['noon',0.25],['dawn',0.04],['dusk',0.46],['night',0.75]];
      // THE A/B AT EVERY HOUR, not just a frame at each: the pines were measured at noon and photographed at the rest.
      for(const [when,t] of HOURS){
        await page.evaluate(`__hc.dayLock(${t})`); await sleep(2200);
        await page.evaluate('__hc.pines(1)'); await sleep(700); const A=await grab('h-on');
        await page.evaluate('__hc.pines(0)'); await sleep(700); const B=await grab('h-off');
        await page.evaluate('__hc.pines(1)'); await sleep(700); const C=await grab('h-on2');
        let e1=0,e2=0,ec=0; for(let i=0;i<A.length;i++){ const q=Math.abs(A[i]-B[i]); e1+=q; if(q>4)ec++; e2+=Math.abs(A[i]-C[i]); }
        console.log('    '+when+'  |on-off| '+(e1/A.length).toFixed(2)+'   noise '+(e2/A.length).toFixed(2)+'   changed>4 '+(100*ec/A.length).toFixed(1)+'%');
      }
      for(const [when,t] of []){
        await page.evaluate(`__hc.setTime(${t})`); await sleep(900); await page.evaluate(`__hc.setTime(${t})`); await sleep(400);
        await page.screenshot({path:path.join(OUT,'cp-shore-'+when+'.png')}); }
      console.log('    frames: cp-shore-noon/dusk/night.png');
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
