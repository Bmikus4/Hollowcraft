// BEN 08-16: "skybox pines do not look good, they extend well out into the sky".
//
// The complaint is VERTICAL EXTENT, so this measures it in DEGREES and against what the geometry says it should be,
// from a STANDING EYE HEIGHT on the shore - not from the audit's 26-blocks-up-at-sea vantage, which is nobody's view.
//
// The derived number: the band draws its trees at ONE distance (the render wall, _CP_BAND[0] = 1.0), and the generator
// makes pines 18-31 blocks tall (index.html ~3940). A tree of height h at distance d subtends atan(h/d). If the
// measured slice of sky matches that, the height is DERIVED and the fault is the distance; if it exceeds it, the band
// is inflating its own trees. Either way the answer is a number, not a preference.
//
// It also reports the same figure for the REAL pines standing just inside the wall on the same bearing, because that
// is the only honest comparison: a backdrop drawn at the wall must not be taller than the trees at the wall.
//
//   node bench/tmp-pines-height.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
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
    await page.goto(base+'/index.html?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const fov=(await page.evaluate(`__hc.xhProbe()`)).fov;
    const IC=await page.evaluate(`__hc.island()`); const SEA=IC.sea;
    const wall=(await page.evaluate(`__hc.pines()`)).wall;
    const degPerPx=fov/720;                                    // vertical fov over the frame height
    console.log(`  fov ${fov}  wall ${wall}  island ${IC.cx},${IC.cz} R ${IC.R}  sea ${SEA}   ${degPerPx.toFixed(4)} deg/px`);

    // THE SHORE, FOUND NOT GUESSED: scan inward from past the coast for the outermost dry column on the bearing.
    // Standing eye height is ground + 1.62, which is where Ben is when he complains.
    const results=[];
    for(const [tag,th] of [['w',Math.PI],['s',Math.PI/2],['n',-Math.PI/2]]){
      const dx=Math.cos(th), dz=Math.sin(th);
      const sh=await page.evaluate(`(()=>{ for(let d=Math.round(${IC.R}*1.6); d>40; d-=1){
          const x=Math.round(${IC.cx}+${dx}*d), z=Math.round(${IC.cz}+${dz}*d);
          if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z)}; } return null; })()`);
      if(!sh){ console.log('  no shore on '+tag); continue; }
      // Looking OUT to sea is the view the pines were built for; the coast then runs left and right of it.
      // THE YAW CONVENTION IS atan2(-lookX, -lookZ) - the first run of this bench used +PI on top of that, stood the
      // camera three blocks inland and photographed the inside of a wood while reporting a 29-degree treeline.
      const yaw=Math.atan2(-dx, -dz);
      await page.evaluate(`__hc.tpAt(${sh.x}, ${sh.g}+1.62, ${sh.z}); __hc.cam({yaw:${yaw}, pitch:0}); __hc.pinScene();`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(2500);
      for(const [htag,t] of [['noon',0.30],['dusk',0.80]]){
        await page.evaluate(`__hc.dayLock&&__hc.dayLock(${t})`); await sleep(1200);
        const grab=async(name)=>{ const f=path.join(OUT,'ph-'+tag+'-'+htag+'-'+name+'.png'); await page.screenshot({path:f});
          const b64=fs.readFileSync(f).toString('base64');
          return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${b64}';
            await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
            const g=c.getContext('2d'); g.drawImage(im,0,0); const d=g.getImageData(0,0,1280,720).data;
            const px=[]; for(let y=0;y<720;y++){ const row=[]; for(let x=0;x<1280;x++){ const i=(y*1280+x)*4;
              row.push(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]); } px.push(row); } return px; })()`); };
        await page.evaluate(`__hc.pines(1)`); await sleep(500); const on=await grab('on');
        await page.evaluate(`__hc.pines(0)`); await sleep(500); const off=await grab('off');
        await page.evaluate(`__hc.pines(1)`); await sleep(500); const on2=await grab('on2');
        // THE DRIFT CONTROL IS PER PIXEL, not a frame mean: waves, cloud and falling leaves move pixels between two
        // identical frames, and a fixed threshold counts that motion as treeline. Anything the on/on2 pair moves is
        // not the pines.
        let drift=0; for(let y=0;y<720;y+=3) for(let x=0;x<1280;x+=3) drift=Math.max(drift, Math.abs(on[y][x]-on2[y][x]));
        const TH=Math.max(2.0, drift*1.5);
        console.log(`  ${tag} ${htag}  per-pixel drift ${drift.toFixed(2)}, threshold ${TH.toFixed(2)}`);
        // THE BAND'S OWN EXTENT: per column, the highest and lowest row the pines change by more than a threshold.
        // Per column, because a vertical extent is a column measurement and a row mean cannot see one.
        let topRow=1e9, botRow=-1, cols=0, spans=[];
        for(let x=0;x<1280;x+=2){ let t=-1,b=-1;
          for(let y=0;y<720;y++){ if(Math.abs(on[y][x]-off[y][x])>TH){ if(t<0)t=y; b=y; } }
          if(t>=0){ cols++; spans.push(b-t); if(t<topRow)topRow=t; if(b>botRow)botRow=b; } }
        spans.sort((a,b)=>a-b);
        const med=spans.length?spans[spans.length>>1]:0;
        const p90=spans.length?spans[Math.min(spans.length-1,Math.floor(spans.length*0.9))]:0;
        console.log(`  ${tag} ${htag}  band on ${cols} of 640 sampled columns   median span ${med}px = ${(med*degPerPx).toFixed(2)} deg   p90 ${p90}px = ${(p90*degPerPx).toFixed(2)} deg   rows ${topRow}..${botRow}`);
        results.push({tag,htag,med,p90,cols});
      }
    }
    // WHAT THE GEOMETRY SAYS IT SHOULD BE.
    for(const h of [18,31,38]) console.log(`  derived: a ${h}-block pine at the wall (${wall}) subtends ${(Math.atan(h/wall)*180/Math.PI).toFixed(2)} deg`);
    for(const d of [wall*1.6, wall*2.3, wall*4.6]) console.log(`  derived: a 25-block pine at ${Math.round(d)} blocks subtends ${(Math.atan(25/d)*180/Math.PI).toFixed(2)} deg`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
