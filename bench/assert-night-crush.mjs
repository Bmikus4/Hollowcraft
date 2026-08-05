// NIGHT SURFACES UNDER A LANTERN DO NOT DITHER INTO PURE BLACK.
//
// Plan §3. paintTile bakes per-texel value jitter into every tile (jit(r,0,26) and friends). At night the terrain shader's
// irradiance is (0.26 + 0.74*pow(vSky,1.15)) times a hemisphere that is itself near zero, plus an AmbientLight of 0x1a2130 at
// 0.12 scaled by lerp(0.055,0.32,day) — of the order of 0.007. AgX has a strong toe, so the darker half of each tile's jitter
// falls below the crush point and lands on exactly 0 while the brighter half survives: salt-and-pepper black texels on trunks
// and grass, which is Ben's 09:58 screenshot.
//
// Measured as the share of terrain pixels at luminance <= 1 AND surrounded by much brighter neighbours. Both halves matter: a
// cave mouth or a shadowed crevice is legitimately black, and a plain black count cannot tell that from crushed dither. An
// ISOLATED black pixel next to a lit one is the signature of the toe, because no real surface is lit and unlit one texel apart.
//
// The night brightness of the sky is measured in the same frames and asserted NOT to move, because the obvious lever here is
// toneMappingExposure and lifting it lifts everything: Ben has asked four separate times for night to be genuinely black.
//
//   node bench/assert-night-crush.mjs
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
// Over a crop: the share of pixels crushed to black, the share of those that are ISOLATED (a bright neighbour), and the crop's
// own median so a claim about black pixels can be read against how lit the surface actually is.
function crush(file, crop){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  let n=0, black=0, iso=0; const v=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const l=L(x,y); n++; v.push(l);
    if(l<=1){ black++;
      let hi=0;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue;
        const xx=x+dx, yy=y+dy; if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; const q=L(xx,yy); if(q>hi)hi=q; }
      if(hi>18) iso++;   // lit one texel away from dead black — no real surface does that
    } }
  v.sort((a,b)=>a-b);
  return { blackPct:+(100*black/n).toFixed(3), isoPct:+(100*iso/n).toFixed(3), median:+v[n>>1].toFixed(1),
           p90:+v[(n*0.90)|0].toFixed(1), n };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });   // §7: grain would put noise of its own into a noise measurement
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    // GROUND UNDER A LANTERN, looking down at it: grass and dirt at close range, which is where the jitter is at its coarsest
    // on screen and where Ben photographed it. The lantern is what makes this a lit surface rather than a legitimately dark one.
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+3}, ${S.sz}+0.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    await page.evaluate(`__hc.setBlock(2,0,0,'lantern')`); await sleep(900);
    await page.evaluate(`__hc.cam({yaw:-1.571, pitch:-0.62})`);   // face +x, look down at the ground the lantern lights
    // THE LANTERN'S OWN CAP IS BLACK, and it sits at frame centre. The first crop ran x 0.30-0.72 straight through it and
    // reported 1.2% of the "ground" as pure black — a painted metal cap, not a crushed texel. The crop now takes the lit ground
    // to the LEFT of the lamp only.
    const GROUND=[0.10,0.42,0.46,0.84];
    const SKY=[0.05,0.30,0.02,0.16];
    const shot=async(t,name)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(600); await page.evaluate(`__hc.setTime(${t})`); await sleep(200);
      const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };
    const nf=await shot(0.94,'crush-night.png');
    const df=await shot(0.42,'crush-day.png');
    const N=crush(nf,GROUND), D=crush(df,GROUND), Nsky=crush(nf,SKY);
    console.log(`  NIGHT lit ground: ${N.blackPct}% pure black, ${N.isoPct}% isolated, median ${N.median}, p90 ${N.p90}`);
    console.log(`  DAY   lit ground: ${D.blackPct}% pure black, ${D.isoPct}% isolated, median ${D.median}, p90 ${D.p90}`);
    console.log(`  night sky median ${Nsky.median}`);

    // WHAT THIS GUARDS. §3's speckle does NOT occur here: on lantern-lit ground at midnight this crop reads 0% pure black. The
    // 1.2% an earlier version of this harness reported was the lantern's own painted metal cap, which sits at frame centre and
    // was inside the crop — so the artefact remains UNREPRODUCED, and no fix has been shipped for it. What is committed is the
    // measurement: a standing guard that lit night ground carries no crushed texels, which will go red if a lighting or grade
    // change introduces them.
    check('lit night ground has no crushed black',  N.blackPct < 0.02 && N.isoPct < 0.02, `${N.blackPct}% pure black, ${N.isoPct}% of it isolated`);
    // AND THE NIGHT IS NIGHT. Recorded because the obvious lever for §3 is toneMappingExposure, and it is the wrong one:
    // measured at +0.35 toward midnight, the night SKY's median rose from 17.7 to 23.5 — a third brighter night — while the
    // black count barely moved. Ben has asked four separate times for night to be genuinely black. If a future change lifts
    // exposure per hour, this is the check that should stop it.
    check('the night sky stays dark',               Nsky.median < 30, `night sky median ${Nsky.median}`);
    check('daylight ground is lit and clean',       D.median > 60 && D.blackPct < 0.02, `median ${D.median}, pure black ${D.blackPct}%`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/crush-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
