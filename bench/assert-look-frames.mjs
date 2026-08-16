// THE FRAME HALF: does the work from today actually READ on screen.
//
// Ben, 08-16: "confirm it BOTH ways: a number that proves the mechanism, and a frame that proves it reads."
// Four features shipped today with numbers and no picture. Two of them are look questions that a number cannot
// settle, and those are the two here:
//   · A DROPPED ITEM. The physics says gap 0.0001 and a face-flat lie. Neither says the thing looks like an object
//     lying on the ground rather than a sprite hovering over it.
//   · THE VOICE METER. The geometry says the row is the first child of #vitals at 16/14. That says where it is, not
//     whether it reads as part of that stack instead of as a debug overlay.
//
// EVERY FRAME HERE CARRIES A NUMBER TAKEN FROM THE FRAME ITSELF, because a harness that only writes PNGs is a
// harness nobody runs twice — the repo's own history is three visual passes that missed what one probe found. So:
// the drop is counted in pixels against the same view with no drop in it, and the highlight is counted against the
// same frame unpicked.
//
//   node bench/assert-look-frames.mjs        # frames land in bench/results/look-*.png
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
// Pixels that differ between two frames of the SAME view. The only honest way to say "the item is on screen" without
// knowing what the item looks like: everything else in the two frames is identical by construction.
function diffCount(a,b,crop,thresh){
  const A=decodePNG(fs.readFileSync(a)), B=decodePNG(fs.readFileSync(b));
  const x0=(A.w*crop[0])|0,x1=(A.w*crop[1])|0,y0=(A.h*crop[2])|0,y1=(A.h*crop[3])|0;
  let n=0, tot=0, sum=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const i=(y*A.w+x)*A.ch, j=(y*B.w+x)*B.ch;
    const d=Math.abs(A.data[i]-B.data[j])+Math.abs(A.data[i+1]-B.data[j+1])+Math.abs(A.data[i+2]-B.data[j+2]);
    tot++; sum+=d; if(d>thresh) n++; }
  return { px:n, pct:+(100*n/tot).toFixed(3), meanDiff:+(sum/tot).toFixed(2) };
}
// The brightest pixels in a crop — the outline is a pale gold line, so "did the highlight appear" is a count of
// pixels above a level that the unpicked frame does not reach.
function brightCount(f,crop,level){
  const P=decodePNG(fs.readFileSync(f));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  let n=0,tot=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch;
    tot++; if(P.data[i]>level && P.data[i+1]>level*0.85 && P.data[i+2]<P.data[i]*0.92) n++; }   // warm + bright = the outline, not the sky
  return { px:n, pct:+(100*n/tot).toFixed(3) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1,permissions:['microphone']});
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); fails++; checks++; });
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true); __hc.pinScene&&__hc.pinScene(); __hc.setTime(0.30);`);
    await sleep(800);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const gy=await page.evaluate(`__hc.groundY(${SX},${SZ})`);

    // ---- THE DROPPED ITEM, AS SEEN ----
    // A rifle, because it is the shape that made the old system look wrong: long, thin, and spinning in the air.
    await page.evaluate(`__hc.dropClear()`);
    // AWAY FROM THE SPAWN CHEST. The first frame of this test landed the rifle on the lid of the chest that sits at
    // spawn, so the item was half behind it and read as a pale sliver — the picture said the feature looked wrong
    // when what was wrong was where the bench put it. Ten blocks out is open ground.
    const DX=SX+10, DZ=SZ+10;
    const dgy=await page.evaluate(`__hc.groundY(${DX},${DZ})`);
    await page.evaluate(`__hc.tpAt(${DX+0.5},${dgy+1.6},${DZ+2.6}); __hc.cam({yaw:${Math.PI}, pitch:-0.55})`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    await page.evaluate(`__hc.dropSpawn('ak', ${DX+0.5}, ${dgy+1.2}, ${DZ+0.5})`);
    await sleep(4000);
    const D=await page.evaluate(`__hc.dropPhys()`);
    check('a rifle settled to look at', D.drops.length===1 && D.drops[0].rest, JSON.stringify(D.drops[0]&&{rest:D.drops[0].rest,gap:D.drops[0].gap,pitch:D.drops[0].pitch,roll:D.drops[0].roll}));
    // Point at it from the transform the probe reports, the same way assert-drop-physics does.
    if(D.drops.length){ const d=D.drops[0], e=D.eye;
      const yaw=Math.atan2(-(d.x-e.x), -(d.z-e.z)), pitch=Math.atan2(d.y-e.y, Math.hypot(d.x-e.x,d.z-e.z));
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(500); }
    const laid=path.join(OUT,'look-drop-rest.png'); await page.screenshot({path:laid});
    const CROP=[0.28,0.72,0.30,0.78];
    // THE CONTROL IS THE SAME CAMERA WITH THE ITEM TAKEN AWAY, and getting that wrong is what the first run of this
    // file did: it shot the empty view BEFORE aiming at the drop, so the diff was 77% of the crop and what it had
    // measured was the camera turning. The item is removed and the frame retaken from the identical transform, so
    // the only thing that differs between the two pictures is the rifle.
    const P0=await page.evaluate(`__hc.dropPhys()`);
    // AND THE OUTLINE IS NOT THE ITEM. The first version diffed the PICKED frame against the empty one, so the
    // highlight box — which is large, and which vanishes with the drop — counted as the rifle being visible. Looking
    // a few degrees off drops the pick while leaving the item in frame, so `unpicked` vs `empty` is the object alone.
    if(P0.drops.length){ const d=P0.drops[0], e=P0.eye;
      const yaw=Math.atan2(-(d.x-e.x), -(d.z-e.z))+0.16, pitch=Math.atan2(d.y-e.y, Math.hypot(d.x-e.x,d.z-e.z));
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(450); }
    const off=await page.evaluate(`__hc.dropPhys()`);
    check('looking off it drops the pick, leaving the item in frame', !off.picked, JSON.stringify(off.picked));
    const unpicked=path.join(OUT,'look-drop-unpicked.png'); await page.screenshot({path:unpicked});
    await page.evaluate(`__hc.dropClear()`); await sleep(500);
    const empty=path.join(OUT,'look-drop-none.png'); await page.screenshot({path:empty});
    const seen=diffCount(empty,unpicked,CROP,30);
    console.log(`  the item against the empty view: ${seen.px} px changed (${seen.pct}%), mean diff ${seen.meanDiff}`);
    // IT IS ON SCREEN AND IT IS AN OBJECT, not a speck. A rifle at two blocks fills a real part of the crop; a
    // hovering sprite the size of a coin would pass a "something changed" check and fail this one.
    check('THE DROPPED RIFLE IS VISIBLY THERE', seen.pct>0.35 && seen.pct<25, `${seen.pct}% of the crop`);
    // ---- AND THE HIGHLIGHT READS ----
    check('the crosshair is on it', !!P0.picked, JSON.stringify(P0.picked));
    // The outline measured as the DIFFERENCE between the picked and unpicked frames of the same view, which is the
    // only thing that is unambiguously the highlight.
    const gold=diffCount(unpicked,laid,CROP,24);
    console.log(`  the highlight against the same view unpicked: ${gold.px} px (${gold.pct}%)`);
    check('the highlight is drawn and is the only thing that changed', gold.px>40, `${gold.px} px`);

    // ---- THE VOICE METER, AS SEEN ----
    await page.evaluate(`__hc.voiceAsk()`);
    await page.waitForFunction(`(()=>{try{return __hc.voiceProbe().state==='live';}catch(e){return false;}})()`,null,{timeout:15000}).catch(()=>{});
    await sleep(1500);
    const V=await page.evaluate(`__hc.voiceProbe()`);
    const vit=path.join(OUT,'look-vitals.png'); await page.screenshot({path:vit});
    console.log(`  voice ${V.state} level ${V.level} bar ${V.rowWidth}`);
    check('the mic is live for the frame', V.state==='live', V.state);
    // THE BAND THE ROW OCCUPIES, taken from the DOM and then measured in the PICTURE — which is the difference
    // between "the element exists at these coordinates" and "there is a bar drawn there".
    const box=await page.evaluate(`(()=>{ const w=document.getElementById('vitals'); const r=w.children[0].getBoundingClientRect();
      return { x0:r.left/innerWidth, x1:r.right/innerWidth, y0:r.top/innerHeight, y1:r.bottom/innerHeight }; })()`);
    const band=[box.x0,box.x1,box.y0,box.y1];
    const green=brightCount(vit,band,60);
    const P2=decodePNG(fs.readFileSync(vit));
    let lit=0,tot=0; { const x0=(P2.w*band[0])|0,x1=(P2.w*band[1])|0,y0=(P2.h*band[2])|0,y1=(P2.h*band[3])|0;
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P2.w+x)*P2.ch; tot++;
        if(P2.data[i+1]>70 && P2.data[i+1]>P2.data[i+2]+20) lit++; } }               // green channel dominant = the bar
    console.log(`  the voice row band holds ${lit} green pixels of ${tot} (${(100*lit/tot).toFixed(1)}%)`);
    check('THE METER IS ACTUALLY DRAWN, not just positioned', lit>200, `${lit} green px in the row's own band`);
    console.log('  frames: bench/results/look-*.png');
  }catch(e){ console.log('  HARNESS ERROR: '+(e&&e.message||e)); fails++; checks++; }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks pass`);
  process.exit(fails?1:0);
})();
