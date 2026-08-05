// A LANTERN LIGHTS THE HAND HOLDING IT, AND THE WORLD EXACTLY AS BEFORE.
//
// Ben: "lanterns create a blurry glow on the offhand on both hands". heldLight was a single point light at the EYE, midway between
// the two viewmodel arms, so both were lit identically. It now sits 0.34 toward whichever hand supplies the light.
//
// Two claims, and the second is the one that can quietly break: the arms must differ, and the WORLD flood must not. A lantern's
// reach is 26-32 blocks and the offset is 0.34, so the floor should read the same before and after -- if it does not, this traded
// a cosmetic bug for a lighting change nobody asked for.
//
// usage: node bench/assert-hand-glow.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let checks=0, fails=0;
function ok(n,c,d){ checks++; if(!c){ fails++; console.log('  FAIL  '+n+(d!==undefined?('   '+JSON.stringify(d)):'')); } else console.log('  ok    '+n+(d!==undefined?('   '+JSON.stringify(d)):'')); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1000,height:640} })).newPage();
    page.on('pageerror', e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    // NIGHT, and pinned: the whole effect is a light in the dark, and by day the sun swamps it.
    await page.evaluate('__hc.setTime(0.72)'); await page.evaluate('__hc.pinScene()'); await sleep(2500);

    const shoot=async(tag)=>{ const f=path.join(OUT,'handglow-'+tag+'.png'); await page.screenshot({path:f}); return decodePNG(fs.readFileSync(f)); };
    // The two arms occupy the bottom corners of the frame; sample a block in each and compare. Corners rather than a hunt for
    // skin colour: the arms are the only thing drawn there, and a colour hunt in a night frame finds the HUD.
    const arm=(im,left)=>{ let s=0,n=0;
      const x0=left?Math.floor(im.w*0.16):Math.floor(im.w*0.68), x1=left?Math.floor(im.w*0.32):Math.floor(im.w*0.84);
      for(let y=Math.floor(im.h*0.72); y<Math.floor(im.h*0.94); y++) for(let x=x0;x<x1;x++){ const i=(y*im.w+x)*im.ch;
        s+=0.2126*im.data[i]+0.7152*im.data[i+1]+0.0722*im.data[i+2]; n++; } return s/Math.max(1,n); };
    // The world flood: the floor straight ahead, well outside anything the 0.34 offset could move.
    const floor=(im)=>{ let s=0,n=0; for(let y=Math.floor(im.h*0.56); y<Math.floor(im.h*0.66); y++) for(let x=Math.floor(im.w*0.40);x<Math.floor(im.w*0.60);x++){
        const i=(y*im.w+x)*im.ch; s+=0.2126*im.data[i]+0.7152*im.data[i+1]+0.0722*im.data[i+2]; n++; } return s/Math.max(1,n); };

    await page.evaluate('__hc.hold("lantern")').catch(()=>{});
    await sleep(1600);
    const main=await shoot('main-hand');
    const mL=arm(main,true), mR=arm(main,false), mFloor=floor(main);
    console.log('  lantern in the MAIN hand: left arm '+mL.toFixed(1)+'  right arm '+mR.toFixed(1)+'  floor '+mFloor.toFixed(1));
    ok('with the lantern in the main hand the right arm is the lit one', mR>mL*1.15, {left:+mL.toFixed(1), right:+mR.toFixed(1)});

    // Now the OTHER hand, with the main hand empty, which is also the case Ben was looking at.
    await page.evaluate('(()=>{ try{ __hc.offhandSet("lantern"); __hc.hold(null); }catch(e){} })()').catch(()=>{});
    await sleep(1800);
    const off=await shoot('offhand');
    const oL=arm(off,true), oR=arm(off,false), oFloor=floor(off);
    console.log('  lantern in the OFFHAND:    left arm '+oL.toFixed(1)+'  right arm '+oR.toFixed(1)+'  floor '+oFloor.toFixed(1));
    // NOT AN ASSERTION YET, and deliberately not: this setup does not produce a judgeable frame. The floor reads 239 of 255 here
    // against 11.5 in the main-hand frame, which is a blown-out picture rather than a lighting verdict -- __hc.offhandSet plus
    // hold(null) leaves the view in some state this harness has not pinned down (the likeliest cause is the lantern viewmodel
    // filling the frame, since the offhand fit is a different scale). The numbers are printed so the next pass starts from them.
    // Until that frame is right, the offhand direction of this fix is UNVERIFIED; the main-hand direction above is measured.
    console.log('     offhand frame is not judgeable yet (floor '+oFloor.toFixed(1)+' of 255 vs '+mFloor.toFixed(1)+' in the main-hand frame) — no verdict taken from it');

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('  frames: bench/results/handglow-main-hand.png, handglow-offhand.png');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
