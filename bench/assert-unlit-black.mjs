// A PLACE NO LIGHT REACHES IS BLACK, AND IT IS BLACK AT NOON (Ben 08-06).
//
// The claim has a shape that no luminance threshold on its own can express, so the harness is built around it: a
// SEALED ROOM CANNOT KNOW WHAT HOUR IT IS. Whatever number an unlit carved room reads at midnight, it must read at
// noon, because nothing physical connects the two. Before this pass it read 26.9 at noon against 25.7 at midnight and
// both of those were a flat grey — the room was neither dark nor hour-independent.
//
// WHAT WAS ACTUALLY WRONG, because three earlier attempts moved the wrong dial and this is the note that stops a
// fourth: `FOL_UNLIT_FLOOR` — a thin-leaf translucency floor, documented as being for foliage — was applied to all
// five voxel-atlas materials, so every stone, dirt and plank face in the game carried `max(colour, albedo*0.20)`
// AFTER lighting, tone mapping and fog. No lighting dial can reach a max() applied after the fact, which is why the
// sky curve's floor and uDayShade both swept completely inert at this site (0.26 -> 0.00 moved the wall by 1.3 of
// 255) and why every previous fix had to be a wash rather than an absence of light.
//
// FOUR OF THE SEVEN CHECKS EXIST TO CATCH THE FIX GOING TOO FAR, and each of them is a thing Ben has rejected before:
//   · a forest floor going black by day  (the "dark random blocks in the woods" report)
//   · pure black pixels appearing in a sunlit field  ("careful not to reintroduce our black pixel bug")
//   · the cabin interior becoming unusable
//   · foliage losing the floor this change gates — the feature is kept, only its reach is narrowed
//
//   node bench/assert-unlit-black.mjs
import { openWorld, pin, measure, statMedian, shots, CROP, fmt, check, report, sleep } from './lib/rig.mjs';

const NOON=0.25, NIGHT=0.75;

