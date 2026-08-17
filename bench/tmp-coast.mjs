// A3: the waterline one block inward, and the two faults that reverted the last attempt. ?nofringe=1 is not a thing,
// so the A/B is against the numbers the revert note itself quoted: 351 columns of a 17,161-column census moved when
// the rule was `h===SEA+1 → SEA` with no neighbour test. This build should move FEWER (only the ones touching water),
// leave every inland flat alone, and add no adjacent step of two blocks or more.
import { openWorld, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:800, h:450 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1200);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await pin(W,0.25); await sleep(400);
  for(const on of [false,true,false]){
    await W.ev(`__hc.coast(${on})`); await sleep(300);
    console.log(`fringe ${String(on).padEnd(5)}`, JSON.stringify(await W.ev(`__hc.coastCensus(65,1)`)));
  }
  await W.ev(`__hc.coast(true)`);
}finally{ await W.close(); }
