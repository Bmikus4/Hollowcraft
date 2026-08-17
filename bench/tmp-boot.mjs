// SCRATCH BOOT PROBE. Whatever the current question is gets asked here rather than in a new file.
// Right now: do surface decals die with their block? __hc.decalTrip places a block, seats a hole on it, runs the
// sweep with the block STILL THERE (a sweep that eats every decal would otherwise look like a pass), then removes
// the block and runs it again.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{
    await sleep(1500);
    console.log('decals '+JSON.stringify(await W.page.evaluate('__hc.decalTrip()')));
    console.log('errors: '+ (W.errors.length? W.errors.slice(0,4).join(' | ') : 'none'));
  } finally { await W.close(); } })();
