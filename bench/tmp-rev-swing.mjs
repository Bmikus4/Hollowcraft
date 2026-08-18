// THE CYLINDER SWINGING OUT, WHICH IS WHEN A PLAYER ACTUALLY LOOKS INTO A CHAMBER.
//
// On a closed revolver the recoil shield covers the rear of the drum and the barrel covers the front, so no
// first-person vantage can see a chamber at all -- which is why every frame taken of the closed gun was unable to
// settle whether the rounds were there. The reload is the moment: the crane swings the cylinder out of the frame and
// its faces come into view.
//
// It also tests the other half of the fix. userData.cyl was set only in buildRevolver, the procedural model this gun
// stopped using, so the GLB revolver's cylinder never moved. The chamber assembly is now a group standing in that slot,
// pre-rotated x=PI/2 like the mesh it replaces, so the existing animation (M.cyl.position.x for the crane,
// M.cyl.rotation.y for the spin) should drive it untouched. If the frames show no swing, that wiring is wrong.
//
//   node bench/tmp-rev-swing.mjs [gun]
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GUN = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'revolver';
const DIR = path.join(OUT, 'revswing');

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
    // Slightly down and level: the swung-out cylinder comes out to the player's left, and a level camera keeps both the
    // frame and the open crane in shot.
    await p.evaluate(`__hc.setTime(0.30); __hc.tp(${P0.x},${P0.y},${P0.z},0,0.25);`); await sleep(400);
    console.log(`  cyl spec ${JSON.stringify(await p.evaluate(`__hc.revCyl(null,${JSON.stringify(GUN)})`))}`);

    const parts = await p.evaluate(`__hc.heldParts()`);
    console.log(`  ${parts.n} meshes held`);

    // Arm it and hand back, so the animation can be watched rather than counted (d72a69f).
    const armed = await p.evaluate(`__hc.reload(true)`);
    console.log(`  reload armed ${JSON.stringify(armed)}`);

    // A burst across the whole reload. The cylinder's own x is read at each frame, so a still frame that looks wrong
    // can be tied to where in the swing it was taken.
    for (let k = 0; k < 12; k++) {
      const st = await p.evaluate(`(()=>{ const q=__hc.reloadRig?__hc.reloadRig():null; return q; })()`).catch(() => null);
      const R = await p.evaluate(`__hc.heldRect()`);
      const pad = 40;
      const clip = { x: Math.max(0, R.x - pad), y: Math.max(0, R.y - pad),
                     width: Math.min(R.w - Math.max(0, R.x - pad), R.width + pad * 2),
                     height: Math.min(R.h - Math.max(0, R.y - pad), R.height + pad * 2) };
      const f2 = path.join(DIR, `${GUN}-swing-${String(k).padStart(2, '0')}.png`);
      if (clip.width > 4 && clip.height > 4) {
        await p.screenshot({ path: f2, clip });
        execFileSync('python', ['-c',
          `from PIL import Image\nim=Image.open(r'${f2}')\nk=max(1,min(6,900//max(1,im.width)))\nim.resize((im.width*k,im.height*k),Image.NEAREST).save(r'${f2.replace('.png', '-big.png')}')`]);
      }
      console.log(`   frame ${k}  rect ${R.width}x${R.height}${st ? '  ' + JSON.stringify(st) : ''}`);
      await sleep(180);
    }
    console.log('  errors: ' + (W.errors.length ? W.errors.slice(0, 3).join(' | ') : 'none'));
    console.log('  dir: ' + DIR);
  } finally { await W.close(); }
})();
