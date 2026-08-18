// THE OTHER HALF OF THE GRASS RULE. Cover grass and it becomes dirt; this asserts that uncovering dirt makes
// it grass again, and that the dirt paths -- which are dirt on purpose -- survive the same rule.
//   1. break a grass block and the dirt that surfaces under it is grass
//   2. a trail column that is broken open is STILL dirt (the paths must not turf over)
//   3. bareTops, the world's count of sky-open dirt where the generator says grass grows, is near zero
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8}); let pass=0, fail=0;
  const ok=(c,m)=>{ if(c){pass++;console.log('  ok    '+m);} else {fail++;console.log('  FAIL  '+m);} };
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    const bg=await ev('__hc.buriedGrass()');
    console.log('  demoted '+bg.demoted+'  grown '+bg.grown+'  bareTops '+bg.bareTops+'  '+JSON.stringify(bg.bareWhere.slice(0,4)));
    ok(bg.bareTops<=8, 'bareTops '+bg.bareTops+' <= 8 (sky-open dirt where grass grows)');

    // 1. BREAK A GRASS BLOCK. Find a column whose surface is grass, break it, and read what surfaced.
    const brk=await ev(`(()=>{ const P=__hc.probe(), G=__hc.bid('grass'), D=__hc.bid('dirt');
      for(let r=2;r<40;r++) for(let k=0;k<8;k++){ const a=k*Math.PI/4;
        const x=Math.round(P.x+Math.cos(a)*r), z=Math.round(P.z+Math.sin(a)*r), h=__hc.surfH(x,z);
        if(__hc.blockAt(x,h,z)!==G) continue;
        if(__hc.blockAt(x,h-1,z)!==D) continue;
        __hc.setBlk(x,h,z,'air');
        return { x, z, h, under:__hc.blockAt(x,h-1,z), grass:G, dirt:D }; }
      return null; })()`);
    console.log('  break '+JSON.stringify(brk));
    ok(brk && brk.under===brk.grass, 'the block that surfaced under a broken grass block is grass');

    // 2. THE SAME ON A TRAIL. A path is dirt because it was made dirt; the promotion must not reach it.
    const trail=await ev(`(()=>{ const P=__hc.probe(), G=__hc.bid('grass'), D=__hc.bid('dirt');
      for(let r=2;r<90;r++) for(let k=0;k<16;k++){ const a=k*Math.PI/8;
        const x=Math.round(P.x+Math.cos(a)*r), z=Math.round(P.z+Math.sin(a)*r), h=__hc.surfH(x,z);
        if(!__hc.trailAt(x,z)) continue;                       // trailAt is a BOOLEAN, not a distance
        if(__hc.blockAt(x,h,z)!==D) continue;
        __hc.setBlk(x,h,z,'air');
        return { x, z, h, under:__hc.blockAt(x,h-1,z), grass:G, dirt:D }; }
      return null; })()`);
    console.log('  trail '+JSON.stringify(trail));
    ok(!trail || trail.under===trail.dirt, 'a broken trail column stays dirt (the paths do not turf over)');
    console.log('\n  '+pass+' pass, '+fail+' fail');
  } finally { await W.close(); process.exit(fail?1:0); } })();
