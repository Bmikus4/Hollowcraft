// WAVE 0: THE GUN AND ATTACHMENT SWEEP, PHOTOGRAPHED RATHER THAN PROBED.
//
// Every attachment claim on the backlog already has a NUMBER behind it -- attProbe measures the mount gap in the gun's
// own space (95063e0), ATT_MM declares a real size per piece (28970), ATT_SPEC/ATT_SHINE set a satin gunmetal (29106).
// What none of them has is a photograph of the piece MOUNTED, which is the only thing that can close "suppressor too
// small", "optics are pale grey" and "revolvers have empty bullet slots". This takes those photographs.
//
//   node bench/tmp-attvis.mjs bare              -- bare guns: the revolver cylinders and the rifle bolts
//   node bench/tmp-attvis.mjs atts [--night]    -- gun x attachment, one piece at a time, then all at once
//
// TWO THINGS THIS DOES THAT THE EXISTING SCRATCH HARNESSES DO NOT:
//
//   * IT WAITS FOR THE WORLD TO MESH. The loader hiding is not that milestone: a four-side pines run this morning
//     photographed a pine ring floating over blank grey and a "sea" that was flat untextured sand, because the frames
//     came before the terrain existed. fill() reports meshed/want and that is the gate (see the note at uCanopy).
//   * IT PUTS SKY BEHIND THE GUN. A hole bored through a revolver's cylinder is invisible against dark ground and
//     obvious against the sky -- which is exactly why Ben's own frame of it (Screenshot 2026-08-18 121850) was taken
//     looking up. The level pose and the sky pose are both shot for every gun, and the sky one is the one that answers
//     "is that chamber empty or just dark".
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import fs from 'node:fs'; import path from 'node:path';

const MODE  = process.argv[2] || 'bare';
const NIGHT = process.argv.includes('--night');
const DIR   = path.join(OUT, 'attvis');

// The guns each open item actually names, not all twenty-odd: three revolvers for the empty chambers, the bolt guns for
// the bolt that was added, and one of each action for the attachment fit.
const ARGV_GUNS = (process.argv[3] && !process.argv[3].startsWith('--')) ? process.argv[3].split(',') : null;
const BARE_GUNS = ARGV_GUNS || ['revolver','revolver_snub','revolver_rail','ar15','hunting_rifle','shotgun','pistol'];
const ATT_GUNS  = ARGV_GUNS || ['ar15','hunting_rifle','shotgun','pistol','revolver'];
const ATTS = ['red_dot','holo_sight','optic_scope','suppressor','weapon_light','laser_sight','foregrip'];

