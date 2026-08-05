// DO SHRUBS FOG? Ben: "shrubs show through weather fog."
//
// Two readings, because either one alone can mislead. First the MATERIALS: walk the loaded chunk meshes, and for each pass
// report whether its material has fog enabled and whether the compiled program actually defines USE_FOG -- a material with
// fog:true whose shader never got the define fogs nothing, and that is invisible from the JS side alone.
// Then the FRAME: stand in a thick fog bank with shrubs in front of the camera and compare shrub pixels against the ground
// they stand on at the same distance. If the shrub is dark leaf while the ground beside it has washed to haze, that is the bug.
//
// usage: node bench/tmp-shrubfog.mjs
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

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1100,height:640} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    // The one piece of code that runs AFTER three's fog in the foliage shader is the night-foliage darkening, weighted by
    // fogFactor*(1-uDay) -- so how much `day` actually is at this hour decides whether it can act at all. Printed, because
    // "it is daytime" and "uDay is 1.0" are not the same claim.
    await page.evaluate('__hc.setTime('+(process.argv[2]||0.30)+')'); await sleep(1200);
    console.log('  clock '+(process.argv[2]||0.30)+' → day='+(await page.evaluate('__hc.skyState().day')));

    // chunkRoot is module-scoped and unreachable from here, so the materials cannot be introspected -- which is fine, the
    // frame is the honest test and the shader source is readable by hand once the frame says there is something to look for.

    // ---- A PAIRED CONTROL AT ONE DISTANCE. The first version measured the greenest pixel anywhere and reported the grass
    // six blocks from the camera, which is SUPPOSED to be green. Fog is a function of distance, so the only comparison that
    // means anything is two things at the SAME distance in the SAME frame: a grass-block pillar and a bush on a pillar.
    // Both wash by the same fogFactor if both fog. If the bush washes less, that is the bug, in one number.
    const spot = await page.evaluate(`(()=>{ const p=__hc.probe();
      // IN OPEN AIR at y=120. At ground level the camera sat inside a hillside under a canopy: the frame was black, the
      // pillars were behind terrain, and the reading was of shadow rather than of fog. Up here both subjects stand against
      // sky with nothing between them and the camera, and both are fully skylit, so the only difference left is the fog.
      const bx=Math.round(p.x), bz=Math.round(p.z), y=120;
      // SEVERAL DISTANCES. One distance cannot tell "shrubs do not fog" apart from "the bank is not thick enough near you",
      // and those want completely different fixes -- one is a shader bug, the other is the density Ben chose.
      const Ds=[12,26,45,70], pairs=[];
      for(const D of Ds){
        const gx=bx+D, gz=bz-4, ux=bx+D, uz=bz+4;
        __hc.cmdRun('/setblock '+gx+' '+y+' '+gz+' grass');
        __hc.cmdRun('/setblock '+ux+' '+y+' '+uz+' dirt');
        __hc.cmdRun('/setblock '+ux+' '+(y+1)+' '+uz+' bush');
        pairs.push({ D, grass:{x:gx,z:gz,top:y}, bush:{x:ux,z:uz,top:y+1} });
      }
      return { bx, bz, y, pairs, D:26, grassPillar:pairs[1].grass, bushBase:{x:pairs[1].bush.x,z:pairs[1].bush.z,top:y} }; })()`).catch(e=>({err:String(e)}));
    console.log('  two pillars 26 blocks out: '+JSON.stringify(spot).slice(0,280));

    const shoot=async(tag)=>{ const f=path.join(OUT,'shrubfog-'+tag+'.png'); await page.screenshot({path:f}); return decodePNG(fs.readFileSync(f)); };
    await page.evaluate('__hc.tpExact('+spot.bx+','+spot.bz+','+spot.y+')'); await sleep(2600);
    // AIM BY FEEDBACK, not by assuming which way yaw 0 faces. Two harnesses have already photographed the wrong direction
    // because the convention was guessed; screenOf reports where the target actually landed, so sweep yaw and keep the yaw
    // that centres it. One frame is allowed to pass between setting the look and reading the projection.
    const aim = await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      const tx=`+spot.grassPillar.x+`+0.5, ty=`+spot.grassPillar.top+`+0.5, tz=`+spot.grassPillar.z+`+0.5;
      let best=null;
      for(let i=0;i<32;i++){ const yaw=i/32*Math.PI*2; __hcBR.look(yaw, 0.0); await f(); await f();
        const s=__hc.screenOf(tx,ty,tz);
        if(s.onScreen){ const off=Math.hypot(s.px-s.w/2, s.py-s.h/2); if(!best||off<best.off) best={yaw:+yaw.toFixed(3), off:+off.toFixed(0), px:+s.px.toFixed(0), py:+s.py.toFixed(0)}; } }
      if(best){ __hcBR.look(best.yaw, 0.0); await f(); await f(); }
      return best; })()`);
    console.log('  aimed at the pillars: '+JSON.stringify(aim));
    // PIN THE SCENE. Foliage has vertex WIND: between the clear and the foggy frame the bush sways, and a fixed set of
    // pixels then samples partly background instead of leaf -- which shows up as the shrub "washing less", strongest at
    // close range where the sway is worth several pixels and gone by 26 blocks. That is a measurement artefact shaped
    // exactly like the bug being looked for, so the animation is stopped before either frame is taken.
    await page.evaluate('(()=>{ try{ return __hc.pinScene(); }catch(e){ return String(e.message||e); } })()');
    await sleep(1400);
    const clear=await shoot('clear');

    await page.evaluate('(()=>{ try{ return __hc.fog(0.9); }catch(e){ return __hc.cmdRun("/weather fog 0.9"); } })()');
    await sleep(4500);
    let dbg=await page.evaluate('__hc.horizonDbg()');
    console.log('  in the bank: '+JSON.stringify(dbg));
    const foggy=await shoot('fog');

    // THE PROJECTED BOX of each subject, not its colour. Colour-picking the greenest pixels in each half of the frame found
    // 17,189 "bush" pixels for a bush that covers about 900 -- it was measuring the lawn. __hc.screenOf gives the pixel the
    // block centre lands on; a small box around it, filtered to the subject's own green, is that subject and nothing else.
    const box = await page.evaluate(`(()=>({
      grass: __hc.screenOf(`+spot.grassPillar.x+`+0.5, `+spot.grassPillar.top+`+0.5, `+spot.grassPillar.z+`+0.5),
      bush:  __hc.screenOf(`+spot.bushBase.x+`+0.5, `+(spot.bushBase.top+1)+`+0.5, `+spot.bushBase.z+`+0.5) }))()`);
    console.log('  grass top projects to '+JSON.stringify(box.grass)+'\n  bush projects to      '+JSON.stringify(box.bush));
    // THE BOX HAS TO SHRINK WITH DISTANCE. A fixed 26-pixel radius is the inside of a bush at 26 blocks and a frame around one
    // at 12: the bush tile is a painted blob covering about half its block, so at close range the box reached well past the leaf
    // into sky and ground and found 362 green pixels where the same box at 26 blocks found 1046 -- backwards, for a subject that
    // is twice as big on screen. Every "shrubs fog less than the block beside them" reading this harness has produced came from
    // that one distance, so the box is now sized from the distance and always samples the blob's interior.
    const pick=(im, b, D)=>{ const px=[]; if(!b||!b.onScreen) return px;
      const sx=im.w/b.w, sy=im.h/b.h, cx=Math.round(b.px*sx), cy=Math.round(b.py*sy),
        R=Math.max(5, Math.min(34, Math.round(230/Math.max(6,D||26)*sx)));
      for(let y=Math.max(0,cy-R); y<Math.min(im.h,cy+R); y++) for(let x=Math.max(0,cx-R); x<Math.min(im.w,cx+R); x++){
        const i=(y*im.w+x)*im.ch, r=im.data[i], g=im.data[i+1], b2=im.data[i+2];
        if(g-(r+b2)/2 > 18) px.push({x,y,r,g,b:b2}); }
      return px; };
    const readAt=(im,px)=>{ let r=0,g=0,b=0; for(const p of px){ const i=(p.y*im.w+p.x)*im.ch; r+=im.data[i]; g+=im.data[i+1]; b+=im.data[i+2]; }
      const n=Math.max(1,px.length); return [r/n,g/n,b/n]; };
    const fogRGB=(()=>{ const h=dbg.fogCol; return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; })();
    // "Wash" = how far this surface travelled from its clear colour toward the fog colour. 1.0 = fully fogged out.
    const wash=(c0,c1)=>{ let num=0,den=0; for(let k=0;k<3;k++){ num+=(c1[k]-c0[k])*(fogRGB[k]-c0[k]); den+=(fogRGB[k]-c0[k])**2; }
      return den>1e-6 ? num/den : 0; };

    // EVERY DISTANCE, bush against block. If the two columns agree at each range, shrubs fog exactly like solid ground and
    // the complaint is about how far you can see in a bank -- which is a number Ben chose, not a bug in a shader.
    console.log('  bush vs grass block, wash toward the fog colour at each distance:');
    for(const pr of spot.pairs){
      const bx2 = await page.evaluate(`(()=>({ g:__hc.screenOf(`+pr.grass.x+`+0.5,`+pr.grass.top+`+0.5,`+pr.grass.z+`+0.5),
        b:__hc.screenOf(`+pr.bush.x+`+0.5,`+pr.bush.top+`+0.5,`+pr.bush.z+`+0.5) }))()`);
      const gp=pick(clear,bx2.g,pr.D), bp=pick(clear,bx2.b,pr.D);
      if(gp.length<20||bp.length<20){ console.log('     d='+String(pr.D).padStart(3)+'  too few pixels to judge (g='+gp.length+' b='+bp.length+')'); continue; }
      const g0=readAt(clear,gp), g1=readAt(foggy,gp), b0=readAt(clear,bp), b1=readAt(foggy,bp);
      const wg=wash(g0,g1)*100, wb=wash(b0,b1)*100;
      const f=c=>'rgb('+c.map(v=>v.toFixed(0)).join(',')+')';
      console.log('     d='+String(pr.D).padStart(3)+'  block '+wg.toFixed(0).padStart(3)+'% washed   bush '+wb.toFixed(0).padStart(3)+'% washed   difference '+(wg-wb).toFixed(0)+' points'
        +'\n              block '+f(g0)+' → '+f(g1)+'   bush '+f(b0)+' → '+f(b1)+'   (px g='+gp.length+' b='+bp.length+')');
    }

    const gPx=pick(clear,box.grass,spot.D), bPx=pick(clear,box.bush,spot.D);
    console.log('  fog colour rgb('+fogRGB.join(',')+')   grass-top pixels found '+gPx.length+', bush pixels found '+bPx.length);
    if(gPx.length>40 && bPx.length>40){
      const g0=readAt(clear,gPx), g1=readAt(foggy,gPx), b0=readAt(clear,bPx), b1=readAt(foggy,bPx);
      const wg=wash(g0,g1), wb=wash(b0,b1);
      console.log('  GRASS BLOCK at '+spot.D+' blocks: clear rgb('+g0.map(v=>v.toFixed(0))+') → fog rgb('+g1.map(v=>v.toFixed(0))+')   washed '+(wg*100).toFixed(0)+'%');
      console.log('  BUSH        at '+spot.D+' blocks: clear rgb('+b0.map(v=>v.toFixed(0))+') → fog rgb('+b1.map(v=>v.toFixed(0))+')   washed '+(wb*100).toFixed(0)+'%');
      console.log('  → the shrub fogs '+(wb<wg?('LESS than the block beside it, by '+((wg-wb)*100).toFixed(0)+' points — THIS IS THE BUG'):'as much as the block beside it'));
    } else console.log('  could not isolate both subjects; look at the shots by eye');

    // ---- AND AT NIGHT, which is where the suspect term lives. Foliage materials mix toward _uFolNight with weight
    // fogFactor*(1-day), so in DAYLIGHT the term is multiplied by nearly zero and cannot show -- the daytime reading above
    // proves nothing about it. At night it is at full strength, and _uFolNight is copied from _uPineFog BEFORE the weather
    // lerp pulls _uPineFog toward the pale fog colour, so foliage keeps fading to DARK inside a pale bank.
    for(const [nm,fogAmt] of [['night clear',0],['night bank',0.9]]){
      await page.evaluate('__hc.setTime(0.70)'); await sleep(1200);
      await page.evaluate('(()=>{ try{ return __hc.fog('+fogAmt+'); }catch(e){ return __hc.cmdRun("/weather '+(fogAmt?'fog '+fogAmt:'clear')+'"); } })()');
      await sleep(4200);
      const im=await shoot(nm.replace(' ','-'));
      const g=readAt(im,gPx), b=readAt(im,bPx);
      console.log('  '+nm.padEnd(12)+' grass block rgb('+g.map(v=>v.toFixed(0))+')   bush rgb('+b.map(v=>v.toFixed(0))+')');
      if(fogAmt){ dbg=await page.evaluate('__hc.horizonDbg()');
        const lum=c=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
        console.log('               fog colour #'+dbg.fogCol+'; the bush is '+(lum(g)-lum(b)).toFixed(0)
          +' luminance DARKER than the block beside it (0 means both washed the same)'); }
    }
    console.log('  shots: bench/results/shrubfog-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
