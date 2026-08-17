// A3: IS THERE MUD ON THE SEA FLOOR? mudCensus skips submerged columns, so it has never been able to answer. This asks
// the generator's own _inlandBed over every wet column in a 420-block radius and splits the claims by whether the cell
// is actually ringed by land — eleven of sixteen bearings at 24 blocks — which is what "a river or a lake" means and
// what the falloff envelope _isleAt only approximates.
import { openWorld, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:800, h:450 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1200);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await pin(W,0.25); await sleep(400);
  console.log(JSON.stringify(await W.ev(`__hc.mudBedCensus()`), null, 1));
}finally{ await W.close(); }
