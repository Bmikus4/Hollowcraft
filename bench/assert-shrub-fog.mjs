// SHRUBS FOG LIKE THE GROUND THEY STAND ON.
//
// Ben: "shrubs show through weather fog." Measured twice, and on this build they do not: a bush and a grass block at the same
// distance in the same frame wash toward the fog colour within a couple of points of each other at 12, 26 and 45 blocks, by day
// and at night, in a 0.9 bank. The 18-point gap that made the report look confirmed came from the MEASUREMENT -- a fixed
// 26-pixel sampling box, which is the inside of a bush at 26 blocks and a frame around one at 12, so at close range it averaged
// leaf together with the sky behind it. Sized from the distance instead, the gap collapses to 5 points at 12 blocks and to -2 at
// 26, i.e. at mid range the bush is nearer the fog colour than the block beside it.
//
// This file is the guard that keeps it that way. The foliage pass is the one material in the game whose fragment shader appends
// code AFTER three's fog -- the night-foliage darkening, weighted by fogFactor*(1-uDay) -- so it is the one that can silently
// stop answering to a fog system, which is the recurring bug in this repo. If a later change gives shrubs their own fog target
// again, the numbers here move and this fails.
//
// usage: node bench/assert-shrub-fog.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let checks=0, fails=0;
function ok(name, cond, detail){ checks++; if(!cond){ fails++; console.log('  FAIL  '+name+(detail!==undefined?('   '+JSON.stringify(detail)):'')); }
  else console.log('  ok    '+name+(detail!==undefined?('   '+JSON.stringify(detail)):'')); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1100,height:640} })).newPage();
    page.on('pageerror', e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});

    // PAIRS AT THREE DISTANCES, in open air at y=120. At ground level the camera sat inside a hillside under canopy and the
    // reading was of shadow, not of fog; up here both subjects stand against sky, both fully skylit, so the only difference
    // left between them is how each one answers the fog. 70 blocks is deliberately not tested: at rd=8 the subject is a
    // handful of pixels there and the sample cannot be trusted either way.
    const spot = await page.evaluate(`(()=>{ const p=__hc.probe(); const bx=Math.round(p.x), bz=Math.round(p.z), y=120, pairs=[];
      for(const D of [12,26,45]){ const gx=bx+D, gz=bz-4, ux=bx+D, uz=bz+4;
        __hc.cmdRun('/setblock '+gx+' '+y+' '+gz+' grass');
        __hc.cmdRun('/setblock '+ux+' '+y+' '+uz+' dirt');
        __hc.cmdRun('/setblock '+ux+' '+(y+1)+' '+uz+' bush');
        pairs.push({ D, grass:{x:gx,z:gz,top:y}, bush:{x:ux,z:uz,top:y+1} }); }
      return { bx, bz, y, pairs }; })()`);
    await page.evaluate('__hc.tpExact('+spot.bx+','+spot.bz+','+spot.y+')'); await sleep(3000);

    // AIM BY FEEDBACK. Two harnesses in this repo photographed the wrong direction because the yaw convention was guessed.
    const aim = await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      const t=`+JSON.stringify(spot.pairs[1].grass)+`; let best=null;
      for(let i=0;i<32;i++){ const yaw=i/32*Math.PI*2; __hcBR.look(yaw,0.0); await f(); await f();
        const s=__hc.screenOf(t.x+0.5,t.top+0.5,t.z+0.5);
        if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw:+yaw.toFixed(3),off:+off.toFixed(0)}; } }
      if(best){ __hcBR.look(best.yaw,0.0); await f(); await f(); } return best; })()`);
    ok('the pillars are on screen', !!aim, aim);

    // PIN THE SCENE. Foliage has vertex wind: between the clear frame and the foggy one the bush sways, a fixed set of pixels
    // then samples background instead of leaf, and that reads as the shrub "washing less" -- an artefact shaped exactly like
    // the bug being looked for.
    await page.evaluate('__hc.pinScene()'); await sleep(1500);

    const shoot=async(tag)=>{ const f=path.join(OUT,'shrubfog-assert-'+tag+'.png'); await page.screenshot({path:f}); return decodePNG(fs.readFileSync(f)); };
    // The sampling box shrinks with distance: the bush tile is a painted blob covering about half its block, so one fixed radius
    // cannot sit inside it at every range. This is the bug in the measurement that made the original report look confirmed.
    const pick=(im,b,D)=>{ const px=[]; if(!b||!b.onScreen) return px;
      const sx=im.w/b.w, cx=Math.round(b.px*sx), cy=Math.round(b.py*(im.h/b.h)), R=Math.max(5, Math.min(34, Math.round(230/D*sx)));
      for(let y=Math.max(0,cy-R); y<Math.min(im.h,cy+R); y++) for(let x=Math.max(0,cx-R); x<Math.min(im.w,cx+R); x++){
        const i=(y*im.w+x)*im.ch, r=im.data[i], g=im.data[i+1], b2=im.data[i+2];
        if(g-(r+b2)/2 > 18) px.push({x,y}); }
      return px; };
    const readAt=(im,px)=>{ let r=0,g=0,b=0; for(const p of px){ const i=(p.y*im.w+p.x)*im.ch; r+=im.data[i]; g+=im.data[i+1]; b+=im.data[i+2]; }
      const n=Math.max(1,px.length); return [r/n,g/n,b/n]; };

    // THE PIXEL SETS ARE CHOSEN ONCE, IN DAYLIGHT, AND REUSED. Nothing moves between the passes -- the scene is pinned and the
    // pillars are placed blocks -- but the selector is "green-dominant by 18", and after dusk the whole frame reads rgb(1,4,5),
    // so re-selecting at night finds zero pixels of either subject and reports the shrub as untestable rather than as fogged.
    const MASK={};
    for(const [nm,t] of [['day',0.30],['night',0.70]]){
      await page.evaluate('__hc.setTime('+t+')'); await sleep(1600);
      await page.evaluate('(()=>{ try{ return __hc.fog(0); }catch(e){ return __hc.cmdRun("/weather clear"); } })()');
      await sleep(3500);
      const clear=await shoot(nm+'-clear');
      await page.evaluate('(()=>{ try{ return __hc.fog(0.9); }catch(e){ return __hc.cmdRun("/weather fog 0.9"); } })()');
      await sleep(5000);
      const dbg=await page.evaluate('__hc.horizonDbg()');
      const foggy=await shoot(nm+'-fog');
      const fogRGB=[0,2,4].map(i=>parseInt(dbg.fogCol.slice(i,i+2),16));
      // "Wash" = how far this surface travelled from its own clear colour toward the fog colour. 1 is fully fogged out. Both
      // subjects are at one distance in one frame, so if they answer the same fog they wash by the same fraction.
      const wash=(c0,c1)=>{ let num=0,den=0; for(let k=0;k<3;k++){ num+=(c1[k]-c0[k])*(fogRGB[k]-c0[k]); den+=(fogRGB[k]-c0[k])**2; }
        return den>1e-6?num/den:0; };
      console.log('  '+nm+': bank at '+dbg.wfog+', fog colour rgb('+fogRGB.join(',')+')');
      for(const pr of spot.pairs){
        const b2=await page.evaluate(`(()=>({ g:__hc.screenOf(`+pr.grass.x+`+0.5,`+pr.grass.top+`+0.5,`+pr.grass.z+`+0.5),
          b:__hc.screenOf(`+pr.bush.x+`+0.5,`+pr.bush.top+`+0.5,`+pr.bush.z+`+0.5) }))()`);
        if(nm==='day') MASK[pr.D]={ gp:pick(clear,b2.g,pr.D), bp:pick(clear,b2.b,pr.D) };
        const {gp,bp}=MASK[pr.D]||{gp:[],bp:[]};
        if(gp.length<20 || bp.length<20){ ok(nm+' d='+pr.D+': enough pixels of both subjects to judge', false, {grassPx:gp.length, bushPx:bp.length}); continue; }
        if(nm==='night'){
          // AT NIGHT THE WASH FRACTION IS MEANINGLESS: both subjects start near rgb(1,4,5) and the bank's colour is rgb(20,22,28),
          // so the denominator of "how far toward the fog colour" is a couple of luminance and the ratio is noise. What matters
          // visually is whether the bush stands out DARKER than the ground beside it once the bank is up, which is a difference.
          const lum=c=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
          const dl=lum(readAt(foggy,gp))-lum(readAt(foggy,bp));
          ok('night d='+pr.D+': in the bank the bush is not a dark hole beside the block', Math.abs(dl)<=4,
             {blockLum:+lum(readAt(foggy,gp)).toFixed(1), bushLum:+lum(readAt(foggy,bp)).toFixed(1), difference:+dl.toFixed(1)});
          continue;
        }
        const wg=wash(readAt(clear,gp), readAt(foggy,gp))*100, wb=wash(readAt(clear,bp), readAt(foggy,bp))*100;
        // 10 points of tolerance. The measured spread between the two across three distances and both hours is -2 to +5, and the
        // residual is not a shader difference: the wash fraction is computed from each subject's own clear colour, and a leaf and
        // a grass block do not start from the same one. The bug this guards against was 18 points.
        ok(nm+' d='+pr.D+': the bush washes into the bank with the block beside it', Math.abs(wg-wb)<=10,
           {blockWashed:+wg.toFixed(0), bushWashed:+wb.toFixed(0), difference:+(wg-wb).toFixed(0), grassPx:gp.length, bushPx:bp.length});
      }
    }
    await page.evaluate('(()=>{ try{ return __hc.fog(0); }catch(e){ return __hc.cmdRun("/weather clear"); } })()');

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
