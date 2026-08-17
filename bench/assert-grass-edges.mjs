// GRASS IS DRAWN ON A FACE THAT SEES THE SKY, AND NOWHERE ELSE (Ben 08-17: "grass faces should not spawn when up
// against another block, only when exposed to the sky. I want one solid toplayer of grass, but everything below the
// surface, which would include intersecting edges, can be normal grass").
// d96a394 wrote grass_top into all three faces of the block instead, which put turf on the UNDERSIDE of the surface
// layer -- the ceiling of every cut into a hillside -- and that is the "grass covers up dirt" this asserts against.
// __hc.grassEdges() walks every grass block in the loaded world, takes each drawn face, and reports the tile it will
// carry, bucketed by orientation and by the mesher's own sky value. The rule is four statements about those buckets:
//   1. `under`    holds NO grass tile ever. A downward face cannot see the sky, so the underside of turf is soil.
//   2. `sideOpen` holds ONLY grass tiles. A sky-exposed edge -- pit rim, cliff top, terrace riser -- is turf.
//   3. `sideShut` holds NO grass tile. An edge with no sky on it is the ordinary block.
//   4. Boring a tunnel UNDER the turf adds undersides, and every one of them is still soil.
// Bores a real tunnel for 4 rather than trusting the undisturbed world to contain the case: a fresh world has only ~57
// turf undersides in eight chunks, and all of them are accidents of worldgen rather than the thing Ben went and looked at.
// node bench/assert-grass-edges.mjs
import { openWorld, sleep } from './lib/rig.mjs';
const GRASS = t => t==='grass_top' || /^grass_leaf\d$/.test(t);
const sum = o => { let n=0; for(const k in o) n+=o[k]; return n; };
const grassIn = o => Object.keys(o).filter(GRASS);
const plainIn = o => Object.keys(o).filter(k=>!GRASS(k));

(async()=>{ const W=await openWorld({rd:8});
  let pass=0, fail=0;
  const ok=(c,msg)=>{ if(c){pass++; console.log('  ok   '+msg);} else {fail++; console.log('  FAIL '+msg);} };
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const A=await W.page.evaluate('__hc.grassEdges()');
    console.log('faces '+JSON.stringify(A));
    if(A.err) throw new Error(A.err);
    ok(grassIn(A.under).length===0,    'no grass on any underside (under: '+JSON.stringify(A.under)+')');
    ok(plainIn(A.sideOpen).length===0, 'every sky-exposed edge is grass ('+sum(A.sideOpen)+' faces, tiles '+Object.keys(A.sideOpen)+')');
    // AND WHAT A SHUT EDGE WEARS IS DIRT, in Ben's words: "a face is grass ONLY if it is exposed to the sky; every
    // other face is dirt". It was grass_side -- dirt with a green lip -- which is the ordinary block's own side and is
    // not what he asked for.
    ok(grassIn(A.sideShut).length===0, 'no grass on an edge with no sky on it (sideShut: '+JSON.stringify(A.sideShut)+')');
    ok(Object.keys(A.sideShut).every(k=>k==='dirt'), 'a shut edge is dirt (sideShut: '+JSON.stringify(A.sideShut)+')');
    ok(sum(A.sideShut)>200, 'the rule actually bites: '+sum(A.sideShut)+' shut edges, against 34 when it asked the neighbourhood sky');
    ok(plainIn(A.top).length===0,      'every top face is grass ('+sum(A.top)+' faces)');

    // A GRASS SLOPE with no water in it, then a tunnel bored under its turf: the surface block stays as the roof.
    const spot = await W.page.evaluate(`(()=>{ const S=__hc.st(), px=Math.round(S.px), pz=Math.round(S.pz);
      let best=null;
      for(let dz=-100;dz<=100;dz+=2) for(let dx=-100;dx<=100;dx+=2){
        const x=px+dx, z=pz+dz, h0=__hc.surfH(x,z), h1=__hc.surfH(x+8,z);
        if(!(h0>46 && h0<86)) continue; const d=h0-h1; if(d<2||d>7) continue;
        let grass=0, tot=0; for(let a=0;a<8;a++) for(let b=-2;b<=2;b++){ const hh=__hc.surfH(x+a,z+b); tot++;
          if(__hc.mineState(x+a,hh,z+b).block===__hc.bid('grass')) grass++; }
        const score=grass/tot - Math.abs(d-4)*0.02; if(grass/tot<0.85) continue;
        if(!best||score>best.score) best={x,z,h:h0,d,score:+score.toFixed(3)}; }
      return best; })()`);
    console.log('slope '+JSON.stringify(spot));
    if(!spot){ console.log('  --   no grass slope within 100 blocks of spawn: the tunnel case did not run'); }
    else {
      await W.page.evaluate(`__hc.tpExact(${spot.x}+4.5, ${spot.z}+0.5, ${spot.h}+6)`);
      for(let i=0;i<25;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
      const B0=await W.page.evaluate('__hc.grassEdges()');
      await W.page.evaluate(`(()=>{ const S=${JSON.stringify(spot)};
        for(let a=0;a<9;a++) for(let b=-1;b<=1;b++){ const hh=__hc.surfH(S.x+a,S.z+b);
          __hc.setBlk(S.x+a,hh-1,S.z+b,0); __hc.setBlk(S.x+a,hh-2,S.z+b,0); }
        return 1; })()`);
      for(let i=0;i<20;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
      await sleep(1000);
      const B1=await W.page.evaluate('__hc.grassEdges()');
      console.log('bored  under '+sum(B0.under)+' -> '+sum(B1.under)+'  '+JSON.stringify(B1.under));
      ok(sum(B1.under)>sum(B0.under), 'the tunnel actually exposed new undersides ('+sum(B0.under)+' -> '+sum(B1.under)+')');
      ok(grassIn(B1.under).length===0, 'the ceiling of the tunnel is soil, not turf (under: '+JSON.stringify(B1.under)+')');
    }
    ok(W.errors.length===0, 'no page errors ('+(W.errors[0]||'')+')');
    console.log('\n'+pass+' ok, '+fail+' failed');
    process.exitCode = fail?1:0;
  } finally { await W.close(); } })();
