// LOOK AT THE DAY SKY. Ben: "night sky looks good, day horizon/sky needs a lot of work", and separately he asked for a
// skybox designed around a beautiful in-game sky. Before changing a shader that already has a Rayleigh gradient, forward
// scatter, golden hour, two cloud layers and a sun disc, the thing to do is photograph what it actually looks like.
//
// A note on why this is a SHOT harness and not an assertion: the previous attempt at the daytime horizon band was parked
// after five eliminations (7b00d1b) because the quantity it measured did not correspond to what Ben was seeing. So this
// produces frames and a small number of honest measurements alongside them -- the brightest row in the sky, and the jump
// across the waterline -- and leaves the judgement to his eye.
//
// usage: node bench/tmp-daysky.mjs [tag]   -> bench/results/daysky-<tag>-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG, bands } from './pngprobe.mjs';

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

(async()=>{
  const TAG = process.argv[2] || 'before';
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);

    // A vantage with open OCEAN in front: the sky/water meeting is where Ben's complaints have always been, and half the
    // horizon being land is what invalidated an earlier horizon probe (2534859).
    const P = await page.evaluate('__hc.probe()');
    const stand = await page.evaluate('__hc.tpExact('+(P.x-40)+','+P.z+','+(P.sea+34)+')');
    console.log('vantage '+JSON.stringify(stand)+'  sea='+P.sea);
    await sleep(2500);

    const shots=[];
    // Times across the day. 0.25 is early morning, 0.42 mid-morning, 0.50 noon, 0.62 afternoon, 0.72 toward evening.
    for(const t of [0.25,0.42,0.50,0.62,0.72]){
      await page.evaluate('__hc.setTime('+t+')'); await sleep(1200);
      // Face WEST over the water with the horizon low in frame, so both the sky gradient and the waterline are in shot.
      await page.evaluate('__hcBR.look('+(Math.PI/2)+',-0.02)'); await sleep(900);
      const f=path.join(OUT,'daysky-'+TAG+'-t'+String(t).replace('.','_')+'.png');
      await page.screenshot({path:f});
      const img=decodePNG(fs.readFileSync(f));
      // Vertical strip down the middle: where is the brightest row, and how big is the step across the waterline?
      const rows=bands(img,0.42,0.58,0.0,0.99,0.02);
      let best=rows[0], bi=0; rows.forEach((r,i)=>{ const l=r.rgb[0]+r.rgb[1]+r.rgb[2]; if(l>best.rgb[0]+best.rgb[1]+best.rgb[2]){ best=r; bi=i; } });
      let jump=0, jy=0;
      for(let i=1;i<rows.length;i++){ const d=Math.abs((rows[i].rgb[0]+rows[i].rgb[1]+rows[i].rgb[2])-(rows[i-1].rgb[0]+rows[i-1].rgb[1]+rows[i-1].rgb[2]));
        if(d>jump){ jump=d; jy=rows[i].y; } }
      const sky = await page.evaluate('__hc.skyState()');
      shots.push({t, brightestY:best.y, brightestRGB:best.rgb, biggestStep:jump, stepY:jy, sky});
      console.log('  t='+t+'  sunH='+sky.sunH+' duskCubic='+sky.duskCubic+' day='+sky.day
        +'   brightest row y='+best.y+' rgb('+best.rgb.join(',')+')   biggest step '+jump+' at y='+jy);
    }
    // BISECT THE PINK LINE AT THE WATERLINE. It shows at mid-morning, spans the full width and sits a few pixels above the
    // sea. Which layer owns it is not something to reason about -- the last two attempts at this horizon were lost to
    // theorising -- so each layer is hidden in turn at a fixed time and camera, and the frames say which one carries it.
    await page.evaluate('__hc.setTime(0.42)'); await sleep(900);
    await page.evaluate('__hcBR.look('+(Math.PI/2)+',-0.02)'); await sleep(700);
    for(const layer of ['ocean','fogShell','pine','sky']){
      console.log('  hiding '+layer+': '+JSON.stringify(await page.evaluate(`__hc.hideLayer('${layer}',false)`)));
      await sleep(800);
      await page.screenshot({path:path.join(OUT,'daysky-'+TAG+'-no-'+layer+'.png')});
      await page.evaluate(`__hc.hideLayer('${layer}',true)`); await sleep(500);
    }

    // And one looking UP, to see the zenith and the cloud layers, plus one at the sun.
    await page.evaluate('__hc.setTime(0.42)'); await sleep(800);
    await page.evaluate('__hcBR.look('+(Math.PI/2)+',0.62)'); await sleep(900);
    await page.screenshot({path:path.join(OUT,'daysky-'+TAG+'-zenith.png')});
    const sun = await page.evaluate('(()=>{ const d=__hc.sunDir? __hc.sunDir() : null; return d; })()').catch(()=>null);
    console.log('  sunDir hook: '+JSON.stringify(sun));
    await page.evaluate('__hcBR.look(0,0.22)'); await sleep(900);
    await page.screenshot({path:path.join(OUT,'daysky-'+TAG+'-north.png')});
    console.log('\nshots: bench/results/daysky-'+TAG+'-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
