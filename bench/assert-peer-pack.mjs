// ASSERT: a peer wearing a backpack is SEEN wearing it. 58ce80a shipped the netcode with "the bag is built on the avatar
// but NOT seen in a frame" written into the message; this closes that.
//
// Two faults made the old harness unable to answer. It never aimed the camera at the peer -- the avatar lerp only runs
// with the network on, so nothing pointed the view -- and the frames it took had Jesus at the crosshair, spawned nearby,
// with the peer off to the side. And a leather-brown bag against dirt and wood cannot be counted in pixels. So fakePeer
// now aims, and the bag is tinted a colour this world has nowhere.
//
// usage: node bench/assert-peer-pack.mjs   -> bench/results/peerpack-*.png
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
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// Magenta: r and b high, g far below both. Every terrain tone here is r>g>b (earth, wood, sand, leather) or b>=g>r
// (sea, sky, the peer's blue-grey cloth), so a magenta pixel is the tinted bag and can be nothing else.
function magenta(img){ let n=0, minx=1e9, maxx=-1, miny=1e9, maxy=-1;
  for(let y=0;y<img.h;y++) for(let x=0;x<img.w;x++){ const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2];
    if(r>80 && b>80 && g < Math.min(r,b)*0.5){ n++; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; } }
  return {n, box:n?[minx,miny,maxx,maxy]:null}; }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(50)+' got='+JSON.stringify(got)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,760']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    }
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.setTime(0.42)');
    await page.evaluate('__hc.pinScene()');
    await sleep(1200);

    const shoot=async(name)=>{ const p=path.join(OUT,'peerpack-'+name+'.png'); await page.screenshot({path:p}); return decodePNG(fs.readFileSync(p)); };

    // CONTROL FIRST: a peer with no pack. If magenta shows up here the tint has leaked and every later number is void.
    const noPack = await page.evaluate('__hc.fakePeer(false,3.4,"#ff00ff")');
    console.log('  no-pack peer: '+JSON.stringify(noPack));
    await sleep(1200);
    const C = await shoot('nopack');
    const MC = magenta(C);
    ok('control: no magenta with the pack hidden', MC.n<50, MC.n);

    // THE ANSWER: same peer, pack worn, bag tinted.
    const withPack = await page.evaluate('__hc.fakePeer(true,3.4,"#ff00ff")');
    console.log('  worn-pack peer: '+JSON.stringify(withPack));
    await sleep(1200);
    const W = await shoot('worn');
    const MW = magenta(W);
    ok('the worn bag is IN THE FRAME', MW.n>300, {px:MW.n, box:MW.box});
    ok('camera was actually aimed at the peer', withPack && Math.abs(withPack.dist-3.4)<0.6, withPack&&withPack.dist);
    // The bag sits on the upper back, so it must land in the upper-middle band of the frame, not at the feet or the edge.
    ok('bag lands on the peer\'s back, mid-frame', MW.box && MW.box[0]>380 && MW.box[2]<900 && MW.box[1]>150 && MW.box[3]<620, MW.box);

    // And an untinted frame, because the shipped look is leather and that is what a player sees.
    await page.evaluate('__hc.fakePeer(true,3.4)');
    await sleep(1200);
    await shoot('worn-leather');

    ok('no page errors', errs.length===0, errs.length);
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    console.log('shots: bench/results/peerpack-nopack.png, peerpack-worn.png, peerpack-worn-leather.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
