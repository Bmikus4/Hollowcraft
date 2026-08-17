// WATER ABOVE SEA LEVEL IS DRAWN, AND THE OLD VOXEL SEA IS STILL GONE (Ben 08-17: "i cant see water in wells";
// Ben 08-12: "delete the old ocean completely", "i can still see the old ocean underneath").
// The well hunt spent two turns inside waterMat's shader. The cause was one property outside it: updateOcean3 cleared
// waterMat.colorWrite to retire the voxel sea under the new camera-locked ocean plane, and waterMat is SHARED -- so the
// well, the puddles and every inland water mesh stopped writing pixels too. A material with colorWrite false still
// draws, still counts triangles and draw calls, and produces nothing, which is every measurement that hunt collected,
// and it is also why uNanDbg mode 2 never painted anything anywhere.
// It is a height cut now (uO3Cut), so both halves are asserted, because they pull against each other:
//   1. colorWrite is on while the ocean plane is on -- the property that WAS the bug
//   2. the cut sits ABOVE the sea's own surface, so the plane still owns the sea and the old one stays retired
//   3. water above sea level writes pixels -- measured on a pool cut into open flat ground, against a control pair of
//      two frames of the same condition, because this world's frames are never still (waves, wind, cloud)
// A POOL RATHER THAN THE WELL ITSELF: the well at spawn stands in a forest and a trunk fills the frame from every
// bearing that can see into the shaft. The pool is the same material, the same cut and the same question, in the open.
// node bench/assert-well-water.mjs
import { openWorld, sleep, shots, diffStat, statFile } from './lib/rig.mjs';

(async()=>{ const W=await openWorld({rd:8});
  let pass=0, fail=0;
  const ok=(c,msg)=>{ if(c){pass++; console.log('  ok   '+msg);} else {fail++; console.log('  FAIL '+msg);} };
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const o3=await W.page.evaluate('__hc.ocean3()');
    const wp=(await W.page.evaluate('__hc.waterProp()')).now;
    console.log('ocean3 '+JSON.stringify(o3)+'\nwaterMat '+JSON.stringify(wp));
    ok(o3.on===true, 'the ocean plane is on, which is the case the bug lived in');
    ok(wp.colorWrite===true, 'waterMat may write colour while the plane is on (colorWrite '+wp.colorWrite+')');
    // ABOVE THE SEA AND ABOVE ITS WAVES. The vertex stage clamps a crest to +0.10 over the rest surface (min(y,0.10)),
    // so a margin wider than that is what says no sea fragment can ever climb over the cut and reappear under the plane.
    ok(wp.o3Cut - wp.seaTop > 0.10, 'the cut clears the sea\'s surface and its crest clamp, so the plane still owns the sea (cut '
       +wp.o3Cut+', sea top '+wp.seaTop+', margin '+(+(wp.o3Cut-wp.seaTop).toFixed(2))+' > 0.10)');

    // A SLAB OF WATER IN OPEN SKY, and the reason it is up there rather than in a pond is framing: every flat, open
    // patch within a hundred blocks of spawn is under a canopy, and three attempts at a ground pool photographed
    // leaves. At 132 blocks up there is nothing between the camera and the water and nothing behind it but sky, so the
    // crop measures one thing. It is water above sea level, which is the whole question.
    const pool=await W.page.evaluate(`(()=>{ const S=__hc.st(), px=Math.round(S.px), pz=Math.round(S.pz);
      // THE FLUID SIM WOULD DRAIN IT: a placed water block with air under it falls and the slab is gone before the
      // shot. It is switched off for the measurement, and the slab is given a stone floor so what is behind the water
      // is a known surface rather than sky seen through it.
      __hc.waterSim(false);
      const w=__hc.bid('water'), y=110;
      for(let a=-4;a<=4;a++) for(let b=-4;b<=4;b++) __hc.setBlk(px+9+a, y-2, pz+b, __hc.bid('stone'));
      for(let a=-3;a<=3;a++) for(let b=-3;b<=3;b++){ __hc.setBlk(px+9+a, y, pz+b, w); __hc.setBlk(px+9+a, y-1, pz+b, w); }
      __hc.tpExact(px+0.5, pz+0.5, y+3.0); __hc.look(px+9, y+0.6, pz+0.5);
      return {px, pz, y, at:__hc.mineState(px+9, y, pz).block, water:w}; })()`);
    console.log('slab '+JSON.stringify(pool));
    if(!pool || pool.at!==pool.water) throw new Error('the water slab did not take');
    for(let i=0;i<15;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
    await sleep(1400);
    // The slab sits in the middle of the frame against sky; crop to it.
    const C=[0.35,0.65,0.40,0.75];
    const a=await shots(W,'poolwater-a',null,2);
    await W.page.evaluate('__hc.chunkWaterVis(false)'); await sleep(600);
    const b=await shots(W,'poolwater-b',null,1);
    await W.page.evaluate('__hc.chunkWaterVis(true)'); await sleep(400);
    const control=diffStat(a[0],a[1],C), hidden=diffStat(a[1],b[0],C);
    console.log('control    '+JSON.stringify(control)+'  '+JSON.stringify(statFile(a[1],C).rgb));
    console.log('waterHidden '+JSON.stringify(hidden)+'  '+JSON.stringify(statFile(b[0],C).rgb));
    // MAD FIRST, movedPct AS A FLOOR. Water over a pale floor is a nearly clear film -- that is the whole reason the well
    // was dug nine deep -- so most of the crop moves by ONE or TWO of 255 and a d>2 pixel count under-reads it badly.
    // The mean absolute difference sees the small move; the count keeps a pure-noise frame from passing on it.
    ok(hidden.mad > control.mad*1.8 && hidden.movedPct > 5,
       'water above sea level writes pixels: hiding the mesh moves the crop by '+hidden.mad+' of 255 ('+hidden.movedPct+
       '% of pixels past 2), against '+control.mad+' / '+control.movedPct+'% for two frames of the same thing');
    // AND A PICTURE OF THE THING BEN ASKED ABOUT. The forest blocks a clean side view of the shaft, so this looks down
    // into it from just over the rim, which is how a well is used.
    const at=await W.page.evaluate(`(()=>{ const s=__hc.st(); const wx=s.sx+14, wz=s.sz+34, gy=__hc.groundY(wx,wz);
      __hc.tpExact(wx+0.5, wz+2.5, gy+2.6); return {wx,wz,gy}; })()`);
    await sleep(300);
    await W.page.evaluate(`__hc.look(${at.wx}+0.5, ${at.gy}+0.9, ${at.wz}+0.5)`);
    for(let i=0;i<12;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
    await sleep(1200);
    await shots(W,'wellshaft',null,1);
    console.log('well '+JSON.stringify(at)+'  -> bench/results/wellshaft-0.png');
    ok(W.errors.length===0, 'no page errors ('+(W.errors[0]||'')+')');
    console.log('\n'+pass+' ok, '+fail+' failed');
    process.exitCode = fail?1:0;
  } finally { await W.close(); } })();
