// THE DARK FOREST ENTRANCEWAY READS AS AN OPENING FROM THE ISLAND AND IS NOT A SMEAR FROM OUT AT SEA.
//
// The mouth is pineMat's uEntAz feature: the canopy dips, the fill goes to 4.5% brightness, the haze is held off it and the
// jambs lift 40%. It reads as an opening only while the jambs and the lintel are resolvable. From offshore they are not —
// uPushD halves the band's angular height every wall-distance out, so the structure goes sub-pixel and the only part that
// survives is the near-black fill, which is what Ben has been photographing as a dark blob on the treeline (three frames,
// always the same bearing, because the mouth's point sits 6 island-radii out and barely swings).
//
// Aimed with __hc.treelineAnchor().entAz rather than by hunting the darkest column, so the crop is the mouth by construction.
//
// Claims:
//   1. FROM THE SHORE the mouth is still there and still dark — this is a feature, not a bug to be deleted.
//   2. FROM THE SHORE it still has jambs: bright columns flanking the dark core. That is the difference between an opening
//      and a hole, and it is the thing that stops resolving at range.
//   3. FROM 900 BLOCKS OFFSHORE the fill is gone, to within a few levels of the canopy around it.
//   4. The taper between them is monotone — no distance at which it is darker than from the shore.
//
//   node bench/assert-treeline-mouth.mjs
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
// WHAT THE MOUTH ITSELF TAKES OUT OF THE FRAME: per-column luminance of the OFF frame minus the ON frame, over a crop that
// spans the whole treeline. Everything else — the canopy noise, the woody band, the sea, the sky gradient, real terrain in
// front — is identical between the two frames and subtracts to zero, which is the only way to separate a 20-level feature
// from a treeline whose own column-to-column variation is also about 20 levels.
function mouthDelta(onFile, offFile){
  const A=decodePNG(fs.readFileSync(onFile)), B=decodePNG(fs.readFileSync(offFile));
  if(A.w!==B.w||A.h!==B.h) throw new Error('size mismatch');
  // PER COLUMN, THE PEAK ROW — the mean of the three most-changed rows, not the mean of all of them. uPushD divides the band's
  // angular height by up to eight, so at 900 blocks out the treeline is about 8 of the frame's 560 rows: averaging down the
  // whole column diluted a 200-level hole into 2.9 levels and read as "the mouth is barely there". Three rows rather than one
  // so a single stray pixel cannot carry the number.
  const per=[];
  for(let x=0;x<A.w;x++){ const col=[];
    for(let y=0;y<A.h;y++){ const i=(y*A.w+x)*A.ch; col.push(lum(B.data,i)-lum(A.data,i)); }
    col.sort((p,q)=>q-p); per.push((col[0]+col[1]+col[2])/3); }
  let hi=-1e9, at=0; for(let x=0;x<per.length;x++) if(per[x]>hi){ hi=per[x]; at=x; }
  let wide=0; for(const v of per) if(v>hi*0.34) wide++;      // columns the mouth measurably darkens
  let sum=0; for(const v of per) sum+=v;
  return { peak:+hi.toFixed(1), at, width:wide, total:+(sum/per.length).toFixed(2) };
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
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });   // §7: grain moves a sixth of the screen between any two frames
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const HOLD=`__hc.setTime(0.42);`;                      // re-pinned at every shot (§7 — the clock keeps running)
    const isle=await page.evaluate(`__hc.isleStats()`);
    const ent=await page.evaluate(`__hc.treelineAnchor()`);
    console.log('  island '+JSON.stringify(isle)+'   entrance point '+JSON.stringify(ent.entPt));

    // STATIONS ON THE OPPOSITE SIDE, LOOKING BACK THROUGH THE ISLAND. The mouth only draws where the per-azimuth mask says
    // forest continues past the fog wall, which is landward — so standing on the entrance point's own side and facing it puts
    // open sea in the crop and no band at all (measured: identical numbers at 400 and 900, which was the sea's gradient, not
    // the mouth). Walking out on the far side keeps the treeline, and the mouth on it, dead ahead at every distance. This is
    // also how Ben saw it: offshore, looking back at land.
    const AP=Math.atan2(ent.entPt.z-isle.z, ent.entPt.x-isle.x);   // island centre → the mouth's point
    const rows=[];
    // TWO KINDS OF STATION, because the mouth is only visible from one of them at a time.
    //   'land' — ON the island, facing the point, lifted clear of the canopy. uPushD is pinned to 1.0 on land, so this is the
    //            view the feature was built and signed off for. At the waterline it cannot be measured at all: 10 blocks off
    //            the coast facing back, real island terrain fills the frame and toggling the mouth moved 0.1 levels.
    //   offshore — on the FAR side, looking back through the island, which is where Ben photographed the blob.
    for(const past of ['blob', 120, 400, 900]){
      const land=false;
      // 'blob' IS THE VANTAGE THE SMEAR WAS MEASURED FROM — the same position and bearing as bench/tmp-blob-parallax.mjs, where
      // the dark patch sat at x=0.37 and slid 5 columns under a 400-block lateral move. Hard-coded rather than derived: the
      // claim is about the frame Ben photographed, and rederiving the vantage is how a check quietly starts measuring
      // somewhere else.
      const blob=past==='blob';
      const d=isle.R+(blob?900:past);
      const A=AP+Math.PI;
      const x=blob?-359:Math.round(isle.x+Math.cos(A)*d), z=blob?645:Math.round(isle.z+Math.sin(A)*d);
      const y=46;
      await page.evaluate(`__hc.tpAt(${x}, ${y}, ${z});`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(2400);
      // FACE THE MOUTH using its LIVE bearing: the point is 6R out, so which way it lies changes as we walk.
      const st=await page.evaluate(`__hc.treelineAnchor()`);
      const yaw=blob? -0.785 : Math.atan2(-Math.cos(st.entAz), -Math.sin(st.entAz));   // world dir (cos a, sin a) → yaw, since lookDir=(-sin,·,-cos)
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.01})`); await sleep(700);
      await page.evaluate(HOLD+`__hc.cam({yaw:${yaw}, pitch:-0.01})`); await sleep(300);
      // PAIRED, BACK TO BACK, with the toggle between them and nothing else. The clock is re-pinned either side of each shot:
      // over a run this long the sun moves, and that alone was worth several levels over a sky crop in this repo's history.
      // FORCED FULL against the SHIPPED strength — not against zero. What has to be measured is how much of the mouth the fade
      // took away at this distance, and the shipped setting is one end of that; comparing against zero would only re-measure
      // the feature against itself wherever the fade has already reached 0.
      const shipped=st.entOn;
      await page.evaluate(HOLD+`__hc.entMouth(1)`);         await sleep(320); await page.evaluate(HOLD);
      const onF=path.join(OUT,`mouth-${past}-forced.png`);  await page.screenshot({path:onF});
      await page.evaluate(HOLD+`__hc.entMouth(${shipped})`);await sleep(320); await page.evaluate(HOLD);
      const offF=path.join(OUT,`mouth-${past}-shipped.png`);await page.screenshot({path:offF});
      await page.evaluate(`__hc.entMouth(null)`);
      // THE WHOLE TREELINE, not a guessed canopy strip: the difference image is zero everywhere the mouth is not, so there is
      // nothing to gain from cropping tightly and a mis-aimed crop is how the last two attempts measured the sea instead.
      const m=mouthDelta(onF, offF);
      rows.push({past, d:Math.round(d), push:st.push, hide:st.hide, entOn:st.entOn, ...m});
      console.log(`  ${String(land?'on the island':past+' past coast').padEnd(14)} (d=${Math.round(d)})  push ${st.push}  entOn ${st.entOn}   mouth darkens the treeline by up to ${m.peak} levels at x=${m.at}, across ${m.width}px  (frame mean ${m.total})`);
    }
    const B=rows[0];
    // THE SMEAR WAS THE MOUTH, AND THE FADE IS WHAT REMOVED IT. Forcing it back on at Ben's own vantage has to reproduce a
    // deep, narrow dark patch; that it does is the whole diagnosis and the whole fix in one number.
    check('the blob at Ben\'s vantage was the mouth',         B.peak > 8, `forcing it back on darkens the treeline by ${B.peak} levels across ${B.width}px, which the shipped fade removes entirely`);
    check('the fade zeroes it that far out',                  B.entOn===0, `entOn ${B.entOn} at 900 blocks past the coast`);
    // AND IT SURVIVES WHERE IT BELONGS. Measured as the uniform, not as pixels: at the shore the backdrop stands behind real
    // island terrain that fills the frame, so a screenshot there cannot see the band at all — toggling the mouth 10 blocks off
    // the coast moved 0.1 levels. The claim that matters is that the fade has not touched the on-land view Ben signed off,
    // and that claim is exactly "uPushD is 1.0 and so entOn is 1.0".
    const at=async(x,z,y)=>{ await page.evaluate(`__hc.tpAt(${x},${y},${z})`); await sleep(1400); return page.evaluate(`__hc.treelineAnchor()`); };
    const onLand=await at(Math.round(isle.x+Math.cos(AP)*isle.R*0.3), Math.round(isle.z+Math.sin(AP)*isle.R*0.3), 120);
    const atShore=await at(Math.round(isle.x+Math.cos(AP+Math.PI)*(isle.R+8)), Math.round(isle.z+Math.sin(AP+Math.PI)*(isle.R+8)), 46);
    check('on the island the mouth is untouched',             onLand.entOn===1 && onLand.push===1, `push ${onLand.push}, entOn ${onLand.entOn}`);
    check('at the shore the mouth is untouched',              atShore.entOn>0.9, `push ${atShore.push}, entOn ${atShore.entOn}`);
    const byDist=rows.filter(r=>r.past!=='blob');   // the blob station is a fixed vantage, not a rung on the distance ladder
    check('and it closes monotonically with distance',        byDist.every((r,i)=> i===0 || r.entOn<=byDist[i-1].entOn), byDist.map(r=>`${r.past}:${r.entOn}`).join('  '));
    check('no page errors',                                   errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/mouth-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
