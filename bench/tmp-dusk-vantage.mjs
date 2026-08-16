// THE DUSK VANTAGE, WITH THE SUN BEHIND THE CAMERA.
//
// tmp-canopy-distance shoots the stand from a fixed bearing, and at dusk that bearing looks INTO a low sun: the wood
// comes out a backlit silhouette, the crop loses the treeline edge against the glare (440 columns down to 306), and the
// saturation it reports - 0.096 - cannot be told apart from a washout. This places the camera on the SUN'S side of the
// same stand, so the canopy is frontlit and its colour is the thing being measured rather than its silhouette.
//
// The sun's own bearing is read from the running game (__hc.skyState().sunDir) rather than derived from the clock: the
// generator puts a fixed z component in the sun's direction, so its azimuth is not the obvious function of world time.
// Camera forward is (-sin yaw, -cos yaw), so looking along -sunXZ - away from the sun, sun behind the head - is
// yaw = atan2(sunXZ.x, sunXZ.z).
//
// Rows: the same stand at 60 and 220 blocks, at dusk and at noon, with the first row repeated last as the noise floor.
//
//   node bench/tmp-dusk-vantage.mjs [page]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const PAGE=process.argv[2]||'index.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
  let browser=null;
  try{
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/'+PAGE+'?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.isleStats()`);
    // THE TARGET HAS TO BE LOWLAND FOREST, and the first version of this bench proved why by not checking: from the
    // sun's side the old fixed target looked into the island's snow-capped interior, and the crop dutifully measured
    // SNOW - luminance 126 at saturation 0.03, which reads exactly like a whiteout and is nothing of the kind
    // (bench/results/dusk-dusk-220-fog1.png, first run). The stand is chosen here by height: above the beach, and well
    // under the snow line the generator paints on the interior peaks.
    const SEA=await page.evaluate(`__hc.island().sea`);
    const stand=await page.evaluate(`(()=>{ const cx=${IC.x}, cz=${IC.z};
      for(let r=Math.round(${IC.R}*0.35); r<${IC.R}*0.9; r+=6){
        for(let k=0;k<24;k++){ const th=k/24*6.2831853;
          const x=Math.round(cx+Math.cos(th)*r), z=Math.round(cz+Math.sin(th)*r), g=__hc.groundY(x,z);
          if(g>${SEA}+8 && g<${SEA}+24) return {x,z,g}; } }
      return null; })()`);
    if(!stand){ console.log('  no lowland stand found'); return; }
    const tx=stand.x, tz=stand.z, tg=stand.g;
    console.log(`  stand ${tx},${tz} ground ${tg} (sea ${SEA})`);
    let fixedTop=null;
    const shoot=async(tag,dist,t,fogmul)=>{
      // The clock first, because the camera placement depends on where the sun IS at that hour.
      await page.evaluate(`__hc.vis({fogmul:${fogmul==null?1:fogmul}}); __hc.freezeT(0); __hc.dayLock(${t}); __hc.fog(0)`); await sleep(600);
      const sky=await page.evaluate(`__hc.skyState()`);
      const sx=sky.sunDir[0], sz=sky.sunDir[2], L=Math.hypot(sx,sz)||1;
      const ux=sx/L, uz=sz/L;                                    // the sun's horizontal bearing, unit
      const x=Math.round(tx+ux*dist), z=Math.round(tz+uz*dist);  // stand on the sun's side of the stand
      const yaw=Math.atan2(ux,uz);                               // look back at it, sun behind the head
      await page.evaluate(`__hc.tpAt(${x}+0.5, ${tg}+26, ${z}+0.5); __hc.cam({yaw:${yaw}, pitch:-0.05})`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2500); await sleep(500);
      const f=path.join(OUT,`dusk-${tag}.png`); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      // THE BOX IS FOUND ONCE AND THEN HELD, and the statistics are MEDIANS. Re-finding the treeline edge per shot was
      // the instability: with the clock pinned and the camera identical, two shots still reported 397 and 331 columns
      // and saturation 0.195 against 0.125, because falling leaf particles drift through the frame and move the edge a
      // detector finds. The first row fixes the band from its own median edge; every later row measures those same
      // pixels, and a median throws out the particles that cross them.
      const s=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const W=im.width, H=im.height, d=g.getImageData(0,0,W,H).data;
        const L2=(i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
        let sky=0,sn=0; for(let y=20;y<90;y++) for(let x=200;x<W-200;x+=3){ sky+=L2((y*W+x)*4); sn++; }
        sky/=sn;
        let top=${fixedTop==null?-1:fixedTop};
        if(top<0){ const es=[];
          for(let x=200;x<W-200;x+=2){ for(let y=100;y<H-120;y++){ if(L2((y*W+x)*4) < sky-28){ es.push(y); break; } } }
          es.sort((a,b)=>a-b); top = es.length? es[es.length>>1]+3 : 380; }
        const sats=[],grns=[],lums=[];
        for(let x=260;x<W-260;x+=2) for(let y=top;y<top+40;y++){
          const i=(y*W+x)*4, r=d[i],gg=d[i+1],b=d[i+2];
          const mx=Math.max(r,gg,b), mn=Math.min(r,gg,b);
          sats.push(mx>0?(mx-mn)/mx:0); grns.push(gg-(r+b)/2); lums.push(L2(i)); }
        const med=(a)=>{ a.sort((p,q)=>p-q); return a[a.length>>1]; };
        return { sat:+med(sats).toFixed(3), green:+med(grns).toFixed(1),
                 lum:+med(lums).toFixed(1), sky:+sky.toFixed(1), cols:top }; })()`);
      if(fixedTop==null) fixedTop=s.cols;
      const fi=await page.evaluate(`__hc.fogInfo()`);
      console.log(`    ${tag}  dist ${dist}  t ${t}  sunH ${sky.sunH}   sat ${s.sat}  green ${s.green}  lum ${s.lum}  sky ${s.sky} top ${s.cols}   fogReach ${fi.reach.toFixed(0)}`);
      return s;
    };
    // ONE DISTANCE, ONE CLOCK, ONLY THE FOG MOVES. The edge-following crop is not stable at dusk even frontlit — two
    // shots of the identical setup found 337 and 384 columns and reported saturation 0.16 and 0.065, because the light
    // changes fast at that hour and the world clock cannot be frozen (freezeT pins the SHADER time, not worldTime; there
    // is no hook that stops the day). So the question is asked the only way it stays answerable: hold the camera and the
    // hour still, and move the fog dial alone. Whatever the metric's absolute value is at dusk, the DIFFERENCE across
    // that dial is the wash.
    await shoot('dusk-220-fog1',   220, 0.46, 1.0);
    await shoot('dusk-220-fog015', 220, 0.46, 0.15);
    await shoot('dusk-220-fog0',   220, 0.46, 0.0);
    await shoot('dusk-220-fog1-repeat', 220, 0.46, 1.0);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
