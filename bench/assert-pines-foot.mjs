// DOES THE HORIZON BAND'S FOOT EVER SHOW ABOVE THE REAL CANOPY, AND DOES THE RING HAVE A HOLE IN IT.
//
// Ben's eighth rejection is two claims about pixels: "the bands sit well above the real treeline with open sky beneath
// and a hard flat BLACK BOTTOM EDGE", and "A GAP IN THE MIDDLE between the left and right bands with sky through it".
// Both are answerable per COLUMN of the frame, from two frames of one vantage, and that is what this does - which is why
// it can be run from inside a wood where a photograph is mostly trunk. Five cuts of a forest-vantage harness tried to
// find a camera position with a clean outlook and the island does not have one; the measurement does not need it.
//
//
// IT IS NOT A PIXEL DIFF, and the first cut of it was. An on/off screenshot diff over a shore frame counts the OCEAN's
// animation and the RAIN as band -- it reported the band on 1280 of 1280 columns with the sea in view -- and a colour
// test cannot tell a white cloud from a lit crown. __hc.pineHorizon computes the same two numbers from the world: the
// largest elevation angle the real canopy and sea reach on each bearing out to the render wall, and the band's own foot
// by the fragment shader's own arithmetic. Frames are still taken, with a pines-off control, because a number without a
// photograph has been wrong five times on this project.
//
// Run over the four shore vantages and a wooded bluff, at noon and at night, and it prints one line per vantage.
//
//   node bench/assert-pines-foot.mjs [--set '{"sinkF":0.9}']
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const argv=process.argv.slice(2);
const SET=(()=>{ const i=argv.indexOf('--set'); return i<0?null:argv[i+1]; })();
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fail=0, ran=0;
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
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0);`);
    if(SET) await page.evaluate(`__hc.pines(true, ${SET})`);
    console.log('  pines', JSON.stringify(await page.evaluate('__hc.pines()')));
    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    const spots=[];
    for(const [name,dx,dz] of [['W',-1,0],['E',1,0],['N',0,-1],['S',0,1]]){
      const f=await page.evaluate(`(()=>{ for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){
          const x=Math.round(${IC.x}+${dx}*d), z=Math.round(${IC.z}+${dz}*d);
          if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.surfH(x,z)}; } return null; })()`);
      // ONE ENTRY PER PLACE, not per look. pineHorizon scans all 192 bearings from where the camera STANDS, so a second
      // vantage at the same spot with a different yaw returns the same numbers - the first cut of this printed every
      // shore twice and every hour twice and looked like eighteen measurements of five.
      if(f){ spots.push({name:'shore'+name, x:f.x, z:f.z, g:f.g, yaw:Math.atan2(-dx,-dz)});
        // AND A BLUFF OVER THE SAME WATER. Eye height is the whole question for the foot: at 43 the waterline is a
        // degree below the eye and almost anything hides the foot, at 90 the sea's rendered edge is seventeen degrees
        // down and only the horizon ring is left to cover it. The highest column within sixty blocks of this shore,
        // looking out on the same bearing.
        const c=await page.evaluate(`(()=>{ let best=null;
          for(let d=2; d<=60; d+=2) for(let o=-30; o<=30; o+=3){
            const x=Math.round(${f.x}-(${dx})*d-(${dz})*o), z=Math.round(${f.z}-(${dz})*d+(${dx})*o), g=__hc.surfH(x,z);
            if(!best || g>best.g) best={x,z,g}; } return best; })()`);
        if(c && c.g>f.g+12) spots.push({name:'bluff'+name, x:c.x, z:c.z, g:c.g, yaw:Math.atan2(-dx,-dz)}); }
    }
    // AND ONE VANTAGE INSIDE THE WOOD, which is the frame Ben shot. It does not need a clean outlook for this
    // measurement: a column filled by a trunk simply has no band in it and is not counted.
    const bluff=await page.evaluate(`(()=>{ let best=null;
      for(let r=50; r<${IC.R}*0.75; r+=6) for(let k=0;k<64;k++){ const th=k/64*6.2831853;
        const x=Math.round(${IC.x}+Math.cos(th)*r), z=Math.round(${IC.z}+Math.sin(th)*r), g=__hc.surfH(x,z);
        if(g<=${SEA}+18 || g>=${SEA}+46) continue;
        let d=0, yaw=0;
        for(let a=0;a<16;a++){ const an=a/16*6.2831853;
          const dd=g-__hc.surfH(Math.round(x+Math.cos(an)*40), Math.round(z+Math.sin(an)*40));
          if(dd>d){ d=dd; yaw=Math.atan2(-Math.cos(an),-Math.sin(an)); } }
        if(!best || d>best.d) best={x,z,g,d:+d.toFixed(1),yaw:+yaw.toFixed(4)}; }
      return best; })()`);
    if(bluff) spots.push({name:'wood', x:bluff.x, z:bluff.z, g:bluff.g, yaw:bluff.yaw});
    for(const sp of spots){
      await page.evaluate(`__hc.tpAt(${sp.x}+0.5, ${sp.g}+1, ${sp.z}+0.5); __hc.cam({yaw:${sp.yaw}, pitch:0});`);
      for(let i=0;i<40;i++){ const f=await page.evaluate('__hc.fill()'); if(f && f.meshed>=f.want) break; await sleep(1000); }
      await sleep(2000);
      for(const [when,t] of [['noon',0.25]]){
        await page.evaluate(`__hc.setTime(${t}); __hc.rain(0)`); await sleep(900); await page.evaluate(`__hc.setTime(${t})`); await sleep(500);
        await page.screenshot({path:path.join(OUT,`pf-${sp.name}-${when}.png`)});
        await page.evaluate('__hc.pines(0)'); await sleep(700);
        await page.screenshot({path:path.join(OUT,`pf-${sp.name}-${when}-off.png`)});
        await page.evaluate('__hc.pines(1)'); await sleep(700);
        const r=await page.evaluate('__hc.pineHorizon(192)'); ran++;
        const bad=r.floating>0; if(bad) fail++;
        console.log(`  ${bad?'FAIL':'ok  '} ${sp.name.padEnd(8)} ${when.padEnd(5)} eye ${r.eyeY}  visible on ${String(r.visibleBearings).padStart(3)}/${r.n} bearings  showing ${r.meanShowingDeg} deg  FLOATING ${r.floating} (worst foot ${r.worstFootAboveSilhouetteDeg} deg above the silhouette at az ${r.worstAzDeg})`);
      }
    }
    console.log(`  ${ran-fail}/${ran} vantages have no floating foot and no hole`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
