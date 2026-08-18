// ARE THE REVOLVER'S CASES IN ITS CHAMBERS, OR IN THE METAL BESIDE THEM?
//
// Four attempts have each answered this differently (guessed 0.58/0.17 ratios; then rims-and-plugs; then full-length
// cases off tools/gun-cylinder.py's measured bolt circle; then a carry-pose change). Ben, 2026-08-18: "revolvers still
// have empty bullet slots. This is a modeling/texture change, NOT a band aid."
//
// The cases exist -- twelve brass meshes, six long bodies and six rims, are in the held model right now. So the open
// question is not whether they were built, it is whether they are WHERE THE HOLES ARE. Three frames settle it:
//
//   plain    the model as it ships. Sky through a chamber is the fault, in his own words.
//   thru     the brass painted magenta with depth testing OFF, so it draws over everything. This is where the cases
//            ARE, unarguably, whether or not anything hides them.
//   solid    the same magenta with depth testing ON. Magenta that is present in `thru` and absent here is brass that
//            something is drawn in front of -- i.e. buried in the drum's metal instead of sitting in its bore.
//
// `thru` against `solid` is the whole measurement. A case correctly seated in a hole shows magenta in BOTH.
//
//   node bench/tmp-rev-chambers.mjs [gun] [--night]
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GUN   = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'revolver';
const NIGHT = process.argv.includes('--night');
const DIR   = path.join(OUT, 'revchamber');

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const W = await openWorld({ w: 1280, h: 720, rd: 8 });
  const p = W.page;
  try {
    await p.evaluate(`(()=>{ for(const id of ['bgvid','menufx']){ const e=document.getElementById(id); if(e) e.style.display='none'; } })()`);
    await p.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    const t0 = Date.now(); let f = null;
    while (Date.now() - t0 < 240000) {
      f = await p.evaluate(`__hc.fill()`);
      if (f && f.want > 0 && f.meshed / f.want >= 0.92) break;
      await sleep(1500);
    }
    console.log(`  fill ${f && f.meshed}/${f && f.want}`);
    await p.evaluate(`__hc.dof({on:false})`);

    const when = NIGHT ? 0.75 : 0.30, tag = NIGHT ? 'night' : 'day';
    const P = await p.evaluate(`__hc.probe()`);
    console.log(`  held ${JSON.stringify(await p.evaluate(`__hc.hold(${JSON.stringify(GUN)})`))}`);
    await p.evaluate(`(()=>{ const q=__hc.attProbe(); if(q&&q.slots) for(const s of q.slots) __hc.attFit(s,null); })()`).catch(()=>{});

    // Nearly vertical, so the background is open sky and a hole through the drum cannot be confused with dark ground.
    await p.evaluate(`__hc.setTime(${when}); __hc.tp(${P.x},${P.y},${P.z},0,1.35);`); await sleep(300);
    await p.evaluate(`__hc.aim(true)`);
    for (let i = 0; i < 30; i++) { const c = await p.evaluate(`__hc.adsClearance()`); if (c && c.adsT >= 0.999) break; await sleep(120); }
    await p.evaluate(`__hc.setTime(${when})`); await sleep(300);

    const L = await p.evaluate(`__hc.heldParts()`);
    // The brass, found by its own colour rather than by an index that shifts whenever a part is added to the builder.
    const brass = L.parts.filter(q => (q.col || '').toLowerCase() === '#c9a24a').map(q => q.i);
    console.log(`  ${L.id}: ${L.n} meshes, brass at [${brass.join(',')}]`);

    const R = await p.evaluate(`__hc.heldRect()`);
    console.log(`  heldRect ${JSON.stringify(R)}`);
    // Pad the model's rectangle, clamped to the frame: the drum's holes are at its edge and a tight box clips them.
    const pad = 40;
    const clip = { x: Math.max(0, R.x - pad), y: Math.max(0, R.y - pad),
                   width: Math.min(R.w - Math.max(0, R.x - pad), R.width + pad*2),
                   height: Math.min(R.h - Math.max(0, R.y - pad), R.height + pad*2) };
    console.log(`  clip ${JSON.stringify(clip)}`);

    const shot = async (name) => {
      await p.evaluate(`__hc.setTime(${when})`); await sleep(220);
      const f2 = path.join(DIR, `${GUN}-${name}-${tag}.png`);
      await p.screenshot({ path: f2, clip });
      // Upscaled on the way out, because the answer is a pattern a few pixels across and it has to survive being looked at.
      execFileSync('python', ['-c',
        `from PIL import Image\nim=Image.open(r'${f2}')\nk=max(1,min(6,900//max(1,im.width)))\nim.resize((im.width*k,im.height*k),Image.NEAREST).save(r'${f2.replace('.png','-big.png')}')\nprint(im.size,k)`]);
      return f2;
    };

    await p.evaluate(`__hc.heldPaint()`);
    await shot('plain');
    for (const i of brass) await p.evaluate(`__hc.heldPaint(${i},0xff00ff,true)`);
    await shot('thru');
    await p.evaluate(`__hc.heldPaint()`);
    for (const i of brass) await p.evaluate(`__hc.heldPaint(${i},0xff00ff,false)`);
    await shot('solid');
    await p.evaluate(`__hc.heldPaint()`);

    console.log('  errors: ' + (W.errors.length ? W.errors.slice(0,3).join(' | ') : 'none'));
    console.log('  dir: ' + DIR);
  } finally { await W.close(); }
})();
