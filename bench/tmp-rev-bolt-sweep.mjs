// THE REVOLVER'S BOLT CIRCLE, SWEPT AND PHOTOGRAPHED.
//
// bench/tmp-rev-chambers.mjs established the fault: the six brass cases are present, sit in a tight rosette around the
// bore, and are entirely occluded by the drum -- painted with depth testing off they show, with it on they vanish. That
// is Ben's "the chambers are still empty", four reports running.
//
// It did not establish the right number, and three separate fits of the GLB disagreed (6-fold symmetry axis -> 0.090,
// outer-wall circle fit -> 0.124, per-chamber centroids -> 0.069 on 8-12 vertices each) because the drum cannot be
// separated from the frame and the grip by an x range alone. So the number is swept and judged, which is what
// __hc.revCyl is for.
//
//   node bench/tmp-rev-bolt-sweep.mjs [gun]
//
// PER VALUE, TWO FRAMES AND ONE NUMBER:
//   plain  what a player sees. Brass in the holes and no sky through the drum is the target.
//   thru   the cases painted magenta through the gun, so where they sit is never in doubt.
//   sky%   sky-coloured pixels inside the model's own rectangle. Ben's complaint is see-through chambers, so this is
//          the fault as a number: it should FALL as the cases move into the holes, and the frame says whether it fell
//          for the right reason.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GUN = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'revolver';
const DIR = path.join(OUT, 'revbolt');
const BOLTS = [0.057, 0.069, 0.080, 0.090, 0.100, 0.112, 0.124];

// Sky inside the crop. The drum is against open sky in this pose, so a hole through it reads as sky where metal should
// be. Counted as bright AND blue-dominant, which distinguishes sky from a specular highlight on steel.
function skyPct(file) {
  const P = decodePNG(fs.readFileSync(file));
  let sky = 0, n = 0;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const i = (y * P.w + x) * P.ch, r = P.data[i], g = P.data[i+1], b = P.data[i+2];
    const l = 0.2126*r + 0.7152*g + 0.0722*b; n++;
    if (l > 90 && b > r + 8) sky++;
  }
  return +(100 * sky / n).toFixed(2);
}

// Magenta, which is only ever the paint. In the `solid` frame this is the whole measurement: it is the fraction of the
// brass that nothing is drawn in front of. Zero means every case is buried in the drum, which is the shipped fault.
function magentaPct(file) {
  const P = decodePNG(fs.readFileSync(file));
  let m = 0, n = 0;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const i = (y * P.w + x) * P.ch, r = P.data[i], g = P.data[i+1], b = P.data[i+2];
    // Measured off a painted frame rather than assumed: 0xff00ff arrives on screen at about (216,130,201) after tone
    // mapping, so a "green is much lower than both red and blue" test finds it and a "green is under 60% of red" test
    // does not -- the latter scored zero on a frame with the rosette plainly visible in it.
    n++; if (r > g + 25 && b > g + 25) m++;
  }
  return +(100 * m / n).toFixed(3);
}

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

    const when = 0.30;
    const P0 = await p.evaluate(`__hc.probe()`);
    await p.evaluate(`__hc.hold(${JSON.stringify(GUN)})`);
    await p.evaluate(`(()=>{ const q=__hc.attProbe(); if(q&&q.slots) for(const s of q.slots) __hc.attFit(s,null); })()`).catch(()=>{});
    console.log(`  cyl as shipped ${JSON.stringify(await p.evaluate(`__hc.revCyl(null,${JSON.stringify(GUN)})`))}`);

    // Ben's own vantage: nearly straight up, so the whole background is sky and a hole cannot be mistaken for shadow.
    const pose = async () => { await p.evaluate(`__hc.setTime(${when}); __hc.tp(${P0.x},${P0.y},${P0.z},0,1.35);`); await sleep(260); };
    await pose();
    await p.evaluate(`__hc.aim(true)`);
    for (let i = 0; i < 30; i++) { const c = await p.evaluate(`__hc.adsClearance()`); if (c && c.adsT >= 0.999) break; await sleep(120); }
    await pose();

    for (const bolt of BOLTS) {
      await p.evaluate(`__hc.revCyl({bolt:${bolt}},${JSON.stringify(GUN)})`);
      await pose();
      // Re-aim: re-holding the gun drops the aim blend, and the hip pose frames the drum differently.
      await p.evaluate(`__hc.aim(true)`);
      for (let i = 0; i < 30; i++) { const c = await p.evaluate(`__hc.adsClearance()`); if (c && c.adsT >= 0.999) break; await sleep(120); }
      await pose();

      const R = await p.evaluate(`__hc.heldRect()`);
      const pad = 30;
      const clip = { x: Math.max(0, R.x - pad), y: Math.max(0, R.y - pad),
                     width: Math.min(R.w - Math.max(0, R.x - pad), R.width + pad*2),
                     height: Math.min(R.h - Math.max(0, R.y - pad), R.height + pad*2) };
      const tagN = String(Math.round(bolt*1000)).padStart(3,'0');

      const shot = async (name) => {
        await p.evaluate(`__hc.setTime(${when})`); await sleep(200);
        const f2 = path.join(DIR, `${GUN}-b${tagN}-${name}.png`);
        await p.screenshot({ path: f2, clip });
        execFileSync('python', ['-c',
          `from PIL import Image\nim=Image.open(r'${f2}')\nk=max(1,min(6,900//max(1,im.width)))\nim.resize((im.width*k,im.height*k),Image.NEAREST).save(r'${f2.replace('.png','-big.png')}')`]);
        return f2;
      };

      await p.evaluate(`__hc.heldPaint()`);
      const plain = await shot('plain');
      const L = await p.evaluate(`__hc.heldParts()`);
      const brass = L.parts.filter(q => (q.col||'').toLowerCase() === '#c9a24a').map(q => q.i);
      for (const i of brass) await p.evaluate(`__hc.heldPaint(${i},0xff00ff,true)`);
      const thru = await shot('thru');
      await p.evaluate(`__hc.heldPaint()`);
      for (const i of brass) await p.evaluate(`__hc.heldPaint(${i},0xff00ff,false)`);
      const solid = await shot('solid');
      await p.evaluate(`__hc.heldPaint()`);

      // thru is the control: it is how much magenta there is to see at all. solid/thru is the fraction NOT buried.
      const mT = magentaPct(thru), mS = magentaPct(solid);
      console.log(`  bolt ${bolt.toFixed(3)}  rect ${R.width}x${R.height}  skyPlain=${skyPct(plain)}%  magenta thru=${mT}% solid=${mS}%  exposed=${mT>0?(100*mS/mT).toFixed(1):'n/a'}%`);
    }
    console.log('  errors: ' + (W.errors.length ? W.errors.slice(0,3).join(' | ') : 'none'));
    console.log('  dir: ' + DIR);
  } finally { await W.close(); }
})();
