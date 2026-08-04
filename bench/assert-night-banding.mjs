// THE NIGHT SKY IS A SMOOTH GRADIENT, NOT A CONTOUR MAP.
//
// Ben 08-04: "dark lines around the darkest parts of the night sky, black lines that wrap around the darkly blotted parts."
// The cause was precision, not shading: the motion-blur path stored the scene in an RGBA8 target while the composer's own
// targets are half-float. The scene is tonemapped but still LINEAR at that point, and 8 bits of linear leave about FOUR levels
// for a sky that reads as luma 33 on screen — so its darkest parts round to zero, and the boundary of the round-to-zero region
// follows the cloud noise. That is why the artefact was a black line hugging a blotch and not an even band.
//
// TWO CHECKS, AND THE SECOND IS THE ONE THAT MATTERS. The uniform check (is the target half-float) is cheap and exact but only
// guards the mechanism I happen to know about. The pixel check — no pure black anywhere in a night sky — guards the SYMPTOM,
// so any future pass that crushes the sky to black fails it too.
//
// MEASURED, before and after, at t=0.63 looking up: 41 pixels of the sky crop at pure black on the old path, 0 now.
// A frame-average would have said nothing: the sky's mean luminance is 33.5 in both.
//
//   node bench/assert-night-banding.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// NIGHT IS t 0.63..0.94, MEASURED (bench/tmp-daymap.mjs). __hc.setTime's own comment claims 0 = midnight and it is wrong —
// uDay is 1 at t=0, and three earlier runs of this investigation photographed broad daylight because of it.
const HOURS=[0.63,0.75,0.88];
const BOX=[0.15,0.85,0.03,0.55];   // sky only: clear of the HUD corners, the hotbar and the compass ring
function skyStats(img, box){
  const {w,h,ch,data}=img; let atBlack=0, min=255, sum=0, tot=0, dips=0;
  const rows=[];
  for(let y=Math.round(h*box[2]); y<Math.round(h*box[3]); y++){
    let s=0,n=0;
    for(let x=Math.round(w*box[0]); x<Math.round(w*box[1]); x++){
      const k=(y*w+x)*ch, L=0.2126*data[k]+0.7152*data[k+1]+0.0722*data[k+2];
      if(L<=0.6) atBlack++; if(L<min) min=L; sum+=L; tot++; s+=L; n++;
    }
    rows.push(s/n);
  }
  // A LINE, not noise: grain is per-pixel and dies in a row average of ~900 px, so a row darker than its neighbours by a
  // whole level is a horizontal feature. Contour banding produces a run of these.
  for(let i=2;i<rows.length-2;i++){ const around=(rows[i-2]+rows[i-1]+rows[i+1]+rows[i+2])/4; if(around-rows[i]>=1.2) dips++; }
  return { atBlack, min:+min.toFixed(2), mean:+(sum/tot).toFixed(1), dips, rows:rows.length };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+d):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);

    const fx=await page.evaluate('__hc.postfx()');
    check('the scene render target is half-float', !fx.mbMode || fx.sceneRTHalf, `mbMode ${fx.mbMode}, type ${fx.sceneRT}`);
    // TOGGLING THE SETTING MUST NOT HAND THE 8-BIT TARGET BACK. It rebuilt the target inline, so a second copy of the
    // construction is exactly where this regresses.
    await page.evaluate('__hc.setMB(false)'); await sleep(600);
    await page.evaluate('__hc.setMB(true)'); await sleep(900);
    const fx2=await page.evaluate('__hc.postfx()');
    check('and still half-float after the POSTFX setting is toggled', !fx2.mbMode || fx2.sceneRTHalf, `mbMode ${fx2.mbMode}, type ${fx2.sceneRT}`);

    // Above the canopy, or the "sky" is black branches. Gravity pulls us back down between shots, so re-establish it each time.
    const g=await page.evaluate('__hc.probe()');
    const rows=[];
    for(const t of HOURS){
      await page.evaluate(`__hc.setTime(${t})`); await sleep(1200);
      await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`);
      await page.evaluate('__hc.cam({yaw:1.6,pitch:0.8})'); await sleep(1200);
      await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`); await sleep(500);
      const f=path.join(ROOT,'bench','results','nightband-t'+String(t).replace('.','p')+'.png');
      await page.screenshot({path:f});
      const s=skyStats(decodePNG(fs.readFileSync(f)), BOX);
      rows.push({t, ...s});
      console.log('     t '+t.toFixed(2)+'   sky mean '+String(s.mean).padStart(6)+'   min '+String(s.min).padStart(6)
        +'   pure-black px '+String(s.atBlack).padStart(6)+'   dark rows '+s.dips);
    }
    check('the sky is actually dark in these frames (or the test proves nothing)', rows.every(r=>r.mean<90), rows.map(r=>r.mean).join(' '));
    const black=rows.filter(r=>r.atBlack>0);
    check('NO pixel of the night sky is crushed to pure black', black.length===0,
      black.map(r=>`t${r.t} ${r.atBlack}px min ${r.min}`).join('; ')||`worst min luma ${Math.min(...rows.map(r=>r.min))}`);
    // Contour lines come in runs. A couple of dark rows can be a real cloud edge, which is why this is a count and not zero.
    const banded=rows.filter(r=>r.dips>6);
    check('and no run of dark contour rows across it', banded.length===0,
      banded.map(r=>`t${r.t} ${r.dips} rows`).join('; ')||`worst ${Math.max(...rows.map(r=>r.dips))} of ${rows[0].rows}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('Pure black in a night sky means a pass crushed it. Check __hc.postfx().sceneRTHalf first: 8-bit LINEAR\n'
      +'storage leaves about four levels for the whole dark sky, and the round-to-zero boundary follows the cloud noise.');
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
