// IS THE CONTACT-OCCLUSION PASS ACTUALLY READING? Ben 08-10: "also add ambient occlusion ... I also want SSAO for
// depth". It has been shipped and enabled since 08-04, so the question is not whether to build one but how much of
// the frame it is moving. Paired on/off in ONE page at three crease-heavy sites, then a strength sweep.
import { openWorld, pin, shots, statMedian, diffStat, CROP, fmt, sleep, OUT } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';

const SITES = {
  village:      `H.setTime(0.35); goVillage();`,
  cabin_noon:   `H.setTime(0.30); goCabin();`,
  dungeon_hall: `goDungeon('hall');`,
  forest:       `H.setTime(0.35); goForest(); H.cam({yaw:0.7, pitch:-0.02});`,
};

const W = await openWorld({ rd:8, quality:'High' });
try{
  await W.ev(HELPERS);
  console.log('ssao at boot:', JSON.stringify(await W.ev(`__hc.ssao()`)));
  for(const [name, setup] of Object.entries(SITES)){
    await W.ev(`(function(){${setup}})()`);
    for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
    await sleep(2000);
    await W.ev(`__hc.freezeT(120)`);
    await W.ev(`__hc.ssao(true,{strength:0.55,radius:26,bias:0.035})`);
    const on  = await shots(W, `aor-${name}-on`, null, 3);
    await W.ev(`__hc.ssao(false)`);
    const off = await shots(W, `aor-${name}-off`, null, 3);
    await W.ev(`__hc.ssao(true)`);
    const d = diffStat(on[0], off[0], CROP.frame);
    const sOn = statMedian(on, CROP.frame), sOff = statMedian(off, CROP.frame);
    console.log(`\n${name}`);
    console.log(`  on   ${fmt(sOn)}`);
    console.log(`  off  ${fmt(sOff)}`);
    console.log(`  AO moves: mad ${d.mad}/255, ${d.movedPct}% of pixels by >2, peak ${d.max}   lum ${sOff.lum} -> ${sOn.lum}`);
    // control: two shots of the SAME condition, so "moved" has a noise floor to be read against
    const c = diffStat(on[0], on[1], CROP.frame);
    console.log(`  control (same condition): mad ${c.mad}, ${c.movedPct}% moved, peak ${c.max}`);
  }
}finally{ await W.close(); }
