// SCRATCH BOOT PROBE. The cabin roof, outside and from below, which is what Ben asked to see.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    console.log('roofFit '+JSON.stringify(await W.page.evaluate('__hc.roofFit()')));
    // The cabin sits at spawn+(22,-14) — inCabin()'s own centre.
    const c=await W.page.evaluate('__hc.cabinAt()'); const at=[c.x,c.z,c.ground];
    console.log('cabin at '+JSON.stringify(at));
    await W.page.evaluate(`__hc.tp(${at[0]-14}, ${at[2]+13}, ${at[1]+14}, -2.36, -0.40)`);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    await W.page.screenshot({path:path.join(OUT,'cabinroof-out.png')});
    await W.page.evaluate(`__hc.tp(${at[0]}, ${at[2]+2.0}, ${at[1]}, 0.4, 1.05)`); await sleep(1200);
    await W.page.screenshot({path:path.join(OUT,'cabinroof-under.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