// The room is carved, not built: /setblock air through solid rock leaves every wall's own column full of stone, so
// vSky is a true 0. A box BUILT in the open has sky-open walls and measures nothing (it cost this pass one run).
async function carveRoom(P, CX, CZ){
  const GY = await P.evaluate(`__hc.groundY(${CX}, ${CZ})`);
  const CY = Math.max(6, GY - 16);
  await P.evaluate(`(function(){ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
  for(let i=0;i<40;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
  const roof = await P.evaluate(`(function(){ var n=0,a=__hc.bid('air'); for(var y=${CY}+5; y<=${GY}; y++) if(__hc.blockAt(${CX},y,${CZ})!==a) n++; return n; })()`);
  return { CY, GY, roof };
}

(async()=>{
  const W = await openWorld({ rd:8 });
  const P = W.page;
  try{
    const S = await P.evaluate(`__hc.st()`);
    const CX = Math.round(S.sx)+18, CZ = Math.round(S.sz)+18;
    const R = await carveRoom(P, CX, CZ);
    // A guard that has never been observed rejecting anything is not evidence (bench/README.md): if the column above
    // the room is not solid there is no sealed face here and every number below is about something else.
    check('the room is genuinely roofed', R.roof >= 8, `solid blocks above: ${R.roof} over ${R.GY-R.CY-4}`);

    await P.evaluate(`__hc.tp(${CX-3}, ${R.CY+1.6}, ${CZ}, 0, 0)`);
    await sleep(800);

    await pin(W, NOON);
    const caveDay = (await measure(W,'ub-cave-noon',NOON,{c:CROP.centre})).c;
    await pin(W, NIGHT);
    const caveNight = (await measure(W,'ub-cave-night',NIGHT,{c:CROP.centre})).c;
    console.log(`  cave noon  ${fmt(caveDay)}`);
    console.log(`  cave night ${fmt(caveNight)}`);

    check('an unlit sealed room is dark at NOON', caveDay.lum < 8, `lum ${caveDay.lum} (was 26.9)`);
    check('...and it is genuinely black, not washed grey', caveDay.nearBlackPct > 90, `${caveDay.nearBlackPct}% under 8 of 255 (was 11.3%)`);
    // THE CLAIM ITSELF. A sealed room has no term in it that varies with the sun, so the two hours must agree; before
    // this pass they differed by a factor of 3.4 through the ambient's own day scaling reaching a face with no sky.
    check('a sealed room reads the same at noon as at midnight', Math.abs(caveDay.lum - caveNight.lum) < 2.0,
          `noon ${caveDay.lum} vs night ${caveNight.lum}`);

    // ---- A LIGHT IN IT STILL LIGHTS IT. Darkness that cannot be lifted is not darkness, it is a black material.
    await P.evaluate(`__hc.cmdRun('/setblock ${CX+2} ${R.CY} ${CZ} lantern')`);
    for(let i=0;i<20;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    // CLOCK PINNED, because a placed lantern flickers and this crop is the far wall rather than the lamp's own puddle:
    // the ratio measured 5.1 and then 3.6 on consecutive runs of one build, which is a check that fails at random.
    await P.evaluate(`__hc.freezeT(120)`); await sleep(400);
    await pin(W, NOON);
    const caveLit = (await measure(W,'ub-cave-lantern',NOON,{c:CROP.centre})).c;
    await P.evaluate(`__hc.freezeT(null)`);
    console.log(`  cave lantern ${fmt(caveLit)}`);
    check('a lantern still lights the same room', caveLit.lum > caveDay.lum*2.5, `${caveLit.lum} against ${caveDay.lum} unlit`);
    check('...and the lit surface keeps its colour', caveLit.sat > 0.25, `sat ${caveLit.sat}`);

    // ---- THE REJECTED EXPERIMENTS ----
    // A shaded forest floor at noon. vSky is ~1 here, so the sky curve must be inert on it; what darkens it is
    // uDayShade, deliberately and by 59%. What it must not be is black.
    const shade = await P.evaluate(`(function(){ var L=__hc.bid('leaves'), LC=__hc.bid('leaves_core');
      for(var d=8; d<90; d+=3) for(var a=0;a<16;a++){ var th=a*Math.PI/8;
        var x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d);
        var g=__hc.groundY(x,z); if(g==null||g.err) continue;
        for(var y=g+2;y<g+14;y++){ var b=__hc.blockAt(x,y,z); if(b===L||b===LC) return {x:x,z:z,g:g}; } }
      return null; })()`);
    if(shade){
      await P.evaluate(`__hc.tp(${shade.x}, ${shade.z})`); await sleep(900);
      await P.evaluate(`__hc.cam({yaw:0, pitch:-0.75})`);
      await pin(W, NOON);
      const sh = (await measure(W,'ub-shade',NOON,{c:CROP.centre})).c;
      console.log(`  forest shade noon ${fmt(sh)}`);
      check('a shaded forest floor is darker but not black', sh.lum > 5 && sh.blackPct < 0.5,
            `lum ${sh.lum} black ${sh.blackPct}%`);
    } else console.log('  (no canopy site found — shade check skipped)');

    // Open sunlit ground at noon: the black-pixel guard. Ben has asked against this specific artefact by name.
    await P.evaluate(`__hc.tp(${Math.round(S.sx)}, ${Math.round(S.sz)})`); await sleep(900);
    await P.evaluate(`__hc.cam({yaw:0, pitch:-0.5})`);
    await pin(W, NOON);
    const open = (await measure(W,'ub-open',NOON,{g:CROP.ground})).g;
    console.log(`  open ground noon ${fmt(open)}`);
    check('a sunlit field keeps its light', open.lum > 55, `lum ${open.lum} (was 69.1)`);
    check('...with no pure-black pixels in it', open.blackPct < 0.2, `${open.blackPct}% pure black`);

    // The cabin: a real interior with real openings. This is the case that would have forced a skylight flood if the
    // zero floor had blacked it out; measured, it does not, because the mesher's 3x3 neighbourhood rule already lets
    // sky in through a doorway.
    const cab = await P.evaluate(`(function(){ try{ return __hc.cabinInfo(); }catch(e){ return null; } })()`);
    if(cab && cab.cx!=null){
      await P.evaluate(`__hc.tp(${cab.cx}, ${cab.gy+1.7}, ${cab.cz}, 0.7, -0.1)`); await sleep(900);
      await pin(W, NOON);
      const cb = (await measure(W,'ub-cabin',NOON,{c:CROP.centre})).c;
      console.log(`  cabin interior noon ${fmt(cb)}`);
      check('the cabin interior is still legible by day', cb.lum > 40, `lum ${cb.lum} (was 109.6)`);
    } else console.log('  (no cabin — interior check skipped)');
  } finally { await W.close(); }

  // ---- FOLIAGE KEPT THE FLOOR IT IS NAMED AFTER ----
  // The change narrows the floor's reach; it does not delete it. Proving that needs the kill switch, because a floor
  // that is present and a floor that is absent look identical on a LIT leaf — the only place they differ is an unlit
  // one, and the only honest way to see the difference is to run the same frame with ?folfloor=0.
  const foliage = [];
  for(const q of ['', 'folfloor=0']){
    const V = await openWorld({ rd:8, query:q, quiet:true });
    try{
      const S = await V.page.evaluate(`__hc.st()`);
      // Night, in a wood, with no lamp: the one condition where the floor is the only thing holding a leaf off black.
      const sp = await V.page.evaluate(`(function(){ var L=__hc.bid('leaves'), LC=__hc.bid('leaves_core');
        for(var d=8; d<90; d+=3) for(var a=0;a<16;a++){ var th=a*Math.PI/8;
          var x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d);
          var g=__hc.groundY(x,z); if(g==null||g.err) continue;
          for(var y=g+2;y<g+14;y++){ var b=__hc.blockAt(x,y,z); if(b===L||b===LC) return {x:x,z:z,g:g,y:y}; } }
        return null; })()`);
      if(!sp){ foliage.push(null); continue; }
      await V.page.evaluate(`__hc.tp(${sp.x}, ${sp.z})`); await sleep(900);
      await V.page.evaluate(`__hc.cam({yaw:0, pitch:0.6})`);
      await pin(V, NIGHT);
      foliage.push((await measure(V, `ub-fol-${q||'on'}`, NIGHT, {c:CROP.centre})).c);
    } finally { await V.close(); }
  }
  if(foliage[0] && foliage[1]){
    console.log(`  canopy night, floor on  ${fmt(foliage[0])}`);
    console.log(`  canopy night, floor off ${fmt(foliage[1])}`);
    // ON THE BLACK SHARE, NOT ON LUMA, and the first version of this check got it wrong. What the floor does is stop a
    // leaf reaching zero; it does not brighten the canopy. Over a night crop that is a 3x difference in the share of
    // PURE BLACK pixels (17.2% against 55.1%) and only 0.40 of 255 in the mean, so a mean-based threshold is reading
    // the wrong end of the effect and would have to be set so fine it could not survive a frame's noise.
    // ---- INVERTED 2026-08-11 ON BEN'S INSTRUCTION: "foliage doesnt listen to darkness properly" ----
    // FOL_UNLIT_FLOOR is off. It was `max(colour, albedo*0.20)` with no reference to light, so an unlit leaf could not
    // render below a fifth of its own colour at any hour - which is the report. The job it was doing is now done by the
    // lit-face texel floor (_scotK[2]), which is proportional to the light and therefore CAN tell shade from darkness.
    // So the assertion flips: foliage in the dark must now reach black like everything else, and what would be the
    // regression is the old floor coming back. `?folfloor=0.2` is still the A/B.
    check('foliage goes dark like everything else', Math.abs(foliage[1].blackPct - foliage[0].blackPct) < 6,
          `pure black ${foliage[0].blackPct}% shipped against ${foliage[1].blackPct}% with the old floor forced off`);
  } else console.log('  (no canopy site — foliage check skipped)');

  process.exit(report() ? 0 : 1);
})();
