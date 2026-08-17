// BEN'S THREE SIGNATURES, RUN AGAINST THE CONVICTED LEAVES.
// He described the orange speckles as: evenly spread, drawing THROUGH terrain, and SCALING WITH BROWSER ZOOM.
// d835d35 convicted the falling leaves on colour and on a leaves-on/leaves-off count. This asks whether the
// convict carries the other two marks — because if it does not, something else is still in his frame.
//
// THE INSTRUMENT IS PROVED BEFORE IT IS BELIEVED. f8b5a06 acquitted these leaves on a warm-pixel test that could
// not tell orange from sunlit foliage, and the acquittal stood because nobody ever made that test produce a
// positive. Four provisions, and the first three drafts of this file needed every one:
//   __hc.leafTag(1) paints the leaves magenta. Their palette is the world's palette — dirt is r>g>b, grass is
//   green-dominant — so no colour test separates leaf from ground: draft 1 read the whole floor as one 81,383
//   pixel "orange blob". Magenta is a hue nothing else here emits, so the mask is exact against any background.
//   __hc.leafFreeze(1) pins the field. __hc.freezeT pins the SHADER clock only; these leaves integrate their own
//   positions off dt, so two shots seconds apart are of different leaves. Frozen, the tagged frame becomes a
//   PIXEL MASK the untagged frames are read through, and one zoom can be compared with the next at all.
//   ONE PAGE, RESIZED — not three contexts. `_basePR` is `min(devicePixelRatio, 1.25)` captured once at load, so
//   deviceScaleFactor is NOT this game's browser zoom: draft 3 compared three page loads with different leaves in
//   each and read the difference as a size law. Chrome zoom shrinks the CSS viewport at a fixed physical window;
//   the canvas fills it, three keeps the vertical FOV, so the SAME view is drawn into FEWER buffer pixels and
//   scaled back up. Resizing the viewport at pixel ratio 1 reproduces that exactly.
//   __hc.leafDepth(0) and __hc.leafFade(0) are the two faults on switches — the positive control for each verdict.
//
// WHAT EACH ANSWER MEANS. Under zoom the buffer area falls as 1/z^2. A RESOLVED world object's pixel area falls
// with it and its physical size on the monitor does not change — no signature. A thing that cannot go below one
// pixel — a screen-sized sprite (the lamp halos are size 7, sizeAttenuation false) or sub-pixel geometry that
// lights a whole pixel anyway — holds its pixel area FLAT, is upscaled, and grows physically as you zoom in.
// That is what Ben saw.
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
const b64=f=>'data:image/png;base64,'+fs.readFileSync(f).toString('base64');
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// Magenta blobs, flood-filled, so SIZE is reported and not only a tally — size is the whole of the zoom question.
// `tiny` is the count at or below two pixels: a speckle, in Ben's sense, is a thing with no shape left.
const BLOBS=(page,f)=>page.evaluate(async(src)=>{
  const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const W=c.width,H=c.height,d=g.getImageData(0,0,W,H).data;
  const on=i=>d[i]>d[i+1]+25 && d[i+2]>d[i+1]+25 && d[i]>60 && d[i+2]>60;
  const seen=new Uint8Array(W*H), areas=[]; let px=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const p=y*W+x; if(seen[p]||!on(p*4)) continue;
    let n=0; const st=[x,y]; seen[p]=1;
    while(st.length){ const cy=st.pop(), cx=st.pop(); n++;
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){ const nx=cx+ox, ny=cy+oy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue; const q=ny*W+nx;
        if(seen[q]||!on(q*4)) continue; seen[q]=1; st.push(nx,ny); } }
    areas.push(n); px+=n; }
  areas.sort((a,b)=>a-b);
  return { dev:W+'x'+H, px, blobs:areas.length, med:areas.length?areas[areas.length>>1]:0,
           max:areas.length?areas[areas.length-1]:0, tiny:areas.filter(a=>a<=2).length };
}, b64(f));

