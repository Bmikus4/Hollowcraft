// SCRATCH BOOT PROBE. Is chunk water visible ANYWHERE? Stand at the shore and hide every chunk water mesh.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    // Walk to the waterline: step out from spawn toward the sea until the block under the crosshair is water.
    const shore=await W.page.evaluate('__hc.shoreSpot()');
    console.log('shore '+JSON.stringify(shore));
    if(shore){ await W.page.evaluate(`__hc.tpExact(${shore.x}, ${shore.z}, ${shore.y})`);
      await W.page.evaluate(`__hc.cam({yaw:${shore.yaw}, pitch:-0.28})`); }
    for(let i=0;i<30;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    // THE CONTROL THE WHOLE FRAGMENT-STAGE ARGUMENT RESTS ON: does uNanDbg mode 2 actually paint CHUNK water magenta?
    // If the shore goes magenta and the well does not, the difference is positional. If the shore does not either, the
    // instrument never worked and every conclusion drawn from it has to go.
    await W.page.evaluate('__hc.waterNan(0)'); await sleep(500);
    await W.page.screenshot({path:path.join(OUT,'shoreA.png')});
    await W.page.evaluate('__hc.waterNan(2)'); await sleep(500);
    await W.page.screenshot({path:path.join(OUT,'shoreB.png')});
    await W.page.evaluate('__hc.waterNan(0)');
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
