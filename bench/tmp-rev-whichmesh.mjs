// WHAT IS BEN ACTUALLY LOOKING AT when he reports empty bullet slots?
//
// The raycast map (bench/tmp-rev-boremap.mjs) settled that guns/revolver.glb's drum is SOLID -- a fluted outer surface
// with no chambers bored through it, 2 to 3 surface crossings everywhere inside its disc and not one zero-crossing
// region. So there are no holes to fill, and the twelve brass meshes sit inside solid steel where nothing can see them.
// That means the "empty slots" in his frame are some OTHER feature reading as holes, and modelling anything before
// knowing which one would be the fifth guess in a row.
//
// The gun is five GLB meshes plus the parts the code adds. Painted a distinct colour each, at his own vantage, the
// frame says which mesh is the ring-with-gaps he photographed.
//
//   node bench/tmp-rev-whichmesh.mjs [gun]
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GUN = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'revolver';
const DIR = path.join(OUT, 'revwhich');
const COLS = [0xff0000, 0x00ff00, 0x0055ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff8800, 0xffffff];

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const W = await openWorld({ w: 1280, h: 720, rd: 8 });
  const p = W.page;
  try {
    await p.evaluate(`(()=>{ for(const id of ['bgvid','menufx']){ const e=document.getElementById(id); if(e) e.style.display='none'; } })()`);
    await p.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const t0 = Date.now(); let f = null;
    while (Date.now() - t0 < 240000) { f = await p.evaluate(`__hc.fill()`); if (f && f.want > 0 && f.meshed / f.want >= 0.92) break; await sleep(1500); }
    console.log(`  fill ${f && f.meshed}/${f && f.want}`);
    await p.evaluate(`__hc.dof({on:false})`);

    const P0 = await p.evaluate(`__hc.probe()`);
    await p.evaluate(`__hc.hold(${JSON.stringify(GUN)})`);
    await p.evaluate(`(()=>{ const q=__hc.attProbe(); if(q&&q.slots) for(const s of q.slots) __hc.attFit(s,null); })()`).catch(()=>{});
    await sleep(400);

    const L = await p.evaluate(`__hc.heldParts()`);
    // The GLB's own meshes are the ones with no declared geometry parameters -- a BufferGeometry loaded from the file,
    // as against the CylinderGeometry/BoxGeometry the builder adds by hand.
    const glb = L.parts.filter(q => q.geo === 'BufferGeometry').map(q => q.i);
    console.log(`  ${L.id}: ${L.n} meshes, GLB meshes at [${glb.join(',')}]`);

    // Both vantages: his own steep-up frame, and a level one, because a feature that reads as a hole at one angle may
    // not at the other and the difference is itself the answer.
    for (const [name, pitch] of [['up', 1.35], ['level', 0.0]]) {
      await p.evaluate(`__hc.setTime(0.30); __hc.tp(${P0.x},${P0.y},${P0.z},0,${pitch});`); await sleep(300);
      await p.evaluate(`__hc.aim(true)`);
      for (let i = 0; i < 30; i++) { const c = await p.evaluate(`__hc.adsClearance()`); if (c && c.adsT >= 0.999) break; await sleep(120); }
      await p.evaluate(`__hc.setTime(0.30); __hc.tp(${P0.x},${P0.y},${P0.z},0,${pitch});`); await sleep(300);

      const R = await p.evaluate(`__hc.heldRect()`);
      const pad = 30;
      const clip = { x: Math.max(0, R.x - pad), y: Math.max(0, R.y - pad),
                     width: Math.min(R.w - Math.max(0, R.x - pad), R.width + pad*2),
                     height: Math.min(R.h - Math.max(0, R.y - pad), R.height + pad*2) };

      const shot = async (tag) => {
        await p.evaluate(`__hc.setTime(0.30)`); await sleep(200);
        const f2 = path.join(DIR, `${GUN}-${name}-${tag}.png`);
        await p.screenshot({ path: f2, clip });
        execFileSync('python', ['-c',
          `from PIL import Image\nim=Image.open(r'${f2}')\nk=max(1,min(6,900//max(1,im.width)))\nim.resize((im.width*k,im.height*k),Image.NEAREST).save(r'${f2.replace('.png','-big.png')}')`]);
      };

      await p.evaluate(`__hc.heldPaint()`);
      await shot('plain');
      // Every GLB mesh a different colour, all at once: one frame names all five.
      for (let k = 0; k < glb.length; k++) await p.evaluate(`__hc.heldPaint(${glb[k]},${COLS[k % COLS.length]},false)`);
      await shot('bymesh');
      await p.evaluate(`__hc.heldPaint()`);
      console.log(`  ${name}: rect ${R.width}x${R.height} -> ${GUN}-${name}-{plain,bymesh}-big.png`);
    }
    console.log('  errors: ' + (W.errors.length ? W.errors.slice(0,3).join(' | ') : 'none'));
    console.log('  dir: ' + DIR);
  } finally { await W.close(); }
})();
