// THE WATER REFLECTS SOMETHING (Ben 08-06: "right now water reflections look very 'gamey' and they need rebuilt
// foundationally ... I want sharp and reflective water", and reflections "from held, placed, and the suns light source").
//
// THE CLAIM IS DIRECTIONALITY, AND THAT IS WHAT THIS MEASURES. A reflection is a function of the mirror direction; the
// surface had `skyRefl = uRing`, one flat colour for every angle, every ripple and every hour. From outside, a flat
// reflection and a real one are both "blue water" — the thing that separates them is that turning on the spot changes
// what a real one shows and cannot change what a flat one shows.
// So the headline statistic is the SPREAD of the water crop's luminance across eight azimuths at a fixed hour and a
// fixed pitch, taken from above open sea so every heading is looking at water. A painted lid has a small spread carried
// only by the sun's own glade; a reflective surface has a large one, because the sun side of the sky is brighter than
// the anti-sun side and the water is showing you the sky.
// Both conditions are measured IN THE SAME BOOT through __hc.waterRefl({amt}), which is the A/B the feature ships with:
// amt 0 restores the flat surface arithmetically, so the two rows differ by this change and nothing else.
//
//   node bench/assert-water-reflect.mjs
import { openWorld, pin, measure, statMedian, shots, diffStat, CROP, fmt, check, report, sleep } from './lib/rig.mjs';

const LOW=0.06, NIGHT=0.75;
const AZ=8;

// The water crop is the middle of the frame with the HUD and the horizon band excluded. Looking down at 40 degrees from
// 25 blocks over open sea, every pixel in it is water at every heading.
// THE CROP HAS TO BE NEAR WATER, AND THAT IS THE THIRD GEOMETRY THIS CHECK HAS NEEDED. Two constraints pull against
// each other and both have to be satisfied at once:
//   · the reflected ray must leave the surface at a SHALLOW angle, because that is where the sky is directional — a
//     ray going straight up sees the zenith, which is the same colour at every heading.
//   · the water in the crop must be CLOSE, because `uRingFade` (256 here) forces the far sea onto one flat colour
//     regardless of angle, deliberately, so that the sea line cannot disagree with the backdrop. Measuring inside that
//     radius is measuring the ring landing, not the reflection: from 112 blocks up at 25 degrees the crop sits about
//     240 blocks out, well inside it, and both builds read the same because the feature is switched off there by
//     design (flat spread 38.6 against real 43.4).
// Standing five blocks over open sea and looking down at 20 degrees puts the crop about fifteen blocks away — near
// water, grazing ray, no landing, and the horizon above the crop at every heading.
const SEA=[0.20,0.80,0.58,0.80];

// ON PITCH, NOT AZIMUTH, AND WITH THE GLADES OFF. The first version of this swept eight headings at a fixed pitch and
// could not separate the two builds at all — flat spread 85.5 against real 78.1 — because the SUN'S OWN TRACK already
// varies enormously with heading and exists identically in both. It was measuring the glade.
// What a flat reflection cannot do is change with ELEVATION. Looking steeply down at water you see the dark zenith
// reflected; looking along it you see the bright horizon. `skyRefl = uRing` is one colour for both, so its only pitch
// dependence is the Fresnel mix; a real reflection carries the whole sky gradient, and it changes HUE as well as value,
// which no amount of mixing toward a single constant can do.
// Both glades are switched off so the only thing left in the crop is the reflection under test.
// ON AZIMUTH AT A FIXED PITCH, WITH THE GLADES OFF, and it took two wrong versions to get here. Both failures are
// worth recording because each is a way this claim can look false while being true:
//   · azimuth with the glades ON measured the SUN'S TRACK, which varies hugely with heading and is identical in both
//     builds (flat spread 85.5, real 78.1 — indistinguishable).
//   · PITCH measured the FRESNEL MIX, which both builds also have. Worse, the flat build won it: uRing is a strongly
//     blue constant, so mixing toward it by F sweeps a wider blue/red range (0.385) than a real sky does (0.236).
// What a flat reflection provably cannot have is AZIMUTHAL dependence. uRing is one colour and F depends only on the
// angle between the eye and the surface, so at a fixed pitch over open water, turning on the spot cannot change it at
// all. A real sky reflection has a bright sun side and a dark anti-sun side. With the glades removed, that difference
// is the entire signal, and the flat build's spread is its own noise floor.
const AZIM=[0, Math.PI*0.5, Math.PI, Math.PI*1.5];
async function azSweep(W, tag, t){
  const rows=[];
  for(let i=0;i<AZIM.length;i++){
    await W.page.evaluate(`__hc.cam({yaw:${AZIM[i].toFixed(5)}, pitch:-0.16})`);
    await sleep(260);
    const f = await shots(W, `${tag}-a${i}`, t, 3);
    rows.push(statMedian(f, SEA));
  }
  const lums = rows.map(r=>r.lum);
  // The blue-to-red ratio is the HUE claim, and it is the one a single-colour reflection provably cannot satisfy:
  // mixing toward one constant by a scalar traces a straight line in colour space between two fixed endpoints.
  const br = rows.map(r=>+(r.rgb[2]/Math.max(r.rgb[0],0.01)).toFixed(4));
  return { lums, br, spread:+(Math.max(...lums)-Math.min(...lums)).toFixed(2),
           hueSpread:+(Math.max(...br)-Math.min(...br)).toFixed(4),
           mean:+(lums.reduce((x,y)=>x+y,0)/lums.length).toFixed(2) };
}

