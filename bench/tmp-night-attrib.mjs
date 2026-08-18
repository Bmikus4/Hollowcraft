// WHO OWNS THE NIGHT GROUND? Midnight, empty hands, baked light 0 at the crop, one term zeroed at a time,
// baseline repeated last so the reading is not drift. The HUD band is the control: no lighting term can touch it.
//   node bench/tmp-night-attrib.mjs
import { openWorld, pin, shots, statMedian, CROP, fmt, sleep } from './lib/rig.mjs';
const NIGHT=0.75;
const HUD=[0.02,0.30,0.86,0.98];
const CONDS=[
  ['baseline',      `__hc.sun({moonI:0.42}); __hc.fillLight({hemi:1,amb:1})`],
  ['moon 0',        `__hc.sun({moonI:0});    __hc.fillLight({hemi:1,amb:1})`],
  ['hemi 0',        `__hc.sun({moonI:0.42}); __hc.fillLight({hemi:0,amb:1})`],
  ['amb 0',         `__hc.sun({moonI:0.42}); __hc.fillLight({hemi:1,amb:0})`],
  ['all 0',         `__hc.sun({moonI:0});    __hc.fillLight({hemi:0,amb:0})`],
  ['baseline again',`__hc.sun({moonI:0.42}); __hc.fillLight({hemi:1,amb:1})`],
];
(async()=>{
  const W = await openWorld({ rd:8, w:900, h:520 });
  const P = W.page;
  try{
    for(const s of [{tag:'sand',x:267,z:30},{tag:'grass',x:300,z:8}]){
      const gy = await P.evaluate(`__hc.groundY(${s.x},${s.z})`);
      await P.evaluate(`__hc.tp(${s.x}, ${gy+1.7}, ${s.z}, 0, -1.45)`);
      await sleep(1400); await pin(W, NIGHT);
      const lit = await P.evaluate(`__hc.blockLight(${s.x},${gy+1},${s.z}).lit`);
      console.log(`  --- ${s.tag} (${s.x},${s.z}) gy${gy} baked ${lit}`);
      for(const [tag,js] of CONDS){
        await P.evaluate(js); await sleep(400); await pin(W, NIGHT);
        const f = await shots(W, `na-${s.tag}-${tag.replace(/\W+/g,'')}`, NIGHT, 3);
        const g = statMedian(f, CROP.ground), h = statMedian(f, HUD);
        console.log(`    ${tag.padEnd(15)} ground med ${String(g.med).padStart(6)} lum ${String(g.lum).padStart(6)} black ${String(g.blackPct).padStart(6)}%   ctrl hud ${h.lum}`);
      }
    }
  } finally { await W.close(); }
})();
