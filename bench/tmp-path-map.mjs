// WHY DOES A DIRT PATH STOP DEAD AT A TERRACE EDGE? Backlog 4.2, frame D:\Screenshot 2026-08-17 213135.png:
// a path runs up the frame and ends in a blunt square end at a step, with plain grass above it, while the two outer
// paths run on unbroken.
//
// genColumn paves the surface with `else if(onTrail) b=BID.dirt`, and onTrail is trailDirt(wx,wz) -- purely 2D. A 2D
// test cannot know about a terrace, so either the test goes false there (the trail GRAPH ends, or its leaf taper
// narrows it to nothing) or something overwrites the dirt after it is laid. Those two have opposite fixes, so this
// separates them: __hc.trailAt is the generator's own paving test and blockAt is what actually ended up on the surface.
// Printed together, a cell where trailAt is true and the surface is grass is an overwrite; a cell where trailAt goes
// false is the graph.
//
//   node bench/tmp-path-map.mjs [radius]
import { openWorld, sleep } from './lib/rig.mjs';
const R = Math.max(8, Math.min(64, parseInt(process.argv[2] || '40', 10)));
// --at <nodeKey> centres on a named trail node instead of the steepest edge. The trailheads are leaf nodes and their
// width tapers to 0.3 over the last 6 blocks, so 'where does a path end and does the end line up with a step' can only
// be answered at one of them.
const AT = (() => { const i = process.argv.indexOf('--at'); return i < 0 ? null : process.argv[i + 1]; })();

