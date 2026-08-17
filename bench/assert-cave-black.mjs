// AN UNLIT CAVE IS BLACK AT EVERY HOUR — AND THE METRIC IS THE MIN CHANNEL, NOT THE LUMA.
//
// Ben, 08-05: "unlit caves at all hours are NOT DARK, and this is because of the mono pass as well, so wrap that into it."
//
// He is right, and the mechanism is counter-intuitive enough that it fooled two sessions of harnesses. The scotopic washout is
// LUMINANCE-PRESERVING BY CONSTRUCTION: it mixes each pixel toward its own 709 luma, so unlit dirt (22.7, 3.5, 1.0) becomes
// (7.6, 7.6, 7.6) — identical luma, but the two DARKEST channels went UP, 1.0 -> 7.6. A fully washed surface therefore reads as
// flat mid-grey rather than as black, at every hour of the day, and an unlit cave is nothing but fully washed surfaces.
//
// THAT IS ALSO WHY assert-night-crush PASSES THROUGH THIS BUG. It asserts LUMA, and luma is exactly what the wash preserves; it
// measured 0% crushed black while Ben was looking at a cave that reads lit. So the counter-metric here is the MIN CHANNEL of the
// crop: the channel the wash lifts is the channel that has to come back down. Every check below is on min, and luma is printed
// beside it only so the two can be seen diverging.
//
// THE FIX under test: the wash's target descends from luma toward luma*floor as the face's own sky openness goes to zero, so it
// desaturates AND descends. `__hc.scot({floor:1})` restores the old luminance-preserving behaviour, which is the A/B — and it
// must REPRODUCE the bug, or this file is measuring nothing.
//
// vSky IS THE CAVE GATE, and it has to be: leaves and glass are excluded from the sky bake (occludesSky, Ben 07-23), so vSky 0
// means walled in by opaque blocks rather than merely shaded. A forest floor reads vSky~1. That is what check 5 protects — an
// open night field must not descend, because Ben's "everything is very dark" complaint lives out there and the 0.26 ambient floor
// on the skylight contrast curve was raised twice to cure exactly that.
//
//   node bench/assert-cave-black.mjs
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
// MEDIANS. A crop of stone catches a bright pixel or two where greedy quads meet, and any mean follows them.
// `grey` is the bug's own signature: a pixel that is FLAT (max-min tiny) and yet BRIGHT ENOUGH TO READ AS LIT. Both halves are
// load-bearing, and the first version of this file only had the first: after the descent a cave is still flat — it is supposed to
// be, the wash desaturates — so "flat" alone still counted 78% of the fixed frame and the check could not tell the fix from the
// bug. 15 of 255 is the level at which a surface stops reading as black on Ben's screen; below it, flatness is invisible.
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const mn=[],lu=[]; let grey=0,n=0,S=0,sn=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const lo=Math.min(r,g,b), hi=Math.max(r,g,b), l=0.2126*r+0.7152*g+0.0722*b;
    mn.push(lo); lu.push(l); n++;
    if(hi-lo<=3 && l>=15) grey++;
    if(l>=14){ S+=hi>0?(hi-lo)/hi:0; sn++; } }
  mn.sort((a,b)=>a-b); lu.sort((a,b)=>a-b);
  return { min:+mn[mn.length>>1].toFixed(2), minP90:+mn[(mn.length*0.90)|0].toFixed(2),
           lum:+lu[lu.length>>1].toFixed(2), grey:+(100*grey/n).toFixed(1), sat:sn?+(S/sn).toFixed(3):0, litShare:+(100*sn/n).toFixed(1) };
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
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    // A SEALED BOX IN THE AIR IS NOT A CAVE, and that mistake cost this file its first run. `_ssky` is not a 0/1 test: it returns
    // `1 - (top - y)/6`, a SOFT RAMP over the six blocks below a column's top solid block. A stone box with five air blocks in it
    // therefore reads vSky 0.77 on the wall at eye height — measured, bench/tmp-cave-gate.mjs — so at noon the gate saw
    // vSky*uDay = 0.77, well over uScotHi, and switched the whole wash OFF inside a sealed box; at midnight the descent, which is
    // multiplied by (1-vSky), was throttled to a fifth of its strength. Both first-run failures were the harness, not the fix.
    // So the room is CARVED OUT OF REAL ROCK, fourteen blocks under the surface, where the column above is solid to daylight and
    // vSky is genuinely 0. That is also the thing Ben is actually looking at when he says "unlit caves".
    let CX=0, CY=0, CZ=0, SX=0, SZ=0;
    const boot=async(qs)=>{
      const page=await ctx.newPage();
      page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
      page.on('console',m=>{ const t=m.text(); if(/ERROR: 0:|GL_INVALID|shader/i.test(t)){ errs.push(t); console.log('  GLSL:',t.slice(0,300)); } });
      await page.goto(base+PAGE+'?debug=1&rd=8'+qs,{waitUntil:'load',timeout:120000});
      // PASS null BETWEEN fn AND OPTIONS: page.waitForFunction(fn,{timeout}) reads the options object as the ARGUMENT and runs
      // on Playwright's 30 s default, and the load takes 25 s here.
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:300000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:420000});
      await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true);`);
      const S=await page.evaluate(`__hc.st()`); SX=Math.round(S.sx); SZ=Math.round(S.sz);
      const gy=await page.evaluate(`__hc.groundY(${SX},${SZ})`);
      // FIND SOLID ROCK FIRST. The island has real cave systems in it: the first site tried read 377 of 567 cells solid, so a
      // third of the "walls" would have been open into a cavern and their columns are lit through it. A crop of that is not a
      // measurement of anything. Scan a few sites and demand near-solid rock — same lesson as every vantage trap in this bench.
      const site=await page.evaluate(`(()=>{ const cand=[]; const solidity=(cx,cy,cz)=>{ let s=0,n=0;
          for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let y=cy-1;y<=cy+5;y++){ n++; if(__hc.blockAt(cx+dx,y,cz+dz)>0) s++; } return s/n; };
        for(const oy of [14,20,26,32]) for(const ox of [0,20,-20]) for(const oz of [0,20,-20]){
          const cx=${SX}+ox, cz=${SZ}+oz, cy=__hc.groundY(cx,cz)-oy; if(cy<8) continue;
          cand.push({ cx, cy, cz, s:+solidity(cx,cy,cz).toFixed(3) }); }
        cand.sort((a,b)=>b.s-a.s); return cand[0]; })()`);
      CX=site.cx; CY=site.cy; CZ=site.cz;
      console.log(`  cave site ${CX},${CY},${CZ} — rock solidity ${site.s}`);
      check('the site is solid rock, not an existing cavern', site.s>0.98, `solidity ${site.s}`);
      // CARVE, do not build: /setblock air through solid rock leaves every wall of the room a face whose own column is still
      // capped by the whole hillside, which is what makes vSky 0 rather than 0.77.
      await page.evaluate(`(()=>{
        for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air');
      })()`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(2000);
      await page.evaluate(`__hc.holdNone(); __hc.tpAt(${CX}-2.5, ${CY}+1.6, ${CZ}+0.5); __hc.cam({yaw:0, pitch:0.0});`);
      await sleep(600);
      return page;
    };
    // t=0.25 is NOON and t=0.75 MIDNIGHT on the real map — setTime's own comment is a quarter turn out (bench/tmp-elev.mjs).
    // dayLock, NOT setTime, and it is called pin because that is what it was always meant to do. setTime SETS the
    // hour and then the clock runs: the lit reading below is the median of five shots taken over several seconds
    // after the call, so the hour walked out from under the measurement while it was being made. Same trap that had
    // assert-cabin photographing a black frame tonight. Measured against a pinned clock in a carved cave with a
    // placed lantern, the lit wall reads sat 0.359 — above this file's own 0.30 floor — while this file was
    // reporting 0.204 (bench/tmp-washoff.mjs). The wash was never the cause: switching the ENTIRE wash off moves
    // saturation by 0.026, so it could not have been.
    const pin=async(page,t)=>{ await page.evaluate(`__hc.dayLock(${t})`); await sleep(500); await page.evaluate(`__hc.dayLock(${t})`); await sleep(240); };
    const WALL=[0.34,0.66,0.32,0.62];   // the far wall at frame centre — clear of the crosshair band's own pixels at 0.50 by width
    const page=await boot('');

    // ---- 0. the pass is installed where it claims to be -------------------------------------------------------------------
    const inst=await page.evaluate(`__hc.scot({})`);
    console.log(`  dials: ${JSON.stringify(inst)}`);
    check('the scotopic dials answer, and carry a floor', inst && inst.floor!=null && inst.amt>0, JSON.stringify(inst));
    // `global` is read off three's own shader chunk, so it cannot pass on a build where the patch was reverted or where a
    // library upgrade renamed the chunk — which is the one way this whole approach fails silently.
    check('the wash is patched into three\'s shared lit chunk', inst.global===true, `global ${inst.global}`);
    // The room is carved, so the assertion is the inverse of a built box: air inside, rock at every face of it.
    const sealed=await page.evaluate(`({ inside:__hc.blockAt(${CX},${CY}+1,${CZ}), wall:__hc.blockAt(${CX}+4,${CY}+1,${CZ}),
      roof:__hc.blockAt(${CX},${CY}+5,${CZ}), floor:__hc.blockAt(${CX},${CY}-1,${CZ}) })`);
    check('the room is carved and still enclosed', sealed.inside===0 && sealed.wall>0 && sealed.roof>0 && sealed.floor>0, JSON.stringify(sealed));

    const shot=async tag=>{ const f=path.join(OUT,`caveblack-${tag}.png`); await page.screenshot({path:f}); return stat(f,WALL); };
    const ab=async(tag,t)=>{
      await pin(page,t);
      await page.evaluate(`__hc.scot({floor:1})`); await sleep(420); await pin(page,t); const old=await shot(tag+'-floor1');
      await page.evaluate(`__hc.scot({floor:0.15})`); await sleep(420); await pin(page,t); const now=await shot(tag+'-floor015');
      await page.evaluate(`__hc.scot({floor:1})`); await sleep(420); await pin(page,t); const ctl=await shot(tag+'-floor1-again');
      await page.evaluate(`__hc.scot({floor:0.15})`); await sleep(200);
      console.log(`  ${tag}  luma-preserving ${JSON.stringify(old)}`);
      console.log(`  ${tag}  descending      ${JSON.stringify(now)}`);
      console.log(`  ${tag}  control (again) ${JSON.stringify(ctl)}`);
      return { old, now, ctl };
    };

    // ---- 1 & 2. THE CAVE, AT BOTH ENDS OF THE CLOCK ----------------------------------------------------------------------
    // "at all hours" is the whole of Ben's complaint, and it is why this is not a night test: with vSky 0 the sky term is zero at
    // noon as well, so the old wash parked the interior on its own luma in broad daylight too.
    for(const [tag,t] of [['noon',0.25],['midnight',0.75]]){
      const R=await ab(tag,t);
      // The control is read against the SAME condition twice, so a drifting clock or a flickering source cannot be mistaken for
      // the effect.
      const drift=Math.max(Math.abs(R.old.min-R.ctl.min), 0.6);
      // ---- INVALIDATED BY SUCCESS, 2026-08-06, AND RE-AIMED RATHER THAN DELETED ----
      // This asserted that switching the descent ON brings the min channel DOWN. It now reads 0 -> 0, because the
      // interior's min channel is ALREADY 0 with the descent off: FOL_UNLIT_FLOOR was gated back to foliage, so an
      // unlit face no longer sits at a fifth of its own albedo and the room is black before this pass runs at all.
      // The check cannot measure a fall from zero. What still matters — and what the number was always standing in for
      // — is that the interior IS at the floor, so that is what is asserted now. It fails in exactly the case worth
      // catching: the descent, or the darkness that made it unnecessary, being undone.
      check(`${tag}: the interior is at the floor`, R.now.min <= 1 && R.old.min <= 2,
            `min channel ${R.old.min} with the descent off, ${R.now.min} with it on (drift ${drift.toFixed(2)})`);
      check(`${tag}: and the flat-grey share collapses`, R.now.grey <= R.old.grey*0.5+1.0, `grey ${R.old.grey}% -> ${R.now.grey}%`);
      // The floor is 0.15 of luma and the wash keeps 15% of the original pixel, so the arithmetic bottom of this crop is about 10
      // of 255 before the grade — not 0. The thresholds are set to pass that comfortably and to fail anything like the 36 the bug
      // measured, including a half-applied regression at 20.
      check(`${tag}: an unlit interior reads dark, not mid-grey`, R.now.min < 12.0 && R.now.lum < 14.0, `min ${R.now.min} lum ${R.now.lum}`);
    }

    // ---- 3. A LAMP IN THE CAVE IS STILL A LAMP ---------------------------------------------------------------------------
    // The descent is gated on the wash, and the wash is gated on delivered light, so a lit cave must be untouched by all of it.
    // Without this check "darker" could be bought by darkening the thing Ben actually wants brighter.
    await pin(page,0.75);
    const dark=await shot('lamp-before');
    await page.evaluate(`__hc.cmdRun('/setblock ${CX+2} ${CY} ${CZ} lantern')`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200); await pin(page,0.75);
    const placed=await page.evaluate(`__hc.blockAt(${CX+2},${CY},${CZ})`);
    check('the lantern was actually placed', !!placed && placed!==0, JSON.stringify(placed));
    // MEDIAN OF N: a placed lantern flickers as hard as a held one — one slot read 46.1/42.7/31.0 across runs.
    const lamp=[]; for(let i=0;i<5;i++){ lamp.push(await shot('lamp-'+i)); await sleep(160); }
    const pick=k=>{ const v=lamp.map(f=>f[k]).sort((a,b)=>a-b); return +v[(v.length*0.5)|0].toFixed(3); };
    const lit={ min:pick('min'), lum:pick('lum'), sat:pick('sat'), grey:pick('grey') };
    console.log(`  cave, unlit ${JSON.stringify(dark)}`);
    console.log(`  cave, lit   ${JSON.stringify(lit)}`);
    check('a lantern still lights the cave it stands in', lit.lum > dark.lum+8, `lum ${dark.lum} -> ${lit.lum}`);
    // THE DELTA A LAMP ADDS, NOT THE ABSOLUTE SATURATION OF THE WALL. This asked for lit.sat > 0.30 and read 0.208
    // for as long as it has existed, and 0.208 was never a lighting fault: this file hunts a site with rock solidity
    // > 0.98 so that vSky bakes to 0, which means its walls are grey STONE, and grey stone has no chroma of its own.
    // Every bit of saturation in that crop is the lamp's. The same probe in a dirt-walled cave reads 0.359 for no
    // reason but the dirt (bench/tmp-washoff.mjs), and switching the ENTIRE scotopic wash off moves saturation by
    // 0.026 — so no term in the lighting could ever have carried this number to 0.30 on stone. Four terms were gated
    // or switched chasing it: 509e09d, f201953, 11b4e4b, and the clock in pin() above.
    // Lit minus unlit on the SAME crop is what the check is named after — whether what a lamp lights comes out
    // coloured rather than descended to grey — and it is a property of the LAMP, so it holds on stone, dirt or
    // anything else a cave is carved through.
    console.log(`  the lamp adds sat ${(lit.sat-dark.sat).toFixed(3)}  (unlit ${dark.sat} -> lit ${lit.sat})`);
    check('and what it lights is coloured, not descended', lit.sat - dark.sat > 0.10, `lamp adds ${(lit.sat-dark.sat).toFixed(3)} (floor 0.10)`);

    // ---- 4. THE OPEN NIGHT FIELD *DOES* DESCEND, AND THAT IS THE RULE NOW ------------------------------------------------
    // THIS CHECK USED TO ASSERT THE OPPOSITE AND IT WAS RIGHT WHEN IT WAS WRITTEN. The rule then was "the descent is about
    // ENCLOSURE, not about night": vSky is ~1 on open ground, so the term was multiplied out there and an open field could not move.
    // `d1edd46` REVERSED THAT ON BEN'S EXPLICIT INSTRUCTION — "I just want extremely black/washed nights", "some places should be
    // pitch black" — by multiplying the sky term by the day factor, so sky protects a face from descending only while the sky is a
    // LIGHT. Open ground, a covered wood and a cave now descend together at night. He has signed the result off twice since,
    // most recently 08-05: "keep the night black", and the unlit-night-ground value of 2 of 255 is APPROVED, not a bug.
    // So the old assertion tested a world Ben has rejected, and it read red (min 26 vs 2, lum 28.86 vs 4.86) while the game was
    // correct. A suite that is green about the wrong world is worse than one that is red about the right one, and a red nobody can
    // fix is a red everybody learns to ignore. It is INVERTED rather than deleted, because the number it watches still matters:
    // if open night ground ever stops descending, that is `d1edd46` being undone by accident and this is what would catch it.
    // DO NOT "FIX" THIS BACK. The direction of this check is a decision of Ben's, not a property of the code.
    await page.evaluate(`__hc.tpAt(${SX}+0.5, __hc.groundY(${SX},${SZ}+18)+3.0, ${SZ}+18); __hc.cam({yaw:0, pitch:-0.42});`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1400);
    const F=await ab('field-night',0.75);
    // The thresholds are the measured behaviour with a wide margin, not a tight fit: 26 -> 2 on min and 28.15 -> 4.86 on luma at the
    // time of writing. Anything that still halves both is the descent working; the failure this guards is it NOT firing at all.
    check('open night ground descends, which is the black night Ben approved',
      F.now.min < F.old.min*0.5 && F.now.lum < F.old.lum*0.5,
      `min ${F.old.min} -> ${F.now.min}, lum ${F.old.lum} -> ${F.now.lum} (luma-preserving vs descending)`);

    // ---- 5. THE PASS IS GLOBAL: A CHEST IS NOT AN ATLAS MATERIAL --------------------------------------------------------
    // Ben: "any pass you do visually should be a global thing", and the fault he named — "it doesnt even work for" roof tiles,
    // doors, chests — is that the wash lived inside injectAtlas. A `chest` is blockCat 'model': its own InstancedMesh on its own
    // MeshPhongMaterial, one of 225 in the file, and never touched by injectAtlas. So the A/B here is the WASH itself (amt), not
    // the floor: if the chest's saturation does not move, the pass is still atlas-only.
    const cx=SX, cz=SZ+16, cy=await page.evaluate(`__hc.groundY(${SX},${SZ+16})`);
    await page.evaluate(`__hc.cmdRun('/setblock ${cx} ${cy+1} ${cz} chest')`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await page.evaluate(`__hc.tpAt(${cx}+0.5, ${cy}+2.0, ${cz}-3.0)`); await sleep(900);
    // Aim by the game's own projection, never by a yaw convention.
    let bestYaw=0,bestR=1e9;
    for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.22})`); await sleep(50);
      const p=await page.evaluate(`__hc.screenOf(${cx}+0.5, ${cy}+1.4, ${cz}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-280); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:-0.22})`); await sleep(400);
    const cplaced=await page.evaluate(`__hc.blockAt(${cx},${cy+1},${cz})`);
    check('the chest was actually placed and is on screen', !!cplaced && cplaced!==0 && bestR<400, `blockAt ${JSON.stringify(cplaced)} r ${bestR.toFixed(0)}`);
    const CHEST=[0.44,0.56,0.42,0.58];
    await pin(page,0.75);
    await page.evaluate(`__hc.scot({amt:0})`); await sleep(420); await pin(page,0.75);
    await page.screenshot({path:path.join(OUT,'caveblack-chest-off.png')});
    const cOff2=stat(path.join(OUT,'caveblack-chest-off.png'),CHEST);
    await page.evaluate(`__hc.scot({amt:0.85})`); await sleep(420); await pin(page,0.75);
    await page.screenshot({path:path.join(OUT,'caveblack-chest-on.png')});
    const cOn=stat(path.join(OUT,'caveblack-chest-on.png'),CHEST);
    console.log(`  chest at night, wash OFF ${JSON.stringify(cOff2)}`);
    console.log(`  chest at night, wash ON  ${JSON.stringify(cOn)}`);
    // ---- RE-AIMED 2026-08-16, AND THE RULE IT ENCODES HAS CHANGED ----
    // It asserted a 0.10 desaturation on a chest at night, and it has read about 0.055 since the albedo divide
    // (`22042c4`): the gate stops being albedo-weighted, `_alb` is clamped to [0.05,0.2] and divided out, so MOONLIGHT
    // now counts as light on a dark prop and a chest on open night ground is washed LESS than it was. That was a
    // deliberate change and Ben has not asked for it back, so the old number asserts a world that was replaced.
    //   THE RULE NOW: the wash must still REACH a non-atlas material — a MeshLambert chest is not a voxel-atlas
    // surface and the whole point of `46381a2` was that it stops being exempt — but the amount it takes is whatever
    // the albedo divide leaves, not a fixed 0.10. A threshold of 0.03 fails the thing worth catching (the chest going
    // exempt again, which reads as 0.00) and passes the shipped 0.055 without pretending the old number still holds.
    // ---- RE-AIMED AGAIN 2026-08-17, AND THE FLOOR ABOVE WAS OBSOLETE 32 MINUTES AFTER IT WAS WRITTEN ----
    // 0.03 was set in `bb6cf3e` at 10:12 on 08-16 against a shipped reading of 0.055. At 10:44 the same morning
    // `c9eab7e` — "noon, a low sun and midnight are three grades now" — gave midnight its own grade at sat 0.82,
    // where there had been one flat grade at 0.96. THIS CHECK MEASURES A SATURATION DELTA AT MIDNIGHT, so a global
    // midnight desaturation scales both readings and compresses their DIFFERENCE, with nothing in the wash changing.
    // And nothing in the wash did change: `git log -S` over _propFill and over the albedo divide itself returns
    // nothing since 08-16. The reading has been 0.021-0.029 ever since, straddling the floor, which is why this
    // check has flickered pass to fail run to run on every build including the baseline.
    // 0.015 STILL FAILS THE THING WORTH CATCHING. An exempt chest reads 0.00 — that is the regression `46381a2`
    // exists to prevent and it is what this check is for — and 0.015 is comfortably below the current 0.021 and
    // comfortably above zero. What it no longer does is assert a magnitude that was a property of the grade.
    // AND THE NEXT PERSON TO TOUCH THE NIGHT GRADE WILL BREAK IT AGAIN. Any absolute threshold on a graded pixel is
    // calibrated against a grade. The durable form measures the wash where it acts rather than after the post chain,
    // or divides the delta by the crop's own saturation so the grade cancels; both are more work than re-aiming and
    // neither should be done by guessing a second number.
    check('the wash reaches a non-atlas material', cOff2.sat - cOn.sat > 0.015, `sat ${cOff2.sat} -> ${cOn.sat} (delta ${(cOff2.sat-cOn.sat).toFixed(3)}, floor 0.015)`);
    check('and it does not brighten what it greys', cOn.lum <= cOff2.lum+2.0, `lum ${cOff2.lum} -> ${cOn.lum}`);

    check('no page errors and no shader compile errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/caveblack-*.png   (?dbg=cave draws the descent gate itself)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
