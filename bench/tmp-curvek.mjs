// BRACKET THE CURVE CONSTANT. Ben: "bracket the curve constant" -- not the sea bow already shipped at 0.13, but the thing
// that bends the world away with distance.
//
// WHICH CONSTANT: waterMat's uCurveK (index.html:3187, currently 0.0022). The water surface drops by uCurveK*(d-uCurveR)^2
// past uCurveR blocks, gated by the sea mask so inland water stays flat. uCurveR (20.0) is held fixed here so exactly one
// thing varies. There is NO terrain-curvature constant -- terrain never bends -- and the only other knob is uSeaBow, which
// bows the ocean RING angularly and is already at Ben's chosen 0.13.
//
// Measured as the drop of the water surface at the render wall, in blocks (k*(160-20)^2), and as the waterline's droop in
// pixels: how much lower it sits at the frame edges than at its centre.
//
// usage: node bench/tmp-curvek.mjs
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

function waterline(im,x){ let best=-1,bestY=null,prev=null;
  for(let y=Math.floor(im.h*0.12); y<Math.floor(im.h*0.82); y++){
    const i=(y*im.w+x)*im.ch, L=0.2126*im.data[i]+0.7152*im.data[i+1]+0.0722*im.data[i+2];
    if(prev!==null && prev-L>best){ best=prev-L; bestY=y; } prev=L; }
  return bestY; }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.setTime(0.30)');
    await page.evaluate('__hc.pinScene()').catch(()=>{});
    await sleep(1500);

    const isle=await page.evaluate('__hc.isleStats()'), P=await page.evaluate('__hc.probe()');
    console.log('  island '+JSON.stringify(isle)+'  sea '+P.sea+'   uCurveK live = 0.0022, uCurveR held at 20');

    const KS=[0.0008, 0.0022, 0.0045, 0.0090];
    const spots=[{ n:'shore', y:P.sea+3, pitch:0.02 }, { n:'elevation', y:135, pitch:-0.10 }];
    const sx=isle.x+isle.R+24, sz=isle.z;

    for(const s of spots){
      await page.evaluate('__hc.tpExact('+sx+','+sz+','+s.y+')'); await sleep(3000);
      await page.evaluate('__hcBR.look('+(Math.PI/2)+','+s.pitch+')'); await sleep(1800);
      console.log('  --- '+s.n+' (y='+s.y+') ---');
      for(const k of KS){
        await page.evaluate('__hc.vis({curvek:'+k+'})'); await sleep(1300);
        const f=path.join(OUT,'curvek-'+s.n+'-'+String(k).replace('.','p')+'.png');
        await page.screenshot({path:f});
        const im=decodePNG(fs.readFileSync(f));
        const l=waterline(im,Math.floor(im.w*0.05)), c=waterline(im,Math.floor(im.w*0.50)), r=waterline(im,Math.floor(im.w*0.95));
        const droop=(l!=null&&c!=null&&r!=null)?Math.round((l+r)/2-c):null;
        const dropAtWall=Math.round(k*Math.pow(160-20,2));
        console.log('     uCurveK '+String(k).padEnd(7)+' → sea drops '+String(dropAtWall).padStart(4)+' blocks by the render wall'
          +'   waterline centre '+String(c).padEnd(4)+' edges '+String(l).padEnd(4)+'/'+String(r).padEnd(4)+'  DROOP '+String(droop).padStart(4)+' px'
          +(k===0.0022?'   <- live now':''));
      }
    }

    // The two regression checks, at the live value.
    await page.evaluate('__hc.vis({curvek:0.0022})'); await sleep(900);
    const green = async ()=>{ const f=path.join(OUT,'curvek-check.png'); await page.screenshot({path:f});
      const im=decodePNG(fs.readFileSync(f)); const yEnd=Math.floor(im.h*0.55), need=Math.floor(im.w*0.02);
      let top=null,bot=null,px=0;
      for(let y=0;y<yEnd;y++){ let rc=0; for(let x=0;x<im.w;x++){ const i=(y*im.w+x)*im.ch;
          if(im.data[i+1]-(im.data[i]+im.data[i+2])/2>8) rc++; }
        px+=rc; if(rc>=need){ if(top===null)top=y; bot=y; } }
      return { greenPx:px, topRow:top, rows:(top!==null?bot-top+1:0) }; };
    for(const [nm,x,z,pitchYaw] of [['shore join',isle.x+isle.R-22,isle.z,Math.PI],['out at sea',isle.x+isle.R+190,isle.z,Math.PI],['inland',isle.x+Math.round(isle.R*0.42),isle.z,Math.PI/2]]){
      await page.evaluate('__hc.tpExact('+x+','+z+','+(P.sea+16)+')'); await sleep(2800);
      await page.evaluate('__hcBR.look('+pitchYaw+',0.012)'); await sleep(1600);
      console.log('  '+nm.padEnd(11)+' treeline '+JSON.stringify(await green())+'  anchor '+JSON.stringify(await page.evaluate('__hc.treelineAnchor()')));
    }
    console.log('  frames: bench/results/curvek-shore-*.png and curvek-elevation-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
