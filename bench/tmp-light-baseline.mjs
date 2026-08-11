// THE BEFORE PICTURE for the 08-06 lighting pass. Nothing here asserts anything: it is the row of numbers every
// later claim in this pass is measured against, taken in ONE boot so the conditions share a GPU state.
//
// Four questions, in the order the pass answers them:
//   1. Is an UNLIT CARVED ROOM actually dark at noon, and at midnight?  (item 2)
//   2. Does a face the sun cannot reach on the SURFACE go dark, or does the ambient fill it back in? (item 2)
//   3. What does the wash do to chroma in each of those, and does a held light bring the colour back? (item 3)
//   4. What is on the water, day and night, and does anything of the sun or a lamp appear in it? (item 1)
//
//   node bench/tmp-light-baseline.mjs
import { openWorld, pin, measure, CROP, fmt, sleep } from './lib/rig.mjs';

const NOON=0.25, NIGHT=0.75, DUSK=0.47;

(async()=>{
  const W = await openWorld({ rd:8 });
  const P = W.page;
  try{
    const S = await P.evaluate(`__hc.st()`);
    console.log(`  spawn ${S.sx},${S.sz}`);

    // ---- 1/2/3: A CARVED ROOM. Carved, not built: /setblock air through rock leaves every wall's own column still
    // full of stone, so vSky is a true 0 — building a box out of blocks in the open leaves the walls sky-open.
    const CX = Math.round(S.sx)+18, CZ = Math.round(S.sz)+18, CY = 44;
    await P.evaluate(`(function(){ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
    for(let i=0;i<40;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await P.evaluate(`__hc.tp(${CX-3}, ${CY+1.6}, ${CZ}, 0, 0)`);
    await sleep(600);

    for(const [tag,t] of [['cave-noon',NOON],['cave-night',NIGHT]]){
      await pin(W,t);
      const m = await measure(W, 'bl-'+tag, t, {frame:CROP.frame, centre:CROP.centre});
      console.log(`  ${tag.padEnd(12)} frame  ${fmt(m.frame)}`);
      console.log(`  ${''.padEnd(12)} centre ${fmt(m.centre)}`);
    }

    // held torch in the same room, at night — does the light bring colour back, and how far
    await P.evaluate(`__hc.cmdRun('/give torch 1')`);
    await sleep(400);
    await pin(W,NIGHT);
    { const m = await measure(W, 'bl-cave-torch', NIGHT, {frame:CROP.frame, centre:CROP.centre});
      console.log(`  cave-torch   frame  ${fmt(m.frame)}`);
      console.log(`               centre ${fmt(m.centre)}`); }

    // ---- 2: THE SURFACE. Stand on open ground looking at a wall the sun is behind.
    await P.evaluate(`__hc.tp(${Math.round(S.sx)}, ${Math.round(S.sz)})`);
    await sleep(900);
    for(const [tag,t] of [['surf-noon',NOON],['surf-dusk',DUSK],['surf-night',NIGHT]]){
      await pin(W,t);
      const m = await measure(W, 'bl-'+tag, t, {frame:CROP.frame, ground:CROP.ground, upper:CROP.upper});
      console.log(`  ${tag.padEnd(12)} ground ${fmt(m.ground)}`);
      console.log(`  ${''.padEnd(12)} upper  ${fmt(m.upper)}`);
    }

    // ---- 4: WATER. Walk out to the coast the same way tmp-water-look does, then aim at the sun's reflection.
    const C = await P.evaluate(`(function(){ var Wb=__hc.bid('water');
      for(var a=0;a<24;a++){ var th=a*Math.PI/12;
        for(var d=12; d<=240; d+=2){ var x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d), run=0;
          for(var k=0;k<7;k++){ var xx=Math.round(x+Math.cos(th)*k*2), zz=Math.round(z+Math.sin(th)*k*2), wet=false;
            for(var y=36;y<=42;y++) if(__hc.blockAt(xx,y,zz)===Wb){ wet=true; break; }
            if(wet) run++; else break; }
          if(run>=6) return {x:x,z:z,th:th,d:d}; } }
      return null; })()`);
    console.log('  coast ' + JSON.stringify(C));
    if(C){
      await P.evaluate(`__hc.tp(${C.x}, ${C.z})`); await sleep(900);
      // A reflection of something ELEVATION degrees up lies ELEVATION degrees DOWN (plan §7). Aim there, not level.
      for(const [tag,t] of [['sea-low',0.06],['sea-noon',NOON],['sea-night',NIGHT]]){
        await pin(W,t);
        const sd = await P.evaluate(`__hc.sunDir()`);
        const az = Math.atan2(sd.z ?? sd.dir?.z ?? 0, sd.x ?? sd.dir?.x ?? 1);
        await P.evaluate(`__hc.cam({yaw:${-az+Math.PI/2}, pitch:${-((sd.elevDeg||10)*Math.PI/180)}})`);
        await sleep(300);
        const m = await measure(W, 'bl-'+tag, t, {frame:CROP.frame, centre:CROP.centre, ground:CROP.ground});
        console.log(`  ${tag.padEnd(12)} elev ${sd.elevDeg}  centre ${fmt(m.centre)}`);
        console.log(`  ${''.padEnd(12)} ground ${fmt(m.ground)}`);
      }
    }
  } finally { await W.close(); }
})();