// LEVEL AND SKY. pitch's sign is not asserted here -- both are shot and whichever holds sky is the readable one, which
// costs one frame and removes a convention I would otherwise be guessing at.
const POSES = [['level',0],['sky',-1.15],['sky2',1.15]];

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const W = await openWorld({ w:1280, h:720, rd:8 });
  const p = W.page;
  try {
    // The menu's background video and fx layer sit over the canvas at z-index 19 and survive start in some working
    // copies; a screenshot then photographs the key art instead of the hands.
    await p.evaluate(`(()=>{ for(const id of ['bgvid','menufx']){ const e=document.getElementById(id); if(e) e.style.display='none'; } })()`);
    await p.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    // ---- THE MESH GATE ----
    const t0 = Date.now(); let f = null;
    while (Date.now() - t0 < 240000) {
      f = await p.evaluate(`__hc.fill()`);
      if (f && f.want > 0 && f.meshed / f.want >= 0.92) break;
      await sleep(1500);
    }
    console.log(`  fill ${JSON.stringify(f)}  after ${((Date.now()-t0)/1000).toFixed(0)}s`);

    const when = NIGHT ? 0.75 : 0.30;
    await p.evaluate(`__hc.setTime(${when})`); await sleep(900); await p.evaluate(`__hc.setTime(${when})`); await sleep(400);
    const tag = NIGHT ? 'night' : 'day';

    // Stand somewhere with open sky overhead rather than under the canopy, so the sky pose really is sky.
    const P = await p.evaluate(`__hc.probe()`);
    console.log(`  probe ${JSON.stringify({x:P.x,y:P.y,z:P.z,sea:P.sea,spawnX:P.spawnX,spawnZ:P.spawnZ})}`);

    const shoot = async (name, pitch) => {
      // Re-pin the clock before every frame: it keeps running, and a drifted sun is a different photograph.
      await p.evaluate(`__hc.setTime(${when}); __hc.tp(${P.x},${P.y},${P.z},0,${pitch});`);
      await sleep(420);
      const file = path.join(DIR, `${name}-${tag}.png`);
      await p.screenshot({ path: file });
      return file;
    };

    // ---- AIMED, AND CROPPED TO THE GUN ----
    // A hip-carried revolver is forty pixels of cylinder in the corner of a 1280x720 frame, which is the same crop
    // problem that has voided verdicts on this project before. Aiming brings the piece up to the centre of the frame,
    // and the clip then spends the whole image on it. `--adsT` is polled rather than slept on: the aim is a blend and a
    // fixed wait photographs it halfway up.
    const shootAds = async (name, pitch) => {
      await p.evaluate(`__hc.setTime(${when}); __hc.tp(${P.x},${P.y},${P.z},0,${pitch});`);
      await sleep(200);
      await p.evaluate(`__hc.aim(true)`);
      for (let i = 0; i < 30; i++) {
        const c = await p.evaluate(`__hc.adsClearance()`);
        if (c && c.adsT >= 0.999) break;
        await sleep(120);
      }
      await p.evaluate(`__hc.setTime(${when})`); await sleep(200);
      const full = path.join(DIR, `${name}-ads-${tag}.png`);
      await p.screenshot({ path: full });
      // The centre of the frame, at a third of the width, so the piece fills the image when it is read back.
      const crop = path.join(DIR, `${name}-adscrop-${tag}.png`);
      await p.screenshot({ path: crop, clip: { x: 420, y: 230, width: 440, height: 300 } });
      await p.evaluate(`__hc.aim(false)`); await sleep(200);
      return crop;
    };

    if (MODE === 'bare') {
      for (const g of BARE_GUNS) {
        const held = await p.evaluate(`__hc.hold(${JSON.stringify(g)})`);
        if (held && held.err) { console.log(`  ${g}: ${held.err}`); continue; }
        // Clear every slot, so what is photographed is the gun's OWN model and nothing fitted to it -- the bolt
        // question and the chamber question are both about the model as it ships.
        await p.evaluate(`(()=>{ const q=__hc.attProbe(); if(q&&q.slots) for(const s of q.slots) __hc.attFit(s,null); })()`).catch(()=>{});
        await sleep(300);
        const sig = await p.evaluate(`__hc.heldSig()`);
        for (const [pn, pitch] of POSES) await shoot(`${g}-${pn}`, pitch);
        // Aimed at the sky, cropped: the frame that answers whether a chamber is empty or merely dark.
        await shootAds(`${g}-sky`, 1.15);
        console.log(`  ${g}: meshes ${sig && sig.meshes}  -> ${g}-{level,sky,sky2,sky-adscrop}-${tag}.png`);
      }
    } else {
      const M = await p.evaluate(`__hc.attMatrix()`);
      if (M.err) { console.log('  attMatrix err ' + M.err); }
      const byGun = {}; for (const r of (M.rows||[])) byGun[r.gun] = r;
      for (const g of ATT_GUNS) {
        const row = byGun[g];
        if (!row) { console.log(`  ${g}: not in matrix`); continue; }
        const held = await p.evaluate(`__hc.hold(${JSON.stringify(g)})`);
        if (held && held.err) { console.log(`  ${g}: ${held.err}`); continue; }
        const fitting = ATTS.filter(a => row.fits[a]);
        console.log(`  ${g}: modelled=${row.modelled} rail=${row.rail} fits ${fitting.join(',')||'(none)'}`);
        for (const a of fitting) {
          const q = await p.evaluate(`(()=>{ const pr=__hc.attProbe(); if(pr&&pr.slots) for(const s of pr.slots) __hc.attFit(s,null);
                                             __hc.attFit(${JSON.stringify(slotOf(a))},${JSON.stringify(a)}); return __hc.attProbe(); })()`);
          await sleep(300);
          const fit = (q.fitted||[]).find(x => x.id === a);
          for (const [pn, pitch] of POSES.slice(0,2)) await shoot(`${g}-${a}-${pn}`, pitch);
          console.log(`    ${a}: gap ${fit && fit.gap!=null ? fit.gap : 'n/a'}  pos ${fit && fit.pos ? JSON.stringify(fit.pos) : 'n/a'}`);
        }
        // ALL AT ONCE, which is the only pass that can show two pieces occupying the same space.
        if (fitting.length > 1) {
          await p.evaluate(`(()=>{ const pr=__hc.attProbe(); if(pr&&pr.slots) for(const s of pr.slots) __hc.attFit(s,null); })()`);
          for (const a of fitting) await p.evaluate(`__hc.attFit(${JSON.stringify(slotOf(a))},${JSON.stringify(a)})`);
          await sleep(350);
          for (const [pn, pitch] of POSES.slice(0,2)) await shoot(`${g}-ALL-${pn}`, pitch);
          console.log(`    ALL -> ${g}-ALL-{level,sky}-${tag}.png`);
        }
      }
    }
    console.log('  errors: ' + (W.errors.length ? W.errors.slice(0,3).join(' | ') : 'none'));
    console.log('  dir: ' + DIR);
  } finally { await W.close(); }
})();

// The slot each piece belongs to, mirroring ATT_DEFS. Kept here rather than read off the page because attFit takes the
// slot and the id, and a wrong slot is silently refused (25631) -- which would photograph a bare gun and call it fitted.
function slotOf(a) {
  return ({ red_dot:'optic', holo_sight:'optic', optic_scope:'optic', suppressor:'muzzle',
            weapon_light:'light', laser_sight:'laser', foregrip:'grip' })[a];
}
