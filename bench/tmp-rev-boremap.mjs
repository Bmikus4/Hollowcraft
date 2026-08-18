// THE REVOLVER'S CHAMBER HOLES, MAPPED BY RAYCAST, and the bolt circle read off that map.
//
// Why not off the vertices: three fits of guns/revolver.glb disagreed (per-chamber centroids 0.069, 6-fold symmetry
// axis 0.090, outer-wall circle fit 0.124) because the drum cannot be separated from the frame and the grip by an x
// range. Why not off a photograph: a closed revolver's recoil shield covers the rear of the drum, so brass is invisible
// from the only angle a first-person camera reaches, seated correctly or not. A grid of rays down the bore axis has
// neither problem -- a cell that misses the drum's front face IS a hole.
//
//   node bench/tmp-rev-boremap.mjs [gun]
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import fs from 'node:fs'; import path from 'node:path';

const GUN = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'revolver';

(async () => {
  const W = await openWorld({ w: 900, h: 520, rd: 6 });
  const p = W.page;
  try {
    await p.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.cmdRun('/gamemode creative');`);
    const t0 = Date.now(); let f = null;
    while (Date.now() - t0 < 240000) { f = await p.evaluate(`__hc.fill()`); if (f && f.want > 0 && f.meshed / f.want >= 0.90) break; await sleep(1500); }
    console.log(`  fill ${f && f.meshed}/${f && f.want}`);

    await p.evaluate(`__hc.hold(${JSON.stringify(GUN)})`);
    await p.evaluate(`(()=>{ const q=__hc.attProbe(); if(q&&q.slots) for(const s of q.slots) __hc.attFit(s,null); })()`).catch(()=>{});
    await sleep(400);
    const cyl = await p.evaluate(`__hc.revCyl(null,${JSON.stringify(GUN)})`);
    console.log(`  cyl ${JSON.stringify(cyl)}`);

    const M = await p.evaluate(`__hc.revBoreMap({n:51,half:0.055,z0:-0.35})`);
    if (M.err) { console.log('  err ' + M.err); return; }
    console.log(`  grid ${M.n}x${M.n} half=${M.half} hidBrass=${M.hidBrass}  cells=${M.cells.length}`);

    // ---- THE DRUM'S OWN Z WINDOW IS THE WHOLE TRICK ----
    // Counting every crossing along the ray cannot separate a bore from steel, because the barrel and the ejector
    // shroud stand in front of the drum and every ray meets them first. Counted only BETWEEN the drum's two end faces,
    // the answer is clean: a chamber is a through-hole, so a ray down it crosses nothing inside that window, while a
    // ray into solid drum steel crosses its front face and its rear face. The window comes from where the cartridges
    // are actually placed, which is the one thing about this drum that is not in dispute.
    // THE WINDOW COMES FROM THE GUN, not from a constant typed for one of them. buildGlbGun publishes the two end faces
    // it actually placed the drum between (userData.cylZ), so this measures whichever revolver is in hand -- the first
    // version hardcoded the Python's faces and would have silently mis-windowed the snub and the rail.
    const B = cyl.built;
    if (!B) { console.log('  no built cyl data -- is this a revolver?'); return; }
    const zF = Math.min(B.zF, B.zR) - 0.008, zR = Math.max(B.zF, B.zR) + 0.008;
    console.log(`  built ${JSON.stringify(B)}`);
    const inWin = c => c.z.filter(z => z >= zF && z <= zR).length;
    console.log(`
  crossings INSIDE the drum window z ${zF.toFixed(3)}..${zR.toFixed(3)}  (. = 0 = a through-bore)`);
    for (let iy = M.n - 1; iy >= 0; iy--) {
      let row = '';
      for (let ix = 0; ix < M.n; ix++) { const k = inWin(M.cells[iy * M.n + ix]); row += k === 0 ? '.' : (k < 10 ? String(k) : '*'); }
      console.log('   ' + row);
    }

    // ---- THE DRUM AS NUMBERS, which is what the fix has to be built against ----
    // A cell with two or more crossings inside the window is looking at solid drum. Those cells ARE the drum's disc, so
    // their extent gives its axis and radius, and the crossings themselves give the two end faces. Taken from the rays
    // rather than from spec.cyl because spec.cyl is the thing under suspicion.
    const solidCells = [];
    for (let iy = 0; iy < M.n; iy++) for (let ix = 0; ix < M.n; ix++) {
      const c = M.cells[iy * M.n + ix];
      const zs = c.z.filter(z => z >= zF && z <= zR);
      if (zs.length >= 2) solidCells.push({ x: c.x, y: c.y, zmin: Math.min(...zs), zmax: Math.max(...zs) });
    }
    if (solidCells.length) {
      // THE DRUM IS THE LARGEST CONNECTED BLOB OF SOLID CELLS, and its bounding box is its disc. Two earlier attempts
      // failed here: a min/max box over every solid cell gave radius 0.0449 at 42% disc fill, because the frame and the
      // grip also cross the window twice; and trimming to 1.15x the median distance from a running centroid collapsed to
      // 16 cells and a radius of 0.005. Connectivity separates the drum from the frame without any threshold at all --
      // they are not touching in this projection -- and the fill percentage below is what proves the blob is round.
      const solidSet = new Set(solidCells.map(c => c.x.toFixed(4) + '|' + c.y.toFixed(4)));
      const byXY = new Map(solidCells.map(c => [c.x.toFixed(4) + '|' + c.y.toFixed(4), c]));
      const stepA = 2 * M.half / (M.n - 1);
      const seenA = new Set(); let best = [];
      for (const c of solidCells) {
        const k0 = c.x.toFixed(4) + '|' + c.y.toFixed(4);
        if (seenA.has(k0)) continue;
        const st = [c], comp = []; seenA.add(k0);
        while (st.length) {
          const q = st.pop(); comp.push(q);
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = +(q.x + dx * stepA).toFixed(4), ny = +(q.y + dy * stepA).toFixed(4);
            const kk = nx.toFixed(4) + '|' + ny.toFixed(4);
            if (solidSet.has(kk) && !seenA.has(kk)) { seenA.add(kk); st.push(byXY.get(kk) || { x: nx, y: ny, zmin: 0, zmax: 0 }); }
          }
        }
        if (comp.length > best.length) best = comp;
      }
      const keep = best;
      const bx0 = Math.min(...keep.map(c => c.x)), bx1 = Math.max(...keep.map(c => c.x));
      const by0 = Math.min(...keep.map(c => c.y)), by1 = Math.max(...keep.map(c => c.y));
      const ax = (bx0 + bx1) / 2, ay = (by0 + by1) / 2;
      const rad = Math.max((bx1 - bx0) / 2, (by1 - by0) / 2);
      const fill = keep.length * stepA * stepA / (Math.PI * rad * rad);
      console.log(`
  ---- THE DRUM, OFF THE RAYS, IN VIEW UNITS ----`);
      console.log(`  solid cells ${solidCells.length} -> kept ${keep.length}   disc fill ${(100*fill).toFixed(1)}% of a circle (a real disc is near 100)`);
      console.log(`  axis (${ax.toFixed(4)}, ${ay.toFixed(4)})   radius ${rad.toFixed(4)}`);
      const front = Math.min(...keep.map(c => c.zmin)), rear = Math.max(...keep.map(c => c.zmax));
      console.log(`  end faces  front z ${front.toFixed(4)}   rear z ${rear.toFixed(4)}   length ${(rear-front).toFixed(4)}`);
      // WHAT TO DECLARE, converted back into the model units spec.cyl is written in, using the gun's own bore height and
      // model scale rather than the Python's. axis is the drum axis measured DOWN from the bore, which is the quantity
      // the builder needs and the one that was previously derived from the bolt circle instead of measured.
      if (B.boreG != null && B.s) {
        console.log(`  built axisY ${B.axisY}  vs MEASURED ${ay.toFixed(4)}   (out by ${(B.axisY-ay).toFixed(4)})`);
        console.log(`  -> declare axis    = ${((B.boreG - ay) / B.s).toFixed(3)}`);
        console.log(`  -> declare bolt    = ${(0.62 * rad / B.s).toFixed(3)}   (0.62 of the drum radius)`);
        console.log(`  -> declare chamber = ${(0.22 * rad / B.s).toFixed(3)}   (0.22 of it)`);
      }
      console.log(`  a real six-shot revolver puts the bolt circle at ~0.62 of the drum radius = ${(0.62*rad).toFixed(4)}`);
      console.log(`  and the chamber radius at ~0.22 of it              = ${(0.22*rad).toFixed(4)}`);
    }

    // The bores: cells with no crossing inside the window, clustered. Cells outside the drum also have none, so the
    // clusters are filtered by lying inside the drum's disc -- which is the largest connected RING of crossings.
    const step = 2 * M.half / (M.n - 1);
    const holeCells = [];
    for (let iy = 0; iy < M.n; iy++) for (let ix = 0; ix < M.n; ix++) {
      const c = M.cells[iy * M.n + ix];
      if (inWin(c) === 0) holeCells.push({ ix, iy, x: c.x, y: c.y });
    }
    // Flood fill on grid indices, 4-connected.
    const id = (a, b) => a + '|' + b;
    const have = new Set(holeCells.map(c => id(c.ix, c.iy)));
    const seen = new Set(); const clusters = [];
    for (const c of holeCells) {
      if (seen.has(id(c.ix, c.iy))) continue;
      const st = [c], cl = []; seen.add(id(c.ix, c.iy));
      while (st.length) {
        const q = st.pop(); cl.push(q);
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = q.ix + dx, ny = q.iy + dy, k = id(nx, ny);
          if (nx<0||ny<0||nx>=M.n||ny>=M.n) continue;
          if (have.has(k) && !seen.has(k)) { seen.add(k); st.push({ ix:nx, iy:ny, x:-M.half+2*M.half*nx/(M.n-1), y:-M.half+2*M.half*ny/(M.n-1) }); }
        }
      }
      clusters.push(cl);
    }
    clusters.sort((a, b) => b.length - a.length);
    console.log(`
  zero-crossing clusters: ${clusters.length}  sizes ${clusters.slice(0,12).map(c=>c.length).join(',')}`);
    // The outside world is one huge cluster touching the border; the bores are the enclosed ones.
    const enclosed = clusters.filter(cl => !cl.some(q => q.ix===0||q.iy===0||q.ix===M.n-1||q.iy===M.n-1));
    console.log(`  enclosed clusters (candidate bores): ${enclosed.length}  sizes ${enclosed.slice(0,12).map(c=>c.length).join(',')}`);
    const bores = enclosed.filter(cl => cl.length >= 6).slice(0, 8).map(cl => {
      const cx = cl.reduce((s,q)=>s+q.x,0)/cl.length, cy = cl.reduce((s,q)=>s+q.y,0)/cl.length;
      const r = Math.sqrt(cl.length * step * step / Math.PI);
      return { cx:+cx.toFixed(4), cy:+cy.toFixed(4), n:cl.length, r:+r.toFixed(4) };
    });
    for (const b of bores) console.log(`    bore centre (${b.cx},${b.cy})  cells=${b.n}  equiv radius ${b.r}`);
    if (bores.length >= 3) {
      const ax = bores.reduce((s,b)=>s+b.cx,0)/bores.length, ay = bores.reduce((s,b)=>s+b.cy,0)/bores.length;
      const rs = bores.map(b => Math.hypot(b.cx-ax, b.cy-ay));
      const mean = rs.reduce((a,b)=>a+b,0)/rs.length;
      const sd = Math.sqrt(rs.reduce((s,r)=>s+(r-mean)**2,0)/rs.length);
      const s231 = 0.231;   // view units per placement unit, from the shipped case radius 0.006 = chamber 0.026 * s
      console.log(`
  ---- MEASURED OFF THE MESH, IN VIEW UNITS ----`);
      console.log(`  drum axis (${ax.toFixed(4)}, ${ay.toFixed(4)})   bores ${bores.length}`);
      console.log(`  bolt circle   = ${mean.toFixed(4)}  sd ${sd.toFixed(4)}   -> placement bolt    = ${(mean/s231).toFixed(4)}`);
      console.log(`  chamber radius= ${(bores.reduce((s,b)=>s+b.r,0)/bores.length).toFixed(4)}         -> placement chamber = ${((bores.reduce((s,b)=>s+b.r,0)/bores.length)/s231).toFixed(4)}`);
      console.log(`  (shipped: bolt 0.057, chamber 0.026)`);
    }

    console.log('  errors: ' + (W.errors.length ? W.errors.slice(0, 3).join(' | ') : 'none'));
  } finally { await W.close(); }
})();
