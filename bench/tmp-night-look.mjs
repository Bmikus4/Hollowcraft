// WHAT DOES NIGHT ACTUALLY LOOK LIKE? Full frames, empty hands, midnight, baked light read at the crop first.
//   node bench/tmp-night-look.mjs
import { openWorld, pin, shots, statMedian, statFile, CROP, fmt, sleep, OUT } from './lib/rig.mjs';
const NIGHT=0.75;
const SITES = [
  { tag:'wood',   x:280, z:12,  pitch:-0.15 },
  { tag:'wood2',  x:290, z:4,   pitch:-0.15 },
  { tag:'meadow', x:120, z:120, pitch:-0.15 },
  { tag:'down',   x:280, z:12,  pitch:-1.45 },
];
(async()=>{
  const W = await openWorld({ rd:8, w:900, h:520 });
  const P = W.page;
  try{
    for(const s of SITES){
      const gy = await P.evaluate(`__hc.groundY(${s.x},${s.z})`);
      await P.evaluate(`__hc.tp(${s.x}, ${gy+1.7}, ${s.z}, 0, ${s.pitch})`);
      for(let i=0;i<30;i++){ const f=await P.evaluate(`__hc.fill&&1`); const st=await P.evaluate(`__hc.st()`); if(st) break; }
      await sleep(1200);
      await pin(W, NIGHT);
      const can = await P.evaluate(`__hc.canopyAt(${s.x},${s.z})`);
      const lit = await P.evaluate(`__hc.blockLight(${s.x},${gy+1},${s.z})`);
      const ahead = await P.evaluate(`__hc.blockLight(${s.x},${gy+1},${s.z-6})`);
      const f = await shots(W, `nl-${s.tag}`, NIGHT, 3);
      const c = statMedian(f, CROP.ground), fr = statMedian(f, CROP.frame);
      console.log(`  ${s.tag.padEnd(7)} gy${gy} leaves ${can.col?can.col.leavesAboveHtop:'?'} lit[${lit.lit}/${ahead.lit}]`);
      console.log(`          ground ${fmt(c)}`);
      console.log(`          frame  ${fmt(fr)}`);
    }
  } finally { await W.close(); }
})();
