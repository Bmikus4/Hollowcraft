// THE SUN AND MOON ON THE WATER, ALL THE WAY TO THE HORIZON.
//
// Ben 08-04: "water does not effect the sun and moon enough, it needs to be upped dramatically and from a distance it should
// show too."
//
// The second half was not a strength problem. Everything the glade added to col was erased further down by the ring landing,
// which forces the far sea onto a flat colour regardless of view angle — deliberately, since that is what stops the sea line
// disagreeing with what stands beyond it. So no amplitude could have made the track survive past ~250 blocks. It is added
// after the landing now, and __hc.glade({after:0}) restores the old path so the difference is measurable.
//
// THE GLADE IS MEASURED BY TURNING IT OFF, camera unmoved. The first version differenced a frame facing the sun against the
// same frame facing directly away, and that measures the SKY: facing away changes the sun's glow, the horizon and the aerial
// perspective at once, and it reported +86 luminance of "glade" in a band that is mostly sky — identical before and after the
// change, because none of it was the water. __hc.glade({amt:0}) removes exactly the reflection and nothing else.
//
// Four claims:
//   1. The sun's track exists at all, near the camera.
//   2. It exists in the FAR band, just under the horizon — and did not before.
//   3. It is dramatically stronger than the pre-08-04 amplitude.
//   4. A fog bank still takes it, because Ben also asked that the water and the far-sea disc fog identically.
//
//   node bench/assert-glade-distance.mjs
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
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
// Mean luminance of a crop. Crops avoid the hotbar (y<0.80), the compass (bottom-left) and the held item (bottom-right).
function crop(file, c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let s=0,n=0,hot=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const L=lum(P.data,(y*P.w+x)*P.ch); s+=L; n++; if(L>90) hot++; }
  return { mean:+(s/n).toFixed(2), hot:+(100*hot/n).toFixed(3), n };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // OVER THE WATER, and found rather than assumed. The first version stood 12 blocks above the SPAWN, which is inland: both
    // crops were terrain, and with a clean on/off control that read as the glade contributing -0.42 luminance — a working
    // reflection measured on a field of grass. Walk out along a bearing until the heightfield is below sea level.
    let wx=S.sx, wz=S.sz, found=false;
    for(let r=80; r<=900 && !found; r+=40) for(let i=0;i<12 && !found;i++){
      const a=i*Math.PI/6, x=Math.round(S.sx+Math.cos(a)*r), z=Math.round(S.sz+Math.sin(a)*r);
      const g=await page.evaluate(`__hc.groundY(${x},${z})`);
      if(g!=null && g<38){ wx=x; wz=z; found=true; } }
    console.log(`  over water at ${wx},${wz} (ground ${await page.evaluate(`__hc.groundY(${wx},${wz})`)}, sea is 40)`);
    await page.evaluate(`__hc.tpAt(${wx}+0.5, 52, ${wz}+0.5);`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2200);
    // t=0.02 is a GRAZING sun (the setTime map is offset a quarter turn from its comment: t=0 is sunrise, 0.25 noon) — the
    // hour the glade is longest, and the one the whole effect is for.
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(420); await page.evaluate(`__hc.setTime(${t})`); await sleep(200); };
    await pin(0.02);
    // Face the light, then face directly away, and difference. Aim from the sun's own direction, trying both yaw conventions.
    const sd=(await page.evaluate(`__hc.cloudProbe()`)).dir;
    let bestYaw=null, bestMean=-1;
    for(const yaw of [Math.atan2(-sd[0],-sd[2]), Math.atan2(sd[0],sd[2])]){
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.08})`); await sleep(300);
      const f=path.join(OUT,'tmp-glade-aim.png'); await page.screenshot({path:f});
      const m=crop(f,[0.30,0.70,0.50,0.78]).mean;
      if(m>bestMean){ bestMean=m; bestYaw=yaw; } }
    console.log(`  facing the sun at yaw ${bestYaw.toFixed(2)}`);
    const NEAR=[0.28,0.72,0.62,0.78], FAR=[0.28,0.72,0.478,0.512];   // FAR is a thin strip of WATER under the horizon, not straddling it
    const pairAt=async(tag,set)=>{
      await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:-0.08})`); await sleep(200);
      await page.evaluate(`__hc.glade(${JSON.stringify(set)})`); await sleep(260);
      const a=path.join(OUT,`glade-${tag}-on.png`); await page.screenshot({path:a});
      await page.evaluate(`__hc.glade({amt:0})`); await sleep(260);
      const b=path.join(OUT,`glade-${tag}-off.png`); await page.screenshot({path:b});
      return { near:+(crop(a,NEAR).mean-crop(b,NEAR).mean).toFixed(2), far:+(crop(a,FAR).mean-crop(b,FAR).mean).toFixed(2),
               nearHot:+(crop(a,NEAR).hot-crop(b,NEAR).hot).toFixed(3), farHot:+(crop(a,FAR).hot-crop(b,FAR).hot).toFixed(3) }; };

    // ---- 1+2+3. STRENGTH, AND AT DISTANCE ------------------------------------------------------------------------------
    const before=await pairAt('before',{after:0, amt:0.333});   // the old path AND the old amplitude
    const after =await pairAt('after', {after:1, amt:1});
    const st=await page.evaluate(`__hc.glade()`);
    console.log('  state: '+JSON.stringify(st));
    console.log(`  BEFORE  near +${before.near} luminance (hot +${before.nearHot}%)   far +${before.far} (hot +${before.farHot}%)`);
    console.log(`  AFTER   near +${after.near} luminance (hot +${after.nearHot}%)   far +${after.far} (hot +${after.farHot}%)`);
    check('the sun leaves a track on the water at all', after.near > 1.5, `+${after.near} luminance with the glade on against off, camera unmoved`);
    // NOT "twice as bright" near the camera: it CLIPS there. The near band went from 70% of its pixels above luminance 90 to
    // 88%, so most of the extra amplitude has nowhere to go — which is also why the frame started reading as a white pool. The
    // strength claim belongs to the near band's mean and the coverage claim to the far one.
    check('and it is stronger than it was', after.near > before.near*1.35, `near-band gain +${before.near} -> +${after.near} luminance, hot pixels +${before.nearHot}% -> +${after.nearHot}%`);
    // THE POINT OF THE CHANGE. The ring landing used to erase this band entirely.
    check('the track reaches the far water under the horizon', after.far > 1.0 && after.far > before.far*2.0,
      `far band +${before.far} -> +${after.far} luminance; the landing forces that stretch onto a flat colour, so the old path could not show a reflection there at any amplitude`);

    // ---- 4. AND THE WEATHER STILL TAKES IT ----------------------------------------------------------------------------
    await page.evaluate(`__hc.fog(0.8)`); await sleep(1200);
    const fogged=await pairAt('fogged',{after:1, amt:1});
    await page.evaluate(`__hc.fog(0)`); await sleep(600);
    console.log(`  in a 0.8 bank: near +${fogged.near}   far +${fogged.far}`);
    check('a fog bank takes the track with everything else', fogged.near < after.near*0.6,
      `near-band gain +${after.near} clear -> +${fogged.near} in a bank — Ben asked that the water and the far-sea disc fog the same way, and a highlight that survived a bank would be the one part of the sea the weather could not touch`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/glade-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