// The orange test that convicted them (d835d35), applied ONLY to leaf pixels, before and after 4f30585, with the
// leaves in the same places. A whole-frame orange count cannot answer this: it reads ~7,000 pixels of warm world
// either way and the leaves' contribution is inside its run-to-run noise.
const THROUGH=(page,tagF,preF,postF,offF)=>page.evaluate(async(a)=>{
  const load=async(src)=>{ const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
    const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
    const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
    return g.getImageData(0,0,c.width,c.height).data; };
  const T=await load(a.tag), A=await load(a.pre), B=await load(a.post), C=await load(a.off);
  const mask=[]; for(let p=0;p<T.length/4;p++){ const i=p*4;
    if(T[i]>T[i+1]+25 && T[i+2]>T[i+1]+25 && T[i]>60 && T[i+2]>60) mask.push(i); }
  const sc=(S)=>{ let o=0,os=0,sp=0; for(const i of mask){
    if(S[i]>S[i+1]+14 && S[i+1]>S[i+2]+8 && S[i]-S[i+2]>30){ o++; if(C[i+2]>C[i]+10 && C[i+2]>C[i+1]+4) os++; }
    sp+=S[i]-S[i+2]; }
    return { orange:o, orangeOverSky:os, meanWarmth:mask.length?+(sp/mask.length).toFixed(1):0 }; };
  let sky=0; for(const i of mask) if(C[i+2]>C[i]+10 && C[i+2]>C[i+1]+4) sky++;
  return { leafPx:mask.length, ofThoseOverSky:sky, preFix:sc(A), shipped:sc(B) };
}, { tag:b64(tagF), pre:b64(preF), post:b64(postF), off:b64(offF) });

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const ctx=await browser.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(9000);
    await page.mouse.click(640,360); await sleep(500);
    // BEN'S PAGE HAS LIVED THROUGH A NIGHT; A HARNESS THAT LOADS AT MIDDAY HAS NOT. Build at dusk, then take the
    // clock to noon in the same page — the reproduction that made the speckle visible at all.
    await page.evaluate('__hc.cam({yaw:0.6,pitch:0.35})');
    await page.evaluate('__hc.dayLock(0.52)'); await sleep(9000);
    await page.evaluate('__hc.dayLock(0.25)'); await sleep(6000);
    const shot=async(tag,setup)=>{ if(setup) await page.evaluate(setup); await sleep(1400);
      const f=path.join(OUT,`speck-${tag}.png`); await page.screenshot({path:f}); return f; };

    console.log('\n  === DOES A LEAF HOLD ITS PIXEL SIZE? one page, one leaf field, three zooms ===');
    console.log('      (leaves frozen and tagged; buffer area falls 1.00 / 0.56 / 0.25 across the three)');
    await page.evaluate('(__hc.leafFreeze(1), __hc.leafTag(1))'); await sleep(900);
    for(const [w,h,z] of [[1280,720,'100%'],[960,540,'133%'],[640,360,'200%']]){
      await page.setViewportSize({width:w,height:h}); await sleep(1600);
      console.log('    zoom', z.padEnd(5), JSON.stringify(await BLOBS(page, await shot('zoom'+w))));
    }
    await page.setViewportSize({width:1280,height:720}); await sleep(1600);

    console.log('\n  === DOES 4f30585 KILL THE SPARK? same leaves, same pixels, fix off then on ===');
    const tagF =await shot('tag',  '__hc.leafTag(1)');
    const preF =await shot('pre',  '(__hc.leafTag(0), __hc.leafFade(0))');
    const postF=await shot('post', '__hc.leafFade(1)');
    const offF =await shot('off',  '__hc.leaves(0)');
    await page.evaluate('__hc.leaves(1)');
    console.log('   ', JSON.stringify(await THROUGH(page,tagF,preF,postF,offF)));

    // OCCLUSION. Ground between the eye and the leaf field. depthTest off is the positive control: it is what
    // "drawing through terrain" would look like if these were the ones doing it, and a small number with depth on
    // means nothing unless the control produces a large one. Four yaws, because one vantage is one sample and
    // draft 3 pitched straight down into a cone that held no leaves at all — a control that measured nothing.
    console.log('\n  === IS A LEAF BEHIND TERRAIN DRAWN? (depth on = shipped, depth off = the fault) ===');
    await page.evaluate('__hc.leafTag(1)');
    for(const yaw of [0.6,1.9,3.2,4.5]){
      await page.evaluate(`(__hc.leafFreeze(0), __hc.cam({yaw:${yaw},pitch:-0.45}))`); await sleep(1800);
      await page.evaluate('__hc.leafFreeze(1)'); await sleep(700);
      const on =await BLOBS(page, await shot(`occl-y${yaw}-on`, '__hc.leafDepth(1)'));
      const off=await BLOBS(page, await shot(`occl-y${yaw}-off`,'__hc.leafDepth(0)'));
      console.log(`    yaw ${yaw}   depth ON  ${String(on.px).padStart(5)} px / ${on.blobs} blobs` +
                  `      depth OFF ${String(off.px).padStart(5)} px / ${off.blobs} blobs` +
                  `      hidden by terrain: ${off.px?(100*(off.px-on.px)/off.px).toFixed(0):'--'}%`);
      await page.evaluate('__hc.leafDepth(1)');
    }
    await page.evaluate('(__hc.leafTag(0), __hc.leafFreeze(0))');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\nDONE');
})().catch(e=>{ console.error(e); process.exit(1); });
