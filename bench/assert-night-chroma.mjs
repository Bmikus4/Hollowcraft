// UNLIT GROUND AT NIGHT IS GREY, LIT GROUND KEEPS ITS COLOUR, AND DAYLIGHT DOES NOT MOVE.
//
// Ben's "black voxeling / texture pixeling" (plan §3, backlog "Voxel hash lighting"). It is NOT black texels — assert-night-crush
// hunted those and found none, and that is why the item sat open. The artefact is CHROMA: at midnight every ground block lands on
// its most saturated hue, so a patchwork of dirt and grass reads as a hash of RED and GREEN cubes.
//
// MEASURED (bench/tmp-hash-repro.mjs, classifying the pixel set off a ?albedo frame and reading that same set out of the graded
// frames, so the two cannot be different pixels): dirt albedo (82,52,28) sat 0.66 -> night (22.7,3.5,1.0) sat 0.937, grass ->
// (11.6,15.5,1.7) sat 0.896. The channel RATIO expands as light falls: AgX's log-domain toe takes the two lower channels to zero
// while the top one survives. Value was never wrong; colour was.
//
// The fix washes a face's colour toward its own luminance as the light on it falls — dark adaptation, which is what eyes do.
// Two decisions this harness pins, both of which cost a measurement to find:
//   1. GATED ON THE LIGHT, NOT ON THE PIXEL. A pixel-luminance gate is albedo-weighted: at the same midnight it washed the dirt
//      out (0.94 -> 0.35) and left the beach sand salmon-pink, because sand is a brighter texture under the same moonlight.
//   2. ON THE ATLAS MATERIALS, NOT IN THE GRADE PASS. The night sky sits at the same luminance as this ground (sky median 17.7
//      against grass 13.7), so no post pass can separate them, and a grey night sky is a worse bug than the one being fixed.
//
//   node bench/assert-night-chroma.mjs
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
// The pixel SET comes from the albedo frame — flat texture, no lighting — so "the dirt" means the same pixels in every frame.
function classify(file){
  const P=decodePNG(fs.readFileSync(file)); const dirt=[], grass=[];
  const x0=(P.w*0.10)|0,x1=(P.w*0.80)|0,y0=(P.h*0.45)|0,y1=(P.h*0.85)|0;   // ground only: above 0.45 is the treeline and the sky, below 0.85 is the hotbar and the compass
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    if(r>60&&r<150&&g<r*0.75&&g>b*1.15) dirt.push([x,y]);
    else if(g>60&&g>r*1.25&&g>b*1.4) grass.push([x,y]); }
  return {dirt,grass};
}
// Saturation is (max-min)/max — distance from grey, which is exactly what makes a dark block read as RED rather than as dark
// ground. Luminance is reported alongside every claim, because the wrong fix for this is to brighten the night.
function readSet(file, pts){
  const P=decodePNG(fs.readFileSync(file)); let R=0,G=0,B=0,S=0,n=0;
  for(const [x,y] of pts){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b); R+=r;G+=g;B+=b; S+= mx>0?(mx-mn)/mx:0; n++; }
  return { rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)], sat:+(S/n).toFixed(3), lum:+(0.2126*R/n+0.7152*G/n+0.0722*B/n).toFixed(2), n };
}
function readCrop(file, crop){
  const P=decodePNG(fs.readFileSync(file)); const pts=[];
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) pts.push([x,y]);
  return readSet(file,pts);
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
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });   // §7: grain is noise inside a measurement of noise
    // ONE VANTAGE, used by both pages: back from a lantern on open ground, looking along it, so the frame holds the lit puddle,
    // its edge and the unlit ground beyond in a single shot.
    const setup=async(qs)=>{
      const page=await ctx.newPage();
      page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); });
      await page.goto(base+'/index.html?debug=1&rd=8'+qs,{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:120000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
      await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
      const S=await page.evaluate(`__hc.st()`);
      const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
      await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+2.6}, ${S.sz}+10.5)`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(1600);
      await page.evaluate(`__hc.setBlock(${S.sx},${gy+1},${S.sz},'lantern')`); await sleep(1000);
      await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:-0.30})`);
      return page;
    };
    // §7 and the sun-hides harness both: RE-PIN THE CLOCK AT EVERY SHOT, and a wall-clock wait is not a wait for rendering.
    const shot=async(page,t,name)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(600); await page.evaluate(`__hc.setTime(${t})`); await sleep(220);
      const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };

    const apage=await setup('&albedo=1');
    const af=await shot(apage,0.42,'chroma-albedo.png'); await apage.close();
    const C=classify(af);
    console.log(`  classified off ?albedo: ${C.dirt.length} dirt px, ${C.grass.length} grass px`);
    check('the albedo frame finds both ground types', C.dirt.length>3000 && C.grass.length>3000, `${C.dirt.length} dirt / ${C.grass.length} grass`);

    const page=await setup('');
    const S=await page.evaluate(`__hc.scot()`);
    console.log(`  live: amt ${S.amt} lo ${S.lo} hi ${S.hi}`);
    check('the washout is on by default', S.amt>0.99 && S.hi>0.05, JSON.stringify(S));

    await page.evaluate(`__hc.scot({amt:0})`); const nOff=await shot(page,0.94,'chroma-night-off.png');
    await page.evaluate(`__hc.scot({amt:1})`); const nOn =await shot(page,0.94,'chroma-night-on.png');
    await page.evaluate(`__hc.scot({amt:0})`); const dOff=await shot(page,0.42,'chroma-day-off.png');
    await page.evaluate(`__hc.scot({amt:1})`); const dOn =await shot(page,0.42,'chroma-day-on.png');

    const NoffD=readSet(nOff,C.dirt), NonD=readSet(nOn,C.dirt);
    const NoffG=readSet(nOff,C.grass), NonG=readSet(nOn,C.grass);
    const DoffD=readSet(dOff,C.dirt),  DonD=readSet(dOn,C.dirt);
    console.log(`  NIGHT dirt  off rgb ${JSON.stringify(NoffD.rgb)} sat ${NoffD.sat} lum ${NoffD.lum}  ->  on rgb ${JSON.stringify(NonD.rgb)} sat ${NonD.sat} lum ${NonD.lum}`);
    console.log(`  NIGHT grass off rgb ${JSON.stringify(NoffG.rgb)} sat ${NoffG.sat} lum ${NoffG.lum}  ->  on rgb ${JSON.stringify(NonG.rgb)} sat ${NonG.sat} lum ${NonG.lum}`);
    console.log(`  DAY   dirt  off sat ${DoffD.sat} lum ${DoffD.lum}  ->  on sat ${DonD.sat} lum ${DonD.lum}`);

    // THE ARTEFACT EXISTS, in this build, at this vantage. A check that has only ever run against the fix is not evidence:
    // amt 0 is the shipped shader with the term switched off, and it has to show the saturated hues Ben photographed.
    check('with the washout off, night ground is saturated', NoffD.sat>0.85 && NoffG.sat>0.80, `dirt ${NoffD.sat}, grass ${NoffG.sat}`);
    check('with it on, night ground is near-grey',           NonD.sat<0.32 && NonG.sat<0.32,   `dirt ${NonD.sat}, grass ${NonG.sat}`);
    // AND THE NIGHT DID NOT GET BRIGHTER. Ben has asked four separate times for night to be genuinely black, so the fix has to be
    // chroma-only. The mix is luminance-preserving in linear space; the residual +1 level is the grade's own per-channel curves
    // (S-curve, vibrance, split-tone) landing differently on a grey than on a saturated colour of the same luminance.
    check('night keeps its value', Math.abs(NonD.lum-NoffD.lum)<2.0 && Math.abs(NonG.lum-NoffG.lum)<2.0, `dirt ${NoffD.lum}->${NonD.lum}, grass ${NoffG.lum}->${NonG.lum}`);
    // DAYLIGHT IS UNTOUCHED. This is the check that killed the pixel-luminance gate: gated on the pixel, daylit dirt lost 14% of
    // its saturation at the thresholds that worked at night, because a shadowed daylit block is a dark PIXEL in full daylight.
    check('daylight chroma does not move', Math.abs(DonD.sat-DoffD.sat)<0.02, `${DoffD.sat} -> ${DonD.sat}`);
    // A LIT SURFACE KEEPS ITS COLOUR. The crop is the lantern's own puddle: warm light on grass, which must stay warm, or the fix
    // has turned every torch-lit floor in the game grey.
    const LIT=[0.42,0.60,0.36,0.46];
    const Loff=readCrop(nOff,LIT), Lon=readCrop(nOn,LIT);
    console.log(`  lantern puddle off rgb ${JSON.stringify(Loff.rgb)} sat ${Loff.sat} lum ${Loff.lum}  ->  on rgb ${JSON.stringify(Lon.rgb)} sat ${Lon.sat} lum ${Lon.lum}`);
    check('lantern-lit ground keeps its colour', Lon.sat > Loff.sat*0.80, `sat ${Loff.sat} -> ${Lon.sat}`);
    // THE SKY IS NOT AN ATLAS MATERIAL, so it cannot have moved — and it is still blue. If a future version of this moves into a
    // post pass, this is the check that goes red.
    const SKY=[0.62,0.95,0.02,0.13];
    const Soff=readCrop(nOff,SKY), Son=readCrop(nOn,SKY);
    console.log(`  night sky off rgb ${JSON.stringify(Soff.rgb)} -> on rgb ${JSON.stringify(Son.rgb)}`);
    check('the night sky is untouched and still blue', Math.abs(Son.lum-Soff.lum)<0.6 && Son.rgb[2]>Son.rgb[0]*1.3, `${JSON.stringify(Soff.rgb)} -> ${JSON.stringify(Son.rgb)}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/chroma-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
