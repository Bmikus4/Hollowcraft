// RADIUS SWEEP, IN METRES. The question is which world radius makes creases read OUTDOORS without the broad
// darkening halo that reads as "gamey" -- so both a moved-pixel count (does it do anything) and the whole-frame
// luminance drop (is it just dimming the picture) are reported for every step.
import { openWorld, shots, statMedian, diffStat, CROP, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';

const SITES = { village:`H.setTime(0.35); goVillage();`, forest:`H.setTime(0.35); goForest(); H.cam({yaw:0.7,pitch:-0.02});`, cabin:`H.setTime(0.30); goCabin();` };
const RADII = [0.07, 0.15, 0.30, 0.50, 0.80];

const W = await openWorld({ rd:8, quality:'High' });
try{
  await W.ev(HELPERS);
  for(const [name,setup] of Object.entries(SITES)){
    await W.ev(`(function(){${setup}})()`);
    for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
    await sleep(2000); await W.ev(`__hc.freezeT(120)`);
    await W.ev(`__hc.ssao(false)`);
    const off = await shots(W, `aos-${name}-off`, null, 2);
    const sOff = statMedian(off, CROP.frame);
    console.log(`\n${name}   (AO off: lum ${sOff.lum}, minCh ${sOff.minCh})`);
    const ctl = diffStat(off[0], off[1], CROP.frame);
    console.log(`  noise floor: ${ctl.movedPct}% moved, mad ${ctl.mad}`);
    for(const r of RADII){
      await W.ev(`__hc.ssao(true,{strength:0.55,radius:${r},bias:0.035})`);
      const on = await shots(W, `aos-${name}-r${String(r).replace('.','_')}`, null, 2);
      const s = statMedian(on, CROP.frame), d = diffStat(on[0], off[0], CROP.frame);
      console.log(`  r=${String(r).padEnd(5)}m  moved ${String(d.movedPct).padStart(6)}%  mad ${String(d.mad).padStart(6)}  lum ${sOff.lum} -> ${String(s.lum).padStart(6)} (${(s.lum-sOff.lum).toFixed(2)})  minCh ${String(s.minCh).padStart(6)}`);
    }
  }
}finally{ await W.close(); }
