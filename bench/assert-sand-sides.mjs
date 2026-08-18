// SAND TOPS WITH GREEN WALLS UNDER THEM (Ben, frame 014918: "blocks whose TOP face is sand have fully GREEN side
// faces, a sand top sitting straight above a solid green wall"). Counted over the WHOLE beach rather than one block:
// every grass-family column at the surface, how many draw the other family's tile on top, and how many of those sit
// at a vertical STEP -- which is where a top tile and its own side faces disagree with each other.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    const c=await ev('__hc.transCensus()');
    console.log('  substitutions at the surface  '+JSON.stringify(c.surface||c).slice(0,240));
    console.log('  substitutions in a cut        '+JSON.stringify(c.cut||{}).slice(0,160));
    // THE FAULT ITSELF: a surface cell whose drawn top is the OTHER family and whose four side neighbours are lower,
    // i.e. it stands as a wall. Those are the ones whose sides are grass while the top says sand.
    const step=await ev(`(()=>{ const G=__hc.bid('grass'), S=__hc.bid('sand'), D=__hc.bid('dirt');
      let sandTopOnGrass=0, atStep=0, level=0; const ex=[];
      const P=__hc.probe();
      for(let dz=-90; dz<=90; dz++) for(let dx=-90; dx<=90; dx++){
        const x=P.spawnX+dx, z=P.spawnZ+dz, h=__hc.surfH(x,z);
        if(__hc.blockAt(x,h,z)!==G) continue;
        // does any 4-neighbour surface sit lower than this one? then this block shows side faces
        let lower=0; for(const [ox,oz] of [[1,0],[-1,0],[0,1],[0,-1]]) if(__hc.surfH(x+ox,z+oz) < h) lower++;
        // and is a sand column adjacent at any level within 2?
        let sandNear=false;
        for(const [ox,oz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nh=__hc.surfH(x+ox,z+oz);
          if(Math.abs(nh-h)<=2 && __hc.blockAt(x+ox,nh,z+oz)===S){ sandNear=true; break; } }
        if(!sandNear) continue;
        sandTopOnGrass++;
        if(lower>0){ atStep++; if(ex.length<6) ex.push({x,z,h,lower}); } else level++; }
      return { grassCellsBesideSand:sandTopOnGrass, ofThoseStandingAsAWall:atStep, onLevelGround:level, examples:ex }; })()`);
    console.log('  '+JSON.stringify(step));
  } finally { await W.close(); } })();
