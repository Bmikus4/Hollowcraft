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

    // DOES THE SUN READ AS A DISC? Look straight at it and measure the bright region: a disc fills about 78.5% of its own
    // bounding box and is as wide as it is tall. A bloom smear fills less, and its aspect wanders. Reported for the clipped
    // core (>=250) and for the whole bright area (>=200), because bloom lives between those two.
    {
      await page.evaluate('__hc.setTime(0.30)'); await sleep(900);
      const sk = await page.evaluate('__hc.skyState()');
      const yaw = Math.atan2(-sk.sunDir[0], -sk.sunDir[2]);        // lookDir convention: facing a delta (dx,dz) is atan2(-dx,-dz)
      const pitch = Math.asin(Math.max(-1,Math.min(1,sk.sunDir[1])));
      console.log('  sun at sunH='+sk.sunH+' -> look yaw '+yaw.toFixed(3)+' pitch '+pitch.toFixed(3));
      await page.evaluate('__hcBR.look('+yaw+','+pitch+')'); await sleep(900);
      console.log('  post-bloom overlay: '+JSON.stringify(await page.evaluate('__hc.sunOverlay()')));
      const f=path.join(OUT,'daysky-'+TAG+'-sun.png');
      await page.screenshot({path:f});
      const img=decodePNG(fs.readFileSync(f));
      // PROFILES, NOT A THRESHOLD. A plain "count pixels brighter than N" measured the film GRAIN: it reported 3596 pixels
      // scattered over a 414x376 box, a speckle rather than a glow. Averaging a band of rows or columns cancels the grain and
      // gives the shape directly. FWHM in both axes is the size and the aspect; the 90%-to-10% width on the flank is whether
      // there is an EDGE. A body has a narrow flank relative to its width; a bloom smear is flank all the way down.
      const L=(x,y)=>{ const i=(y*img.w+x)*img.ch; return 0.2126*img.data[i]+0.7152*img.data[i+1]+0.0722*img.data[i+2]; };
      const cxp=(img.w>>1), cyp=(img.h>>1);
      const prof=(axis)=>{ const N = axis==='x'? img.w : img.h, out=new Array(N).fill(0);
        for(let k=0;k<N;k++){ let s=0; for(let j=-4;j<=4;j++) s += axis==='x'? L(k, Math.min(img.h-1,Math.max(0,cyp+j))) : L(Math.min(img.w-1,Math.max(0,cxp+j)), k);
          out[k]=s/9; }
        return out; };
      const shape=(p,centre)=>{ const peak=p[centre];
        const base=[...p].sort((a,b)=>a-b)[Math.floor(p.length*0.25)];     // sky level: the lower quartile of the profile
        const half=base+(peak-base)*0.5, p90=base+(peak-base)*0.9, p10=base+(peak-base)*0.1;
        const cross=(from,to,level)=>{ const step=to>from?1:-1; for(let k=from;k!==to;k+=step){ if(p[k]<level) return k; } return to; };
        const rHalf=cross(centre,p.length-1,half), lHalf=cross(centre,0,half);
        const r90=cross(centre,p.length-1,p90), r10=cross(centre,p.length-1,p10);
        return { peak:+peak.toFixed(1), sky:+base.toFixed(1), fwhm:rHalf-lHalf, flank90to10:r10-r90 }; };
      const px=prof('x'), py=prof('y');
      const sx=shape(px,cxp), sy=shape(py,cyp);
      console.log('  horizontal: '+JSON.stringify(sx));
      console.log('  vertical:   '+JSON.stringify(sy));
      console.log('  aspect fwhm x/y = '+(sy.fwhm?+(sx.fwhm/sy.fwhm).toFixed(2):'n/a')
        +'   halo skirt / width = '+(sx.fwhm?+(sx.flank90to10/sx.fwhm).toFixed(2):'n/a'));
      // WHAT ACTUALLY MAKES IT A DISC is a hard LIMB and a flat interior, not the absence of a halo -- a photograph of the real
      // sun has an enormous halo and still reads as a body. So: the steepest luminance drop per pixel anywhere on the flank,
      // and how flat the middle is across the inner half of the disc.
      { const edge=(()=>{ let best=0; for(let k=cxp; k<Math.min(img.w-1,cxp+200); k++){ const d=px[k]-px[k+1]; if(d>best)best=d; } return +best.toFixed(1); })();
        const inner=(()=>{ const r=Math.max(2,(sx.fwhm>>2)); let mn=1e9,mx=-1e9; for(let k=cxp-r;k<=cxp+r;k++){ mn=Math.min(mn,px[k]); mx=Math.max(mx,px[k]); } return +(mx-mn).toFixed(1); })();
        console.log('  limb: steepest drop '+edge+' luminance per pixel;  interior variation across the inner half: '+inner
          +'   (a body wants a big drop and a small interior number)'); }
    }

    // OCCLUSION. The post-bloom disc is drawn over the finished frame with no depth buffer to test against, so its
    // visibility comes from voxel rays. Underground, all five must be blocked and the disc must go out entirely -- if this
    // reads anything above zero, the sun is being painted through solid rock.
    {
      const p = await page.evaluate('__hc.probe()');
      await page.evaluate('__hc.tpExact('+p.x+','+p.z+',12)');   // well below the surface
      await sleep(1600);
      const under = await page.evaluate('__hc.sunOverlay()');
      console.log('  UNDERGROUND overlay: '+JSON.stringify(under)+'   opacity must be ~0');
      await page.screenshot({path:path.join(OUT,'daysky-'+TAG+'-underground.png')});
      await page.evaluate('__hc.tpExact('+(P.x-40)+','+P.z+','+(P.sea+34)+')');
      await sleep(1600);
      const back = await page.evaluate('__hc.sunOverlay()');
      console.log('  back in the open:    '+JSON.stringify(back)+'   opacity must be high again');
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
