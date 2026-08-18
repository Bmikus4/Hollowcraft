// WHICH MESH MAKES THE HOLES IN THE REVOLVER. Ben, four times now, most recently 2026-08-18 with
// `D:\Screenshot 2026-08-18 121850.png`: "revolvers still have empty bullet slots ... This is a modeling/texture
// change, NOT a band aid."
//
// The last session answered this by moving the CARRY POSE, reasoning that he was staring down the back of his own gun
// (see the block-out note at 'IT GOES UP AND OUT'). It never established which mesh made the holes in his photograph,
// and he has rejected the result. So this establishes it, by isolation rather than by argument: show exactly one part of
// the held model at a time and photograph it against open sky. The shape that appears is that part's real silhouette,
// and the part whose silhouette is a ring with gaps in it is the part in his frame.
//
//   node bench/tmp-revolver-parts.mjs [gun] [--night]
//
// WHY SKY, SHARP, AND AIMED. A hole bored through blued steel is invisible against dark ground and unmistakable against
// the sky, which is why his own frame was taken looking up; depth of field turns a 40-pixel cylinder into paste, so the
// DoF pass is switched off rather than dialled; and aiming brings the piece to the middle of the frame where the crop
// can spend the whole image on it.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs'; import path from 'node:path';

const GUN   = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'revolver';
const NIGHT = process.argv.includes('--night');
const DIR   = path.join(OUT, 'revparts');
const CLIP  = { x: 470, y: 210, width: 380, height: 320 };

// Dark pixels inside the crop = the model's own silhouette; bright bluish ones = the sky behind it. Counting both is
// what separates "this part is small" from "this part did not draw at all", which an area alone cannot.
function silhouette(file) {
  const P = decodePNG(fs.readFileSync(file));
  let dark = 0, sky = 0, n = 0;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const i = (y * P.w + x) * P.ch, r = P.data[i], g = P.data[i+1], b = P.data[i+2];
    const l = 0.2126*r + 0.7152*g + 0.0722*b; n++;
    if (l < 70) dark++; else if (b >= r) sky++;
  }
  return { darkPct: +(100*dark/n).toFixed(2), skyPct: +(100*sky/n).toFixed(2) };
}

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

    console.log('  dof ' + JSON.stringify(await p.evaluate(`__hc.dof({on:false})`)));

    const when = NIGHT ? 0.75 : 0.30, tag = NIGHT ? 'night' : 'day';
    const P = await p.evaluate(`__hc.probe()`);

    const held = await p.evaluate(`__hc.hold(${JSON.stringify(GUN)})`);
    console.log(`  held ${JSON.stringify(held)}`);
    await p.evaluate(`(()=>{ const q=__hc.attProbe(); if(q&&q.slots) for(const s of q.slots) __hc.attFit(s,null); })()`).catch(()=>{});
    await sleep(300);

    // NEARLY VERTICAL, which is where his frame was taken: the whole background is then sky and nothing else can be
    // mistaken for a hole through the gun.
    const pose = async () => { await p.evaluate(`__hc.setTime(${when}); __hc.tp(${P.x},${P.y},${P.z},0,1.35);`); await sleep(260); };
    await pose();
    await p.evaluate(`__hc.aim(true)`);
    for (let i = 0; i < 30; i++) { const c = await p.evaluate(`__hc.adsClearance()`); if (c && c.adsT >= 0.999) break; await sleep(120); }
    await pose();

    const L = await p.evaluate(`__hc.heldParts()`);
    if (L.err) { console.log('  heldParts err ' + L.err); return; }
    console.log(`  ${L.id}: ${L.n} meshes`);
    for (const q of L.parts) console.log(`    [${String(q.i).padStart(2)}] ${q.geo.padEnd(16)} ${q.mat||''} ${q.col||''} pos ${JSON.stringify(q.pos)} ${JSON.stringify(q.dim)}`);

    const shot = async (name) => { await p.evaluate(`__hc.setTime(${when})`); await sleep(200);
      const file = path.join(DIR, `${GUN}-${name}-${tag}.png`); await p.screenshot({ path: file, clip: CLIP }); return file; };

    await p.evaluate(`__hc.heldHide()`);
    const base = await shot('ALL');
    console.log(`  ALL       ${JSON.stringify(silhouette(base))}`);

    // ONE PART AT A TIME. hide-all-then-show-one, so what is in the frame is unambiguous.
    for (const q of L.parts) {
      await p.evaluate(`(()=>{ const n=__hc.heldParts().n; for(let k=0;k<n;k++) __hc.heldHide(k); __hc.heldHide(${q.i},false); })()`);
      await sleep(160);
      const f2 = await shot(`only${String(q.i).padStart(2,'0')}`);
      console.log(`  only[${String(q.i).padStart(2)}] ${q.geo.padEnd(16)} ${JSON.stringify(silhouette(f2))}`);
    }
    await p.evaluate(`__hc.heldHide()`);
    console.log('  errors: ' + (W.errors.length ? W.errors.slice(0,3).join(' | ') : 'none'));
    console.log('  dir: ' + DIR);
  } finally { await W.close(); }
})();
