// A LANTERN YOU HAVE SEEN KEEPS BURNING AFTER ITS CHUNK IS GONE — AND A HILL STILL HIDES IT.
//
// Ben 08-04: "light emitters need to be visible from farther away." What was wrong is cruder than any shader (measured in
// bench/tmp-emit-reach.mjs): past the chunk radius there is NO LANTERN. /setblock at 160, 224 and 288 blocks with RENDER_DIST 12
// wrote nothing — blockAt read 0, because the chunk does not exist to write to — and RENDER_DIST BOOTS AT 6, which is 96 blocks.
// Two suspects were eliminated first: the bloom threshold (a row of lamps glows identically at 0.88 and 1.15,
// assert-emitters-and-rays) and fog (switching it off moves a distant lamp's peak by under 7 of 255).
//
// HOW THIS MEASURES, and why it is not a crop of the lamp's pixels. Two attempts were thrown away:
//   1. A ROW of lamps along the view axis is COLLINEAR with the camera, so all of them project to one pixel. Seven distances
//      printed seven identical numbers. The camera walks away from ONE lamp instead.
//   2. A crop centred on the lamp contains the CROSSHAIR, a static bright ring at frame centre. It reported the same 168 glow
//      pixels at 200 blocks, at 300 blocks and in broad daylight. So the statistic here is a toggle-and-difference inside a box
//      at the lamp's own projected position, with an OFF/OFF control pair taken first — the sky moves between shots (a
//      whole-frame difference read 26,987 changed pixels with the feature off), so a difference is only evidence against that.
//
// The vantage is y=120 for both lamp and camera. At y=100 the 300-block sight line runs into a mountain and the halo correctly
// does not draw; that reading is kept as a check of its own, because a light that shines through a hillside is a bug this
// renderer has had before (Ben watched a PointLight leak through a hill, which is why the pool exists at all).
//
//   node bench/assert-emitter-reach.mjs
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
// RADIUS 14, not 40. The sprite is 7 px wide at the lamp's exact projected position; a 40-px box adds 6,000 pixels of moving
// stars, fireflies and motion-blur accumulation around it, which put the OFF/OFF control as high as 229 against a signal of 289.
function boxDiff(fa,fb,px,py,rad=14){
  const A=decodePNG(fs.readFileSync(fa)), B=decodePNG(fs.readFileSync(fb));
  const x0=Math.max(0,(px-rad)|0), x1=Math.min(A.w,(px+rad)|0), y0=Math.max(0,(py-rad)|0), y1=Math.min(A.h,(py+rad)|0);
  let mx=0, at=null, n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*A.w+x)*A.ch;
    const df=Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]);
    if(df>6)n++; if(df>mx){ mx=df; at=[x,y]; } }
  return { mx, n };
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
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(400); await page.evaluate(`__hc.setTime(${t})`); await sleep(180); };
    // CFG.WORLD_H is 128, so a lamp above that is outside the world and /setblock silently does nothing — an earlier run put
    // them at y=130 and every blockAt read 0. Three stacked lanterns, because one lamp at 300 blocks is two pixels.
    const LZ=Math.round(S.sz);
    const place=async(LX,LY)=>page.evaluate(`(()=>{ for(let k=0;k<3;k++) __hc.cmdRun('/setblock ${LX} '+(${LY}+k)+' ${LZ} lantern');
      return [__hc.blockAt(${LX},${LY},${LZ}), __hc.bid('lantern')]; })()`);
    const at=async(LX,LY,dist,t)=>{
      await page.evaluate(`__hc.tpAt(${LX}+${dist}, ${LY}+0.5, ${LZ}+0.5)`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(1000);
      // Aim with the game's own projection, never a yaw convention, and off centre so the crosshair stays out of the box.
      let bestYaw=0,bestR=1e9;
      for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:0.10})`); await sleep(80);
        const p=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${LY}+1.5, ${LZ}+0.5)`);
        if(p&&p.onScreen){ const r=Math.abs(p.px-320)+Math.abs(p.py-200); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
      await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:0.10})`); await sleep(300);
      await pin(t);
      const p=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${LY}+1.5, ${LZ}+0.5)`);
      const shot=async(on,tag)=>{ await page.evaluate(`__hc.lampHalos({on:${on}})`); await sleep(420);
        const f=path.join(OUT,`reach-${tag}.png`); await page.screenshot({path:f}); return f; };
      const c1=await shot(false,`d${dist}y${LY}t${t}-c1`), c2=await shot(false,`d${dist}y${LY}t${t}-c2`);
      const on=await shot(true,`d${dist}y${LY}t${t}-on`);
      const H=await page.evaluate(`__hc.lampHalos()`);
      const blk=await page.evaluate(`__hc.blockAt(${LX},${LY},${LZ})`);
      if(!(p&&p.onScreen)) return { off:null, on:null, H, blk, screen:null };
      return { ctrl:boxDiff(c1,c2,p.px,p.py), diff:boxDiff(c2,on,p.px,p.py), H, blk, screen:[p.px|0,p.py|0] };
    };
    // ---- CLEAR SIGHT LINE, y=120 ----------------------------------------------------------------------------------------
    // AT SPAWN, not somewhere fresh: /setblock can only write to a chunk that is LOADED, so a column 400 blocks out silently
    // placed nothing at all (blockAt 0 at every distance, and the run measured the world's own lamps).
    const LX=Math.round(S.sx);
    const placed=await place(LX,120);
    check('the lanterns are in the world to begin with', placed[0]===placed[1], `blockAt ${placed[0]} vs lantern id ${placed[1]}`);
    const r20=await at(LX,120,20,0.75), r120=await at(LX,120,120,0.75), r300=await at(LX,120,300,0.75);
    for(const [tag,r] of [['20',r20],['120',r120],['300',r300]])
      console.log(`  ${tag.padStart(4)}b y120  blockAt ${r.blk}  reg ${r.H.reg}/${r.H.emitters} lights, live ${r.H.live}  control diff ${r.ctrl.mx} (${r.ctrl.n}px)  halo diff ${r.diff.mx} (${r.diff.n}px)`);
    check('at 300 blocks the chunk has unloaded',    r300.blk===0, `blockAt ${r300.blk}`);
    check('the registry still holds its lights',     r300.H.emitters>=3 && r300.H.live>=3, `${r300.H.emitters} registered, ${r300.H.live} live`);
    // THE THRESHOLD IS 150 OF 765 AND IT IS EMPIRICAL. Two consecutive frames with the feature OFF differ by up to 88 inside
    // this box: the stars, the fireflies and the motion-blur accumulation all move between shots, and no wall-clock wait makes a
    // frame reproducible. A sprite that lands in the box reads 260-290. So 150 separates them with room on both sides, and every
    // check below prints its own control pair beside its number rather than trusting the threshold blind.
    check('the lamp still draws at 300 blocks',      r300.diff.mx>=150, `halo ${r300.diff.mx} vs control ${r300.ctrl.mx}`);
    check('and at 120 blocks',                       r120.diff.mx>=150, `halo ${r120.diff.mx} vs control ${r120.ctrl.mx}`);
    // NEAR LAMPS ARE UNTOUCHED. The ramp is zero inside 40 blocks, so at 20 the frame cannot move: a torch on the wall in front
    // of you must look exactly as it did, and a halo stacked on a lamp you are standing next to would read as a bloom bug.
    check('nothing is added within 40 blocks',        r20.diff.mx<150, `halo ${r20.diff.mx} vs control ${r20.ctrl.mx}`);
    // A HILL STILL HIDES IT. Same lamp column, same distance, 20 blocks lower: the sight line runs into terrain.
    const low=await place(LX,100);
    const r300low=await at(LX,100,300,0.75);
    console.log(`  300b y100 (mountain in the way)  halo diff ${r300low.diff.mx} (${r300low.diff.n}px), control ${r300low.ctrl.mx}`);
    check('terrain in the way still occludes it',    r300low.diff.mx<150, `halo ${r300low.diff.mx} vs control ${r300low.ctrl.mx}`);
    // BY DAY IT DOES NOT EXIST — the object is never even built until dusk, so a daylight frame cannot differ.
    const day=await at(LX,120,300,0.42);
    console.log(`  daylight at 300: live ${day.H.live}, halo diff ${day.diff.mx}, control ${day.ctrl.mx}`);
    // BY DAY THE CLAIM IS THE COUNT, NOT THE PIXELS. live 0 with the object not even visible IS the statement that nothing is
    // drawn; a daylight pixel difference measures the clouds and the waves moving between two shots, and it read 153 against a
    // 120 control with the feature provably inert.
    check('daylight is untouched',                   day.H.live===0 && day.H.visible===false, `live ${day.H.live}, visible ${day.H.visible} (pixels: halo ${day.diff.mx} vs control ${day.ctrl.mx})`);
    // ONE DRAW CALL, whatever the light count. Draws are the scarce resource here (805 at the shore), so a sprite per lamp would
    // have been the wrong shape however pretty it looked.
    await pin(0.75);
    await page.evaluate(`__hc.lampHalos({on:false})`); await sleep(400); const dOff=await page.evaluate(`__hcBRX.drawProbe()`);
    await page.evaluate(`__hc.lampHalos({on:true})`);  await sleep(400); const dOn =await page.evaluate(`__hcBRX.drawProbe()`);
    console.log(`  draws ${dOff.calls} -> ${dOn.calls}`);
    check('at most one extra draw call', dOn.calls-dOff.calls<=1, `${dOff.calls} -> ${dOn.calls}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/reach-d*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
