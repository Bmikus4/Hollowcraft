// SHADE HAS A DIRECTION: A FLOOR, A WALL AND A SOFFIT UNDER ONE ROOF ARE NO LONGER THE SAME BRIGHTNESS.
//
// Plan §4 item 8. `aSky` is a per-face SCALAR — how much sky a face's own column can see — and it says nothing about which way
// the face points, so anywhere the sun does not reach (under a canopy, inside a shelter, in shadow) a floor, a wall and the
// underside of a roof all take exactly the same skylight and the shade has no form. The sky is a hemisphere: up sees all of it,
// a vertical face half, a downward face only what bounces.
//
// THE TEST SCENE IS BUILT, not found. Three orientations of the SAME material have to be in one frame, out of the sun, or the
// measurement is comparing stone against grass, or noon against dusk: a 9x9 stone floor, a 9x9 stone roof five blocks over it and
// a stone back wall, open at the front. Everything is `/setblock`, the game's own path.
//
// WHAT IS ASSERTED, and why the second one matters as much as the first: the floor:soffit and floor:wall ratios have to OPEN UP
// with the feature on (that is the feature), and a daylight frame's mean luminance has to stay put (that is the constraint). A
// first pass that only darkened side and down faces made the whole world dimmer, which is the one thing Ben has asked against
// four separate times — hence up 1.06 against dn 0.80 rather than 1.0 and 0.5. SKYDIR_UP / SKYDIR_DN in the environment override
// the shipped pair; that is how it was chosen, and what 1.10/0.58 costs is recorded beside the constants in index.html.
//
//   node bench/assert-directional-sky.mjs
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
// MEDIAN, not mean: a crop of a stone surface still catches a bright edge pixel or two where the greedy quads meet, and the mean
// follows them. Also reports the crop's own spread so a claim can be read against how uniform the surface actually is.
function crop(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const v=[]; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch));
  v.sort((a,b)=>a-b);
  return { med:+v[v.length>>1].toFixed(2), p10:+v[(v.length*0.10)|0].toFixed(2), p90:+v[(v.length*0.90)|0].toFixed(2), n:v.length };
}
function frameMean(file){
  const P=decodePNG(fs.readFileSync(file));
  // The HUD is static and bright: the compass sits bottom-left, the hotbar bottom-centre, the held item bottom-right, and all
  // three would sit inside any full-frame statistic and dilute it. Top 70% of the frame only.
  const x0=0,x1=P.w,y0=0,y1=(P.h*0.70)|0; let s=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
  return +(s/n).toFixed(3);
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
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8&dbg=sdir',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const D=await page.evaluate(`__hc.skyDir()`);
    console.log(`  live: ${JSON.stringify(D)}`);
    check('directional skylight is on by default', D.amt>0.99 && D.up>D.dn, JSON.stringify(D));
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // A FREE-STANDING BOX IN THE AIR, not a shelter dug into the ground. Built on the hillside first, and the terrain won: the
    // slope rose through a flat stone floor, so the lower band of the frame was grass and plants and the 'floor' crop was reading a
    // different material from the wall and the soffit it was being compared with. y=96 is clear of the terrain and inside
    // CFG.WORLD_H (128), which anything above 128 is not — an earlier harness placed lamps at 130 and every /setblock silently did
    // nothing.
    const BX=Math.round(S.sx)+6, BZ=Math.round(S.sz), FY=96, RY=101;
    await page.evaluate(`(()=>{
      for(let dx=0;dx<9;dx++) for(let dz=-4;dz<=4;dz++){
        __hc.cmdRun('/setblock '+(${BX}+dx)+' ${FY} '+(${BZ}+dz)+' stone');
        __hc.cmdRun('/setblock '+(${BX}+dx)+' ${RY} '+(${BZ}+dz)+' stone'); }
      for(let dz=-4;dz<=4;dz++) for(let y=${FY}+1;y<${RY};y++) __hc.cmdRun('/setblock '+(${BX}+8)+' '+y+' '+(${BZ}+dz)+' stone');
      for(let dx=0;dx<9;dx++) for(let y=${FY}+1;y<${RY};y++){ __hc.cmdRun('/setblock '+(${BX}+dx)+' '+y+' '+(${BZ}-4)+' stone');
        __hc.cmdRun('/setblock '+(${BX}+dx)+' '+y+' '+(${BZ}+4)+' stone'); }
    })()`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);
    // Just inside the open end, mid-height, looking along the box: stone floor below, stone back wall ahead, stone soffit above.
    await page.evaluate(`__hc.tpAt(${BX}+1.5, ${FY}+2.4, ${BZ}+0.5)`);
    await page.evaluate(`__hc.cam({yaw:-1.5708, pitch:0.0})`); await sleep(400);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(220); };
    // t=0.25 is NOON on the real map (bench/tmp-elev.mjs: t=0 is SUNRISE, the setTime comment is a quarter turn out), so the sun
    // is overhead and none of it reaches inside — which is the point, this is a claim about SKYLIGHT.
    await pin(0.25);
    const shot=async(tag)=>{ const f=path.join(OUT,`skydir-${tag}.png`); await page.screenshot({path:f}); return f; };
    const CEIL=[0.32,0.68,0.06,0.18], WALL=[0.40,0.60,0.42,0.54], FLOOR=[0.32,0.68,0.70,0.82];   // stops short of 0.857, where the hotbar starts
    const read=async(tag)=>{ const f=await shot(tag);
      return { ceil:crop(f,CEIL), wall:crop(f,WALL), floor:crop(f,FLOOR) }; };
    // SKYDIR_UP / SKYDIR_DN override the shipped pair, which is how they were chosen: the shelter is the only place the trade-off
    // is visible, so the tuning loop is this harness run with different factors rather than a separate script.
    const UP=process.env.SKYDIR_UP, DN=process.env.SKYDIR_DN;
    // ?dbg=sdir renders the factor itself: 0.5 grey is 1.0, brighter is an up face, darker is a soffit. This exists because the
    // FLOOR measured slightly DARKER with the feature on, which the arithmetic says is impossible for a face with normal +y.
    console.log('  crops: ceiling / wall / floor of the factor frame');
    const f=path.join(OUT,'skydir-dbg.png'); await page.screenshot({path:f});
    console.log(`  ceil ${JSON.stringify(crop(f,[0.32,0.68,0.06,0.18]))}`);
    console.log(`  wall ${JSON.stringify(crop(f,[0.40,0.60,0.42,0.54]))}`);
    console.log(`  floor ${JSON.stringify(crop(f,[0.32,0.68,0.70,0.82]))}`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
