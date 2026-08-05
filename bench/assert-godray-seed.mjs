// ONLY EMPTY SKY SEEDS A GOD RAY. A LANTERN NEXT TO THE SUN ADDS NOTHING.
//
// Ben, twice: "SOMETIMES NON-sun light sources also emit god rays", then after the first attempt at it, "lanterns and other
// lights still giving god rays". The first attempt raised the seed threshold 0.62 -> 2.2 on the arithmetic that the sun's disc is
// drawn at gain 10 — but `drawSunOverlay` paints the disc AFTER the whole post chain, so the disc is not in this pass's input at
// all. What is in it is the bright SKY near the sun, at most 1.15 in linear HDR. So 2.2 muted the real rays and left the lamps,
// which sit at about 3.6: the block-light gain times a lantern's own near-white tile.
//
// Depth separates them exactly where brightness cannot. A god ray is sunlight through a gap, so a seed must be a pixel with
// NOTHING in it — depth at the far plane. A lantern is geometry. This harness checks both halves, because a pass that has stopped
// seeding from lamps by no longer working at all would pass the first check on its own:
//   1. a lantern placed right beside the sun on screen adds nothing when the pass is toggled;
//   2. the sky around a low sun still does.
//
//   node bench/assert-godray-seed.mjs
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
// A RING, not a disc, and never the seed itself: what a shaft does is brighten the pixels AROUND the thing that seeded it. A crop
// centred on a lantern is dominated by the lantern, whose own brightness does not change when the pass is toggled.
// 120-260 px, not 26-64: the first attempt measured a ring INSIDE the sun's own halo, which reads 248 of 255 in both conditions
// because it is already saturated white. A shaft is a streak reaching well out from the disc.
function ring(file,px,py,rin=120,rout=260){
  const P=decodePNG(fs.readFileSync(file)); let s=0,n=0;
  const x0=Math.max(0,(px-rout)|0), x1=Math.min(P.w,(px+rout)|0), y0=Math.max(0,(py-rout)|0), y1=Math.min(P.h,(py+rout)|0);
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const r=Math.hypot(x-px,y-py); if(r<rin||r>rout) continue;
    s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
  return n?+(s/n).toFixed(3):null;
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
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const G0=await page.evaluate(`__hc.godrays()`);
    console.log(`  ${JSON.stringify(G0)}`);
    check('the pass exists and is depth-gated', G0.pass===true && G0.hasDepth===1, `pass ${G0.pass}, hasDepth ${G0.hasDepth}, mbMode ${G0.mbMode}`);
    check('the seed threshold is back in the sky\'s range', G0.seedMin<1.15, `seedMin ${G0.seedMin}`);
    const S=await page.evaluate(`__hc.st()`);
    // GRAZING SUN, from high in the air: t=0.492 is just before sunset on the real map (t=0 is SUNRISE — the setTime comment is a
    // quarter turn out), which is where the rays are strongest, and height keeps terrain out of the sight line.
    const LY=104;
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${LY}, ${S.sz}+0.5)`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(220); };
    await pin(0.492);
    // FACE THE SUN using its own projected position, sweeping yaw and pitch: the sun's azimuth is not a constant of the world and
    // an earlier harness in this family measured the sky beside the sun for four attempts without ever framing it.
    let best=null;
    for(let i=0;i<48;i++) for(const pitch of [0.05,0.20]){
      const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(70);
      const g=await page.evaluate(`__hc.godrays()`);
      if(g.front && Math.abs(g.sunProjXY[0])<0.45 && Math.abs(g.sunProjXY[1])<0.45){
        const r=Math.hypot(g.sunProjXY[0],g.sunProjXY[1]); if(!best||r<best.r) best={r,yaw,pitch,xy:g.sunProjXY}; } }
    check('the sun could be framed', !!best, best?`sun NDC ${JSON.stringify(best.xy)}`:'never on screen');
    if(!best) throw new Error('sun never framed');
    await page.evaluate(`__hc.cam({yaw:${best.yaw}, pitch:${best.pitch}})`); await sleep(400); await pin(0.492);
    const sunPx=[(0.5+best.xy[0]*0.5)*1000, (0.5-best.xy[1]*0.5)*560];
    console.log(`  sun at screen ${sunPx[0].toFixed(0)},${sunPx[1].toFixed(0)}`);
    const shot=async tag=>{ const f=path.join(OUT,`gray-${tag}.png`); await page.screenshot({path:f}); return f; };
    const pair=async(tag)=>{ await page.evaluate(`__hc.godrays({on:false})`); await sleep(420); const a=await shot(tag+'-off');
      await page.evaluate(`__hc.godrays({on:true})`); await sleep(420); const b=await shot(tag+'-on'); return [a,b]; };
    // ---- WHERE A SHAFT IS ACTUALLY VISIBLE: ON SOMETHING DARK ----------------------------------------------------------
    // The first two attempts measured a ring of SKY around the sun and read -0.4 either way. A shaft adds a fixed wash in linear
    // HDR, and the sky beside a low sun already sits at 150-250 of 255 where the tone curve compresses hardest — so the one place
    // the addition can be seen is the dark terrain under it, which is also where a god ray reads in play.
    // THE HUD IS THE DARKEST THING IN THE FRAME, AND IT NEVER CHANGES. This search ran to 0.80 of the frame height and kept
    // choosing (180,438) — the COMPASS, a dark disc bottom-left — so both frames of every pair measured the same static widget and
    // the pass read as doing nothing (87.06 -> 86.30). It is the trap this bench already has written down: the compass sits
    // bottom-left, the hotbar bottom-centre, the held item bottom-right and the crosshair dead centre, all four static.
    // 0.66 of the height clears the HUD band, and the crosshair box is skipped explicitly.
    const darkCrop=(file)=>{ // the darkest 120x60 patch within 340 px of the sun, chosen on the OFF frame and reused for both
      const P=decodePNG(fs.readFileSync(file)); let best=null;
      for(let cy=(0.30*P.h)|0; cy<(0.66*P.h)|0; cy+=30) for(let cx=60; cx<P.w-180; cx+=60){
        if(Math.hypot(cx+60-sunPx[0], cy+30-sunPx[1])>340) continue;
        if(Math.abs(cx+60-P.w*0.5)<70 && Math.abs(cy+30-P.h*0.5)<50) continue;   // the crosshair
        let s2=0,n2=0; for(let y=cy;y<cy+60;y++) for(let x=cx;x<cx+120;x++){ s2+=lum(P.data,(y*P.w+x)*P.ch); n2++; }
        const m=s2/n2; if(m>4 && (!best||m<best.m)) best={m,cx,cy}; }
      return best; };
    const cropMean=(file,c)=>{ const P=decodePNG(fs.readFileSync(file)); let s2=0,n2=0;
      for(let y=c.cy;y<c.cy+60;y++) for(let x=c.cx;x<c.cx+120;x++){ s2+=lum(P.data,(y*P.w+x)*P.ch); n2++; }
      return +(s2/n2).toFixed(3); };
    console.log(`  at measure time: ${JSON.stringify(await page.evaluate(`__hc.godrays()`))}`);
    const [sOff,sOn]=await pair('sun');
    const C=darkCrop(sOff);
    check('there is dark ground near the sun to measure on', !!C, C?`crop ${C.cx},${C.cy} mean ${C.m.toFixed(2)}`:'none');
    const a=cropMean(sOff,C), b=cropMean(sOn,C);
    console.log(`  dark ground near the sun ${a} -> ${b}  (+${(b-a).toFixed(3)})`);
    check('the sun makes rays on it', b-a > 1.0, `${a} -> ${b}`);
    // ---- AND A LANTERN ON THE SAME LINE ADDS NOTHING --------------------------------------------------------------------
    // ADD A LAMP rather than toggle the pass: with the pass on either way, the same crop must not brighten because a lamp is now
    // in the sun's line. The lamp goes high in the air so its own block light cannot reach the ground being measured — otherwise
    // the crop would brighten for an honest reason and prove nothing.
    const lamp=await page.evaluate(`(()=>{ const st=__hc.pos(); const yaw=${best.yaw}; let out=null;
      for(let d=16; d<=40; d+=4){
        const x=Math.round(st.x - Math.sin(yaw)*d), z=Math.round(st.z - Math.cos(yaw)*d);
        for(const dy of [2,4,6]){ const y=Math.round(st.y)+dy; if(y>=127) continue;
          __hc.cmdRun('/setblock '+x+' '+y+' '+z+' lantern');
          if(__hc.blockAt(x,y,z)===__hc.bid('lantern')){ const p=__hc.screenOf(x+0.5,y+0.5,z+0.5); if(p&&p.onScreen) return {x,y,z,px:p.px,py:p.py}; } } }
      return out; })()`);
    console.log(`  lamp ${lamp?JSON.stringify(lamp):'NOT PLACED'}`);
    check('a lantern is in frame, near the sun', !!lamp && Math.hypot(lamp.px-sunPx[0],lamp.py-sunPx[1])<330,
          lamp?`screen ${lamp.px|0},${lamp.py|0}, ${Math.hypot(lamp.px-sunPx[0],lamp.py-sunPx[1])|0}px from the sun`:'-');
    await sleep(1200); await pin(0.492);
    const withLamp=await shot('with-lamp');
    const c2=cropMean(withLamp,C);
    console.log(`  same crop with a lantern in the sun's line ${b} -> ${c2}  (${(c2-b).toFixed(3)})`);
    check('the lantern seeds no shaft of its own', Math.abs(c2-b) < (b-a)*0.4, `+${(c2-b).toFixed(3)} against the sun's own +${(b-a).toFixed(3)}`);
    console.log(`  for the record: a lantern's surface sits near 3.6 in linear HDR and the near-sun sky at 1.00-1.15, which is why a`);
    console.log(`  brightness threshold could not separate them at any value; the seed is depth now, and the gain is ${G0.seedMin}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/gray-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
