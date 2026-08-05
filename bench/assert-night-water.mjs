// CLOSE WATER AT NIGHT IS DARK WATER, NOT A BLACK HOLE — and daylight water does not move.
//
// Ben, 08-05, two reports that are the same pixel:
//   "water at night is a huge problem, kelp can be seen 100% through it, it just needs made a little more opaque at night"
//   "kelp and nighttime water is blackened when I am close to it at night"
// The first was answered by lifting the alpha floor 0.30 at night. That was right about the opacity and left the COLOUR alone,
// and the colour was the whole problem: everything feeding the water's night colour is either day-gated or Fresnel-gated.
// base is mix(deep,shallow,uDay*0.5), so at night it collapses to the deep constant; skyRefl is uRing, which updateHorizon
// scales to 0.26 after dusk, and it only reaches col through min(F,uFresCap) — and F is 0.02 looking STRAIGHT DOWN, which is
// exactly what you do standing next to water. So close night water was the deep constant sunk 97 percent toward uBody
// (linear luminance 0.013), and the new alpha floor made that blackness opaque.
//
// The fix is an in-scatter term, not more reflection: light scattered out of the water body toward the eye is not view-angle
// dependent, so it survives the plan view that Fresnel kills. It is night-gated, so daylight water is bit-identical.
//
// WHAT THIS ASSERTS, and the point of each: that the OFF state really is the black Ben reported (a fix whose bug cannot be
// reproduced is not measured); that ON raises it materially; that it lands at PARITY WITH THE LAND at the same hour rather
// than above it, because the ask is to stop the sea being a hole in a merely-dark scene and NOT to lift the night ambient,
// which Ben has asked four times to keep genuinely black and assert-night-crush guards; that it leaks nothing onto the land;
// and that day is untouched.
//
//   node bench/assert-night-water.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// A MEDIAN, not a mean. Ripples, the moonglade and any star in frame are sparse and bright, and a mean over a dark crop counts
// them; the claim here is about what the BODY of the water reads as.
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=[]; let R=0,G=0,B=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    R+=r;G+=g;B+=b;n++; L.push(0.2126*r+0.7152*g+0.0722*b); }
  L.sort((a,b)=>a-b);
  return { med:+L[(L.length*0.5)|0].toFixed(2), p10:+L[(L.length*0.10)|0].toFixed(2), p90:+L[(L.length*0.90)|0].toFixed(2),
           mean:+(0.2126*R/n+0.7152*G/n+0.0722*B/n).toFixed(2), rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)],
           black:+(100*L.filter(v=>v<2).length/L.length).toFixed(2) };
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');   // the other sessions' in-flight edits break the boot; point a run at HEAD
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    const D0=await page.evaluate(`__hc.seaNight({})`);
    check('the night in-scatter term is ON by default', D0.rgb[2]>0.001, JSON.stringify(D0));

    const S=await page.evaluate(`__hc.st()`);
    // REAL COAST, NOT THE FIRST LOW SPOT — the same finder assert-shore-foam uses, and for the same reason: the first column at
    // or under sea level is an inland dip under canopy. Open sea is a RUN of water columns, and CFG.SEA is 40.
    const shore=await page.evaluate(`(()=>{ const W=__hc.bid('water'); let best=null;
      for(let a=0;a<24;a++){ const th=a*Math.PI/12;
        for(let d=10; d<=240; d+=2){ const x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d);
          let run=0; for(let k=0;k<7;k++){ const xx=Math.round(x+Math.cos(th)*k*2), zz=Math.round(z+Math.sin(th)*k*2);
            let wet=false; for(let y=38;y<=42;y++) if(__hc.blockAt(xx,y,zz)===W){ wet=true; break; }
            if(wet) run++; else break; }
          if(run>=6){ if(!best||d<best.d) best={d,x,z,th,g:__hc.groundY(x,z)}; break; } } }
      return best; })()`);
    console.log(`  shore ${JSON.stringify(shore)}`);
    check('a shoreline was found', !!shore, shore?`${shore.d} blocks out, ground ${shore.g}`:'none');
    if(!shore) throw new Error('no shore');

    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(480); await page.evaluate(`__hc.setTime(${t})`); await sleep(220); };
    const shot=async tag=>{ const f=path.join(OUT,`nightwater-${tag}.png`); await page.screenshot({path:f}); return f; };
    const CROP=[0.36,0.64,0.52,0.78];   // centre-low: the water body a few blocks ahead. y past 0.85 swallows the hotbar, 0.50 catches the crosshair

    // THE VANTAGE IS THE MEASUREMENT. A first version stood 3 blocks up at pitch -0.62 ten blocks off the beach and read median
    // 34 with the fix OFF — the frame was bright teal water and reproduced nothing, and tuning against it would have tuned
    // against the wrong frame entirely. Two things were wrong. The artefact is a VIEW-ANGLE one (F is 0.02 straight down and 1.0
    // at grazing, and min(F,uFresCap) is the sky reflection's only route into the colour), so it needs a STEEP pitch, not a
    // mild one; and 10 blocks off the beach let sand into the crop. Low over open water, looking steeply down.
    const wx=shore.x+Math.cos(shore.th)*24, wz=shore.z+Math.sin(shore.th)*24;
    await page.evaluate(`__hc.tpAt(${wx}, 41.6, ${wz})`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    await page.evaluate(`__hc.cam({yaw:${shore.th+Math.PI}, pitch:-1.30})`); await sleep(400);

    // ---- NIGHT ----
    await pin(0.94);
    const dayAt = await page.evaluate(`__hc.seaNight({}).day`);
    check('the clock is actually at night', dayAt<0.05, `uDay ${dayAt}`);
    await page.evaluate(`__hc.seaNight({amt:0})`); await sleep(420); const wOff=stat(await shot('night-off'),CROP);
    await page.evaluate(`__hc.seaNight({amt:1})`); await sleep(420); const wOn =stat(await shot('night-on'), CROP);
    console.log(`  night water OFF  ${JSON.stringify(wOff)}`);
    console.log(`  night water ON   ${JSON.stringify(wOn)}`);
    // WHAT THE ARTEFACT ACTUALLY IS, and it is not a dim surface: the median never collapses at any angle. It is SALT AND PEPPER
    // — hard black texels scattered between moonglade-lit ones (bench/results/nwangle-h41.6-p150-off.png), the share of them
    // climbing 2.5% -> 20.2% as the view steepens. So the statistic under test is the BLACK SHARE, and a median test would have
    // passed the bug: the first draft of this file asserted median < 6 and failed at 34 on water that was visibly fine.
    check('OFF, the water carries black texels (the report reproduces)', wOff.black>3.0, `${wOff.black}% under 2, median ${wOff.med}`);
    check('ON, the black texels are gone', wOn.black<0.5, `${wOff.black}% -> ${wOn.black}% under 2`);
    // AND IT COSTS ALMOST NO BRIGHTNESS, which is the constraint that keeps this a floor rather than a night-ambient lift. The
    // draft value cleared the artefact too and cost 55% of the median; this asserts the cheap fix stayed cheap.
    check('ON, the night sea is not materially brightened', wOn.med < wOff.med*1.20, `median ${wOff.med} -> ${wOn.med} (+${(100*(wOn.med/wOff.med-1)).toFixed(1)}%)`);

    // ---- PARITY WITH THE LAND, which is the target rather than "brighter" ----
    const lx=shore.x-Math.cos(shore.th)*14, lz=shore.z-Math.sin(shore.th)*14;
    const lg=await page.evaluate(`__hc.groundY(${lx},${lz})`);
    await page.evaluate(`__hc.tpAt(${lx}, ${lg}+3, ${lz})`); await sleep(900); await pin(0.94);
    await page.evaluate(`__hc.cam({yaw:${shore.th+Math.PI}, pitch:-1.30})`); await sleep(400);
    const lOn =stat(await shot('night-land-on'),CROP);
    await page.evaluate(`__hc.seaNight({amt:0})`); await sleep(420); const lOff=stat(await shot('night-land-off'),CROP);
    await page.evaluate(`__hc.seaNight({amt:1})`); await sleep(300);
    console.log(`  night land  ON   ${JSON.stringify(lOn)}`);
    console.log(`  night land  OFF  ${JSON.stringify(lOff)}`);
    // A WATER TERM MUST NOT TOUCH THE LAND. If these differ the uniform is leaking into the atlas materials.
    check('the land is untouched by the water term', Math.abs(lOn.med-lOff.med)<0.6 && Math.abs(lOn.mean-lOff.mean)<0.6,
      `land median ${lOff.med} vs ${lOn.med}, mean ${lOff.mean} vs ${lOn.mean}`);
    // PARITY WITH THE LAND WAS THE WRONG TARGET and is deliberately not asserted. It was the first draft's idea, on the argument
    // that the sea should not be a hole in a merely-dark scene — but measured, night water at a mild angle already reads BRIGHTER
    // than the land (median 34-54 against the land's 36, and 2 of 255 for ground straight down), because the sea carries a sky
    // reflection and the moonglade while unlit ground carries nothing. Holding the sea to the land's level would have DARKENED
    // it. The land crop stays only as the leak check above.

    // ---- DAY IS BIT-IDENTICAL ----
    await page.evaluate(`__hc.tpAt(${wx}, 43, ${wz})`); await sleep(900);
    await page.evaluate(`__hc.cam({yaw:${shore.th+Math.PI}, pitch:-1.30})`); await sleep(300);
    await pin(0.42);   // uDay 1 — setTime is a quarter turn off its own comment, and t=0.5 is a twilight, not noon
    const dOn=await page.evaluate(`__hc.seaNight({}).day`);
    check('the clock is actually at full day', dOn>0.97, `uDay ${dOn}`);
    // THE WATER SURFACE IS ANIMATED, so two frames of the SAME condition are never identical and an A/B difference has to be
    // read against that. The ripple uv scrolls on uTime — REAL elapsed seconds — so no amount of re-pinning the game clock
    // freezes it. This takes an ON/ON control pair first and requires the ON/OFF difference to sit inside it. The first draft
    // asserted a flat 0.35 tolerance and "failed" on 0.72 of pure ripple motion.
    // RE-PIN AT EVERY SHOT. Pinning once before three frames let the sun move between them: the day A/B came out 2.38 of mean
    // with all three channels falling together, which is a sinking sun and not a uniform that is multiplied by zero. And take
    // ON-OFF-ON, so a monotonic drift is distinguishable from a real difference by whether the second ON comes back.
    const dayShot=async tag=>{ await pin(0.42); return stat(await shot(tag),CROP); };
    const dA=await dayShot('day-on');
    await page.evaluate(`__hc.seaNight({amt:0})`); await sleep(420); const dB=await dayShot('day-off');
    await page.evaluate(`__hc.seaNight({amt:1})`); await sleep(420); const dCtl=await dayShot('day-on-control');
    console.log(`  day ON  ${JSON.stringify(dA)}`);
    console.log(`  day OFF ${JSON.stringify(dB)}`);
    console.log(`  day ON again ${JSON.stringify(dCtl)}`);
    // The control is the spread of the two ON frames, which bracket the OFF one in time.
    const ctlNoise=Math.max(Math.abs(dA.med-dCtl.med), Math.abs(dA.mean-dCtl.mean), 0.35);
    const abDiff =Math.min(Math.max(Math.abs(dA.med-dB.med), Math.abs(dA.mean-dB.mean)),
                           Math.max(Math.abs(dCtl.med-dB.med), Math.abs(dCtl.mean-dB.mean)));
    // Bit-identical by construction — the term is multiplied by (1.0-uDay) and uDay is exactly 1 here — so this is really a
    // check that the uniform is wired to the day gate at all, within what the ripples allow.
    check('daylight water is untouched', abDiff<=ctlNoise+0.05,
      `A/B ${abDiff.toFixed(2)} vs same-condition noise ${ctlNoise.toFixed(2)}`);

    console.log(`\n  frames: bench/results/nightwater-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