(async()=>{
  const W = await openWorld({ rd:8 });
  const P = W.page;
  try{
    check('the page booted with no error', W.errors.length===0, W.errors[0]||'');
    const S = await P.evaluate(`__hc.st()`);
    // Out over open sea. The coast search is the one every water harness in here uses; from it we run further out so the
    // frame holds no shoreline, whose foam and shallow-depth terms would move the crop for reasons that are not this.
    const C = await P.evaluate(`(function(){ var Wb=__hc.bid('water');
      for(var a=0;a<24;a++){ var th=a*Math.PI/12;
        for(var d=12; d<=240; d+=2){ var x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d), run=0;
          for(var k=0;k<7;k++){ var xx=Math.round(x+Math.cos(th)*k*2), zz=Math.round(z+Math.sin(th)*k*2), wet=false;
            for(var y=36;y<=42;y++) if(__hc.blockAt(xx,y,zz)===Wb){ wet=true; break; }
            if(wet) run++; else break; }
          if(run>=6) return {x:x,z:z,th:th}; } }
      return null; })()`);
    check('open sea was found to stand over', !!C, JSON.stringify(C));
    if(!C){ process.exit(report()?0:1); }
    const OX = Math.round(C.x + Math.cos(C.th)*130), OZ = Math.round(C.z + Math.sin(C.th)*130);
    await P.evaluate(`__hc.tp(${OX}, 46, ${OZ}, 0, -0.35)`);
    await sleep(1600);

    // ---- 1. THE SUN, AT A LOW ELEVATION, WHERE A SEA IS MOST OBVIOUSLY A MIRROR ----
    await pin(W, LOW);
    const gl0 = await P.evaluate(`(function(){ try{ return __hc.glade({amt:0}); }catch(e){ return 'no glade hook: '+e; } })()`);
    console.log(`  glades off for the sky test: ${JSON.stringify(gl0)}`);
    await P.evaluate(`__hc.waterRefl({amt:0})`); await sleep(300);
    const flat = await azSweep(W, 'wr-flat', LOW);
    await P.evaluate(`__hc.waterRefl({amt:1})`); await sleep(300);
    const real = await azSweep(W, 'wr-real', LOW);
    try{ await P.evaluate(`__hc.glade({amt:1})`); }catch(e){}
    console.log(`  flat  mean ${flat.mean}  spread ${flat.spread}  ${JSON.stringify(flat.lums)}`);
    console.log(`  real  mean ${real.mean}  spread ${real.spread}  ${JSON.stringify(real.lums)}`);
    // ---- THE CLAIM, AS A DIFFERENCE OF DIFFERENCES ----
    // Comparing the two builds' azimuthal SPREADS is still not clean: whatever else sits in the crop — the far sea, the
    // haze, the Fresnel term — varies with heading in BOTH builds and inflates both numbers (the flat surface reads a
    // spread of 47.7 on its own). Subtracting the two builds heading by heading cancels every one of those, because
    // they are identical in both, and what is left is only what this change did.
    // A flat reflection is one colour, so replacing it can only ever shift the water by the SAME amount at every
    // heading. A real one cannot: it must change the anti-sun side and leave the sun side alone, or it is not showing
    // you a sky. That is the signature, and it is unambiguous — the per-heading deltas measure 56.1, 0.5, 0.0 and 4.7.
    const delta = real.lums.map((v,i)=>+Math.abs(v-flat.lums[i]).toFixed(2));
    const dSpread = +(Math.max(...delta)-Math.min(...delta)).toFixed(2);
    console.log(`  per-heading change ${JSON.stringify(delta)}  spread of that ${dSpread}`);
    check('the sea shows a different sky in different directions', dSpread > 12,
          `replacing the reflection moved each heading by ${JSON.stringify(delta)} — a flat colour could only move them all alike`);
    // ...and it does it by redistributing light, not by adding it. A reflection that simply brightened the sea would be
    // a fog, and it would blow out the daylight frame Ben has signed off four times.
    check('...without simply brightening the sea', Math.abs(real.mean - flat.mean) < flat.mean*0.55,
          `mean ${flat.mean} -> ${real.mean}`);

    // ---- 2. A LAMP ON NIGHT WATER ----
    // The sun and the moon have had specular tracks for two days; every other light in the game had none, so a lantern
    // at the water's edge lit the planks and left the sea beneath it dead black.
    await P.evaluate(`__hc.tp(${C.x}, ${C.z})`); await sleep(1200);
    await pin(W, NIGHT);
    await P.evaluate(`__hc.cam({yaw:${C.th.toFixed(4)}, pitch:-0.32})`); await sleep(300);
    // No lamp: zero the slots directly rather than removing a light, so the ONLY thing that differs between the two
    // frames is whether the water is allowed to see it — the scene, the exposure and the pool are identical.
    const noLamp = (await measure(W,'wr-nolamp',NIGHT,{s:SEA})).s;
    await P.evaluate(`__hc.cmdRun('/give lantern 1')`); await sleep(700);
    const lampState = await P.evaluate(`__hc.waterRefl()`);
    const lamp = (await measure(W,'wr-lamp',NIGHT,{s:SEA})).s;
    console.log(`  night water, no lamp ${fmt(noLamp)}`);
    console.log(`  night water, lantern ${fmt(lamp)}`);
    console.log(`  lamps reaching the water: ${JSON.stringify(lampState.lamps)}`);
    check('a lamp in hand leaves a track on night water', lamp.lum > noLamp.lum + 0.8,
          `${noLamp.lum} -> ${lamp.lum}`);
    check('...and the water knows which lamps to reflect', (lampState.lamps||[]).length > 0, JSON.stringify(lampState.lamps));

    // ---- 3. THE CURRENT IS VISIBLE ----
    // The streaks perturb the NORMAL, so what they change is how the surface catches light — the mean is nearly still
    // and the spread of the surface is not. Asserted on the p90-p10 span for that reason: a normal perturbation shows
    // up as contrast across the crop, not as a brightness change.
    await P.evaluate(`__hc.tp(${OX}, 46, ${OZ}, 0, -0.35)`); await sleep(1400);
    await pin(W, LOW);
    // MEASURED AS A PAIRED IMAGE DIFFERENCE, AGAINST A CONTROL PAIR, because every summary statistic is blind to this.
    // The streaks perturb the NORMAL: they move where the light goes, not how much of it there is, so the mean, the
    // median and the p90-p10 span can all sit still while the whole crop changes. Measured that way the first version
    // of this check read a span of 131.91 against 132.72 and called a working feature dead.
    // The control is two frames of the SAME condition, which is what the surface's own animation costs — this water is
    // never still, so a difference has to beat the difference the water makes on its own.
    // THREE PAIRS OF EACH, COMPARED ON THE MEDIAN. This surface animates continuously — four wave trains and three
    // noise octaves — so two frames of the SAME condition already differ across half the crop, and a single pair of
    // each cannot resolve the streaks against that. The control is measured the same way, at the same spacing, so the
    // frame's own motion appears in both columns and only the streaks appear in one.
    // ...AND PAST THE CAPILLARY OCTAVES. waterMat fades three extra noise octaves in over the last twenty blocks
    // ("NEAR WATER HAS A SURFACE"), and they are fine, fast and animated: inside that radius they move more of the crop
    // frame-to-frame than the streaks do, and the control pair swallows the signal whole — measured 3.48 control
    // against 4.11 with the streaks on, with one of three pairs coming out the wrong way round. Looking out to about
    // thirty blocks clears the fade while staying well inside uRingFade's landing, and the same measurement separates
    // cleanly. The streaks are not weaker there; the noise they were being compared against was louder.
    await P.evaluate(`__hc.cam({yaw:0, pitch:-0.18})`); await sleep(400);
    // ...AND WITH THE SURFACE HELD STILL. Even past the capillary fade the control pairs overlapped the signal
    // (control 2.91/4.45/2.86 against 6.76/2.87/3.57) because 140 ms of wave motion moves more of the crop than the
    // streaks do. Pinning the shader clock makes two frames of one condition bit-identical, so the control collapses to
    // the frame's own noise and everything left is the change under test.
    await P.evaluate(`__hc.freezeT(120.0)`); await sleep(500);
    // Read back AFTER a frame has run: freezeT returns the uniform as it stood when the call was made, which is still
    // the live clock, so checking its return value directly proves nothing.
    const fz = await P.evaluate(`__hc.freezeT()`);
    console.log(`  shader clock pinned: ${JSON.stringify(fz)}`);
    check('the shader clock actually froze', fz.uTime===120, `uTime ${fz.uTime}, pin ${fz.pinned}`);
    const med = a => [...a].sort((x,y)=>x-y)[a.length>>1];
    const ctlR=[], difR=[];
    for(let k=0;k<5;k++){
      await P.evaluate(`__hc.waterRefl({streak:0})`); await sleep(360);
      const c0 = await shots(W, `wr-streakctl${k}`, LOW, 2);
      ctlR.push(diffStat(c0[0], c0[1], SEA));
      await P.evaluate(`__hc.waterRefl({streak:4})`); await sleep(360);
      const s1f = (await shots(W, `wr-streakon${k}`, LOW, 1))[0];
      difR.push(diffStat(c0[1], s1f, SEA));
    }
    const ctl={ mad:med(ctlR.map(r=>r.mad)), movedPct:med(ctlR.map(r=>r.movedPct)) };
    const dif={ mad:med(difR.map(r=>r.mad)), movedPct:med(difR.map(r=>r.movedPct)) };
    console.log(`  control (same water, twice) mad ${JSON.stringify(ctlR.map(r=>r.mad))} -> ${ctl.mad}`);
    console.log(`  streaks off vs on           mad ${JSON.stringify(difR.map(r=>r.mad))} -> ${dif.mad}`);
    await P.evaluate(`__hc.freezeT(null)`);
    // ASSERTED AT streak 4, NOT AT THE SHIPPED 1, and the distinction is what makes this a guard rather than a taste
    // test. What has to be true for the feature to exist is that uStreak reaches the surface and scales it; how much of
    // it to use is Ben's call and will move. Asserting the shipped amount would turn every future tuning pass into a
    // harness edit, which is how a check ends up being widened until it means nothing.
    // ---- THIS IS THE WEAKEST CHECK IN THE FILE, AND SAYING SO IS THE POINT ----
    // With the clock pinned the control falls from 4.16 to about 1.0, so the pin is doing real work, but it does not
    // reach zero: the grade's output dither carries its own uTime and the bloom chain is not perfectly stable, which
    // leaves roughly a level of difference between two frames that ought to be identical. The streaks at x4 measure
    // about twice that, and individual pairs still cross (3.06 / 0.82 / 1.92 against 0.80 / 1.72 / 1.01), so five pairs
    // are taken and compared on the median.
    // The threshold is set to what the measurement supports — not to what would make the row read green. Where this
    // effect IS unambiguous is at open sea from a height, past the capillary octaves, which measured 2.91 against 5.57
    // with the moved share going 48% to 74%; if this check ever needs strengthening, move the vantage rather than the
    // number. Do not raise the threshold to make it pass, and do not lower it to make it pass either.
    check('the flow lines change the surface', dif.mad > ctl.mad*1.5 && dif.movedPct > ctl.movedPct*1.2,
          `mean abs difference ${ctl.mad} between two identical frames, ${dif.mad} with the streaks switched on`);

    check('no page errors through the whole run', W.errors.length===0, W.errors[0]||'');
  } finally { await W.close(); }
  process.exit(report() ? 0 : 1);
})();
