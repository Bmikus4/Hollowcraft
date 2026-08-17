// THE THREE OPTICS, AIMED, SIDE BY SIDE. Ben treats them as one class ("the dot sight is wayy to tiny", "also look at
// holosights", "the attatchment scopes glass reticle is seated too high") and they have never been photographed
// together because fitting a piece needs a mousedown inside a modal — __hc.fitAtt now does it from the console.
// Each frame is cropped to the sight and scaled, because the whole question is what a 19-device-pixel reticle looks
// like and a full frame cannot answer it.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

const ZOOM=async(page,src,dst,x0,y0,w,h,k)=>{
  const b64=await page.evaluate(async(a)=>{
    const img=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=a.src; });
    const c=document.createElement('canvas'); c.width=a.w*a.k; c.height=a.h*a.k;
    const g=c.getContext('2d'); g.imageSmoothingEnabled=false;
    g.drawImage(img, a.x0, a.y0, a.w, a.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png').split(',')[1];
  }, { src:'data:image/png;base64,'+fs.readFileSync(src).toString('base64'), x0, y0, w, h, k });
  fs.writeFileSync(dst, Buffer.from(b64,'base64'));
};

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(12000);
    await page.mouse.click(640,360); await sleep(600);
    await page.evaluate('__hc.cam({pitch:0.12})');   // sky behind the sight, so its silhouette reads
    // THE SUBTRACTION. Is the plane reaching the frame at all? __hc.holoHide hides the reticle and nothing else, so
    // the same camera with it on and off differs by the hologram alone. __hc.freezeT first: the grain rides uTime and
    // has a noise floor of 5/255 across most of a frame, which is larger than a 19-pixel reticle.
    // MEASURE REDNESS, NOT DIFFERENCE. A frame-to-frame subtraction cannot work here and freezing the pose is not
    // available: __hc.freezeT pins the SHADER clock, the viewmodel's sway and breathing keep running, and the first
    // attempt measured 81% of the glass changing with its hottest pixel grey-green — the gun moving, not a reticle.
    // The reticle has a signature nothing else in this window has: it is RED, and additive, so its pixels are red-
    // dominant. Foliage is green-dominant, the anodised body is neutral, the sky is blue-dominant. Counting pixels
    // where red beats both other channels by a margin needs no second frame and so cannot be defeated by motion.
    const RED=async(f)=>page.evaluate(async(src)=>{
      const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
      const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
      const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
      const d=g.getImageData(0,0,c.width,c.height).data, W=c.width;
      const x0=580,x1=700,y0=280,y1=400;
      let n=0,best=0,at=null;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){ const i=(y*W+x)*4;
        const ex=d[i]-Math.max(d[i+1],d[i+2]);
        if(ex>12) n++;
        if(ex>best){ best=ex; at=[x,y,d[i]+','+d[i+1]+','+d[i+2]]; } }
      return { redPx:n, maxExcess:best, at };
    }, 'data:image/png;base64,'+fs.readFileSync(f).toString('base64'));

    await page.evaluate('__hc.hold("ar15")'); await sleep(600);
    console.log('  fit', JSON.stringify(await page.evaluate('__hc.fitAtt("optic","red_dot")')));
    await sleep(1200);
    await page.mouse.down({button:'right'}); await sleep(2000);
    await page.evaluate('__hc.freezeT(12.0)').catch(()=>{});
    console.log('  sight', JSON.stringify(await page.evaluate('(()=>{const s=__hc.sight&&__hc.sight(); return s?{retVisible:s.retVisible,holo:s.holo}:"no sight hook";})()')).slice(0,160));
    console.log('  ON ', JSON.stringify(await page.evaluate('__hc.holoHide(0)')));
    await sleep(1200);
    const on=path.join(OUT,'ret-on.png'); await page.screenshot({path:on});
    console.log('  OFF', JSON.stringify(await page.evaluate('__hc.holoHide(1)')));
    await sleep(1200);
    const off=path.join(OUT,'ret-off.png'); await page.screenshot({path:off});
    console.log('  WHERE  ', JSON.stringify(await page.evaluate('__hc.holoWhere()')));
    console.log('  RED in the glass, reticle ON :', JSON.stringify(await RED(on)));
    console.log('  RED in the glass, reticle OFF:', JSON.stringify(await RED(off)));
    // THE ORANGE SPECKLES. Same camera, leaves on then off, measured over the SKY only — a clean background where
    // nothing else in the game is warm, so an orange blob there is unambiguous.
    const SKY=async(f)=>page.evaluate(async(src)=>{
      const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
      const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
      const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
      const d=g.getImageData(0,0,c.width,c.height).data, W=c.width;
      let n=0,best=0,at=null;
      for(let y=40;y<300;y++)for(let x=40;x<520;x++){ const i=(y*W+x)*4;
        // ORANGE, properly: red over green over blue. The earlier min(r,g)-b test passed on yellow-green
        // foliage against a pale sky, which is what made three of its four hottest pixels green-dominant.
        const warm=(d[i]>d[i+1]+14 && d[i+1]>d[i+2]+8) ? d[i]-d[i+2] : 0;
        if(warm>30) n++;
        if(warm>best){ best=warm; at=[x,y,d[i]+','+d[i+1]+','+d[i+2]]; } }
      return { orangePx:n, maxWarm:best, at };
    }, 'data:image/png;base64,'+fs.readFileSync(f).toString('base64'));
    await page.evaluate('__hc.holoHide(0)'); await sleep(600);
    console.log('  leaves ON ', JSON.stringify(await page.evaluate('__hc.leaves(1)')).slice(0,150));
    await sleep(2000);
    const lon=path.join(OUT,'leaf-on.png'); await page.screenshot({path:lon});
    console.log('    SKY:', JSON.stringify(await SKY(lon)));
    console.log('  leaves OFF', JSON.stringify(await page.evaluate('__hc.leaves(0)')).slice(0,60));
    await sleep(2000);
    const loff=path.join(OUT,'leaf-off.png'); await page.screenshot({path:loff});
    console.log('    SKY:', JSON.stringify(await SKY(loff)));
    await page.evaluate('__hc.leaves(1)');
    // ---- BEN'S SESSION HAS SEEN A DUSK; A FRESH LOAD AT NOON HAS NOT ----
    // updateFireflies early-outs on `if(!want && !_ffPts) return`, which only protects the never-built case. So the
    // only way to reproduce his frame is to let the system BUILD at dusk and then take the clock to noon in the SAME
    // page. A harness that loads at midday can never see this, which is likely why it has survived.
    await page.evaluate('__hc.dayLock(0.52)'); await sleep(9000);      // dusk: uDay low enough that want > 0
    console.log('  at dusk  ', JSON.stringify(await page.evaluate('(()=>{try{return __hc.ffTune();}catch(e){return String(e.message||e);}})()')).slice(0,200));
    const dsk=path.join(OUT,'ff-dusk.png'); await page.screenshot({path:dsk});
    await page.evaluate('__hc.dayLock(0.25)'); await sleep(6000);      // …and now noon, without reloading
    console.log('  at noon  ', JSON.stringify(await page.evaluate('(()=>{try{return __hc.ffTune();}catch(e){return String(e.message||e);}})()')).slice(0,200));
    const nn=path.join(OUT,'ff-noon.png'); await page.screenshot({path:nn});
    console.log('    SKY at noon after a dusk:', JSON.stringify(await SKY(nn)));
    console.log('  lampPts ON ', JSON.stringify(await page.evaluate('__hc.lampPts(1)')));
    await sleep(1800);
    const lpon=path.join(OUT,'lamp-on.png'); await page.screenshot({path:lpon});
    console.log('    SKY:', JSON.stringify(await SKY(lpon)));
    console.log('  lampPts OFF', JSON.stringify(await page.evaluate('__hc.lampPts(0)')));
    await sleep(1800);
    const lpoff=path.join(OUT,'lamp-off.png'); await page.screenshot({path:lpoff});
    console.log('    SKY:', JSON.stringify(await SKY(lpoff)));
    console.log('  noclip', JSON.stringify(await page.evaluate('(__hc.holoHide(0), __hc.holoClip(0))')));
    await sleep(1400);
    const nc=path.join(OUT,'ret-noclip.png'); await page.screenshot({path:nc});
    console.log('  RED in the glass, clip OFF   :', JSON.stringify(await RED(nc)));
    await ZOOM(page, nc, path.join(OUT,'ret-noclip-zoom.png'), 570, 270, 140, 140, 8);
    await ZOOM(page, on, path.join(OUT,'ret-on-zoom.png'), 570, 270, 140, 140, 8);
    await page.mouse.up({button:'right'}); await sleep(400);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