(async () => {
  const W = await openWorld({ w: 900, h: 520, rd: 8 });
  const p = W.page;
  try {
    await p.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative');`);
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) { const f = await p.evaluate(`__hc.fill()`); if (f && f.want > 0 && f.meshed / f.want >= 0.92) break; await sleep(1500); }
    const P = await p.evaluate(`__hc.probe()`);
    // __hc.bid(name) already existed (twice, in fact); a third copy I added was silently overridden, which is the
    // duplicate-key trap f3518b1 records. Names are fetched once and inverted here so the map can print 'dirt'.
    const NAMES = await p.evaluate(`__hc.bid()`);
    const BID = NAMES;
    const TN = await p.evaluate(`__hc.trailNodes()`);
    console.log(`  spawn ${P.spawnX},${P.spawnZ}  sea ${P.sea}  dirt=${await p.evaluate("__hc.bid('dirt')")} grass=${await p.evaluate("__hc.bid('grass')")}`);
    console.log('  trail nodes: ' + TN.nodes.map(n => `${n.k}(${n.x},${n.z})d${n.deg}`).join(' '));
    console.log('  edges: ' + TN.edges.map(e => e.join('-')).join(' '));

    // CENTRE ON A REAL TRAIL EDGE, not on spawn: the first run centred on spawn and found no trail cell within 26
    // blocks, so it mapped plain forest and could not have shown the fault either way.
    // Pick the edge whose two ends differ most in ground height -- 4.2 is a path meeting a terrace, so the step has to
    // be inside the window or the map cannot contain the thing being looked for.
    let best = null;
    const byK = Object.fromEntries(TN.nodes.map(n => [n.k, n]));
    for (const [a, b] of TN.edges) {
      const na = byK[a], nb = byK[b];
      const ha = await p.evaluate(`__hc.groundY(${na.x},${na.z})`);
      const hb = await p.evaluate(`__hc.groundY(${nb.x},${nb.z})`);
      const d = Math.abs(ha - hb);
      if (!best || d > best.d) best = { a: na, b: nb, ha, hb, d };
    }
    let cx = Math.round((best.a.x + best.b.x) / 2), cz = Math.round((best.a.z + best.b.z) / 2);
    if (AT && byK[AT]) { cx = byK[AT].x; cz = byK[AT].z; console.log(`  --at ${AT}: centring on the node itself`); }
    console.log(`  steepest edge (${best.a.x},${best.a.z}) h${best.ha} -> (${best.b.x},${best.b.z}) h${best.hb}  drop ${best.d}`);
    console.log(`  centring the map on ${cx},${cz}`);

    const G = await p.evaluate(`(()=>{ const ox=${cx}, oz=${cz}, R=${R}, out=[];
      for(let dz=-R; dz<=R; dz++){ const row=[];
        for(let dx=-R; dx<=R; dx++){ const x=ox+dx, z=oz+dz;
          const h=__hc.groundY(x,z); const t=__hc.trailAt(x,z); const b=__hc.blockAt(x,h,z);
          row.push([h,t?1:0,b]); }
        out.push(row); }
      const names={}; for(const r of out) for(const c of r) names[c[2]]=1;
      return { out, ids:Object.keys(names) }; })()`);
    const D = await p.evaluate(`__hc.bid('dirt')`), Gr = await p.evaluate(`__hc.bid('grass')`);
    console.log('  block ids present: ' + G.ids.join(','));


    // T = trailAt true.  Surface: d = dirt, g = grass, other = its id.
    console.log('\n  trailAt map (T) over surface block (d/g/other).  MISMATCH = trailAt true but surface not dirt.');
    let mismatch = 0, trailCells = 0; const MM = [];
    for (let iz = 0; iz < G.out.length; iz++) {
      let a = '', b = '';
      for (let ix = 0; ix < G.out[iz].length; ix++) {
        const [h, t, blk] = G.out[iz][ix];
        a += t ? 'T' : '.';
        const isD = (D != null && blk === D), isG = (Gr != null && blk === Gr);
        b += isD ? 'd' : isG ? 'g' : (blk === 0 ? ' ' : 'o');
        if (t) { trailCells++; if (!isD) { mismatch++; MM.push({ x: cx - R + ix, z: cz - R + iz, h, blk }); } }
      }
      console.log('   ' + a + '   ' + b);
    }
    console.log(`\n  trail cells ${trailCells}   mismatched (trail but not dirt) ${mismatch}`);
    if (MM.length) {
      console.log('  the cells the generator paved and something else took back:');
      // AND WHAT IS ACTUALLY UNDER IT. `air at surfaceH` says the top was removed but not by what: walk down to the
      // first solid block and name it, plus the column above, so a cave void reads differently from a structure floor.
      const N = await p.evaluate(`(()=>{ const q=${JSON.stringify(MM)}; return q.map(m=>{
        let d=0, b=0; for(let y=m.h; y>m.h-24; y--){ b=__hc.blockAt(m.x,y,m.z); if(b!==0){ d=m.h-y; break; } }
        const up=[]; for(let y=m.h+1; y<=m.h+4; y++) up.push(__hc.blockAt(m.x,y,m.z));
        return { x:m.x, z:m.z, blk:m.blk, h:__hc.groundY(m.x,m.z), drop:d, solid:b, up,
                 n:[[1,0],[-1,0],[0,1],[0,-1]].map(dd=>__hc.groundY(m.x+dd[0],m.z+dd[1])) }; }); })()`);
      // Neighbour heights matter: 4.2 is about a path meeting a step, so a mismatch sitting ON a riser is a different
      // fault from one sitting on flat ground, and the number says which without another run.
      for (const q of N) console.log(`    (${q.x},${q.z}) h${q.h} surf ${NAMES[q.blk]}  first solid ${q.drop} below = ${NAMES[q.solid]}  above ${q.up.map(b=>NAMES[b]).join('/')}  step ${Math.max(...q.n.map(v => Math.abs(v - q.h)))}`);
    }
    // And the height profile down the middle, so a step is visible as a number.
    const mid = G.out[(G.out.length >> 1)];
    console.log('  height across the middle row: ' + mid.map(c => c[0]).join(' '));
    console.log('  errors: ' + (W.errors.length ? W.errors.slice(0, 2).join(' | ') : 'none'));
  } finally { await W.close(); }
})();
