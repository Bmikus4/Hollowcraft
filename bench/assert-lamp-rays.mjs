// A LANTERN SEEDS A LIGHT SHAFT AGAIN — Ben 08-05: "light rays have dissapeared from held/placed lights near the cabin, so its fair
// to assume they are gone globally."
//
// They were removed deliberately, twice. 1154aaa raised the seed threshold 0.62 -> 2.2 to answer his OPPOSITE report of 08-04
// ("SOMETIMES NON-sun light sources also emit god rays"), which failed on its own terms; the fix that followed replaced brightness
// with a DEPTH gate, so only a pixel at the far plane may seed a ray and "a lantern is geometry and can never qualify". That is the
// bug, by construction. `uSeedEmit` adds the emitter back as its own seed beside the depth one, and 0 restores the depth-only build.
//
// PIXELS, NOT A FLAG, which is his instruction: the assertion is the DIFFERENCE between two rendered frames at one vantage with one
// uniform moved, counted over a crop that holds the lamp and the air between it and the sun.
//
// TWO THINGS THAT MAKE THIS HARD, both already paid for by assert-emitters-and-rays and assert-godray-seed:
//   THE PASS IS DAY-GATED. `_grActive = _godraysOn && front && day>0.15`, and uStrength follows the sun's elevation, so there is no
//   shaft of any kind at night — the hour Ben was probably looking at. The window is the sun a degree or two up, found by sweeping.
//   THE PASS NEEDS THE DEPTH PATH. It is not even created on Low quality or with ?nomblur, so a build with rays switched off at the
//   quality level would read as this bug and is not it.
//
//   node bench/assert-lamp-rays.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// the per-pixel difference between two frames, over a crop, in luminance
function diff(a,b,c){
  const A=decodePNG(fs.readFileSync(a)), B=decodePNG(fs.readFileSync(b));
  const x0=(A.w*c[0])|0,x1=(A.w*c[1])|0,y0=(A.h*c[2])|0,y1=(A.h*c[3])|0;
  const v=[]; let up=0,n=0,sum=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*A.w+x)*A.ch;
    const la=0.2126*A.data[i]+0.7152*A.data[i+1]+0.0722*A.data[i+2];
    const lb=0.2126*B.data[i]+0.7152*B.data[i+1]+0.0722*B.data[i+2];
    const d=lb-la; v.push(d); sum+=d; n++; if(d>2) up++; }
  v.sort((p,q)=>p-q);
  return { moved:+(100*up/n).toFixed(2), mean:+(sum/n).toFixed(2), p99:+v[(v.length*0.99)|0].toFixed(2), max:+v[v.length-1].toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); });
    page.on('console',m=>{ const t=m.text(); if(/ERROR: 0:|GL_INVALID|shader/i.test(t)){ errs.push(t); console.log('  GLSL:',t.slice(0,300)); } });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); try{__hc.fpsPin(240);}catch(e){} __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true);`);
    const g0=await page.evaluate(`__hc.godrays({})`);
    console.log(`  godray state ${JSON.stringify(g0)}`);
    check('the pass exists and the emitter seed ships ON', g0 && g0.seedEmit===1, JSON.stringify(g0&&g0.seedEmit));
    // A LANTERN ON OPEN FLAT GROUND, and the camera looking at it with the sun BEHIND it — the pass integrates along the line from
    // each pixel toward the sun's screen position, so the lamp has to sit between the eye and the sun to seed anything visible.
    const S=await page.evaluate(`__hc.st()`); const X=Math.round(S.sx)+30, Z=Math.round(S.sz)+30;
    const GY=await page.evaluate(`(()=>{ const g=__hc.groundY(${X},${Z}); for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) __hc.cmdRun('/setblock '+(${X}+dx)+' '+g+' '+(${Z}+dz)+' planks');
      __hc.cmdRun('/setblock ${X} '+(g+1)+' ${Z} lantern'); return g; })()`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1400);
    check('the lantern is there', (await page.evaluate(`__hc.blockAt(${X},${GY}+1,${Z})`))>0);
    // SWEEP THE CLOCK for the window where the pass is actually active — its own strength follows the sun's elevation and is 0 with
    // the sun under the horizon, so an assertion at a fixed hour measures nothing on most of the clock.
    // AND THE CAMERA HAS TO BE LOOKING AT THE SUN. `enabled` is gated on `front` (_sunProj.z<1.0), so a clock sweep with a fixed
    // yaw reports the pass dead at every hour — which is what the first run of this file did, and it is not a finding about the pass.
    let best=null;
    for(let i=0;i<=16;i++){ const t=+(0.40+i*0.006).toFixed(3);
      await page.evaluate(`__hc.setTime(${t})`); await sleep(200);
      for(let j=0;j<8;j++){ await page.evaluate(`__hc.cam({yaw:${j}*Math.PI/4, pitch:0.25})`); await sleep(60);
        const g=await page.evaluate(`__hc.godrays({})`);
        if(g && g.enabled && g.strength>0.02 && (!best || g.strength>best.s)) best={t, s:g.strength, yaw:j*Math.PI/4}; } }
    console.log(`  strongest ray window: ${JSON.stringify(best)}`);
    check('there is an hour where the pass is active at all', !!best, JSON.stringify(best));
    if(best){
      const pin=async()=>{ await page.evaluate(`__hc.setTime(${best.t})`); await sleep(520); await page.evaluate(`__hc.setTime(${best.t})`); await sleep(260); };
      // aim so the lamp sits between the eye and the sun's screen position
      await page.evaluate(`(()=>{ const s=__hc.godrays({}); __hc.tpAt(${X}+0.5, ${GY}+2.2, ${Z}+6.5); })()`); await sleep(400);
      let by=0, bd=1e9;
      for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:0.02})`); await sleep(40);
        const p=await page.evaluate(`(()=>{ const l=__hc.screenOf(${X}+0.5, ${GY}+1.5, ${Z}+0.5), g=__hc.godrays({});
          if(!l||!l.onScreen||!g||!g.sunProjXY) return null;
          const sx=(g.sunProjXY[0]*0.5+0.5)*1000, sy=(1-(g.sunProjXY[1]*0.5+0.5))*560;
          return Math.hypot(l.px-sx, l.py-sy); })()`);
        if(p!=null && p<bd){ bd=p; by=yaw; } }
      await page.evaluate(`__hc.cam({yaw:${by}, pitch:0.02})`); await sleep(400);
      console.log(`  lamp sits ${bd.toFixed(0)} px from the sun's screen position`);
      const shot=async tag=>{ await pin(); const f=path.join(OUT,`lampray-${tag}.png`); await page.screenshot({path:f}); return f; };
      await page.evaluate(`__hc.godrays({seedEmit:0})`); const off=await shot('seedemit0');
      await page.evaluate(`__hc.godrays({seedEmit:1})`); const on=await shot('seedemit1');
      await page.evaluate(`__hc.godrays({seedEmit:0})`); const off2=await shot('seedemit0-again');
      const CROP=[0.20,0.80,0.20,0.75];
      const d=diff(off,on,CROP), ctl=diff(off,off2,CROP);
      console.log(`  seedEmit 0 -> 1   ${JSON.stringify(d)}`);
      console.log(`  control 0 -> 0    ${JSON.stringify(ctl)}`);
      check('turning the emitter seed on puts light in the frame that was not there',
        d.moved > ctl.moved+1.0 && d.p99 > ctl.p99+2.0, `moved ${d.moved}% vs control ${ctl.moved}%, p99 ${d.p99} vs ${ctl.p99}`);
      check('and it ADDS light rather than darkening', d.mean > ctl.mean, `mean ${d.mean} vs ${ctl.mean}`);
    }
    check('no page errors and no shader compile errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`  frames: bench/results/lampray-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
