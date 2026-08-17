// SCRATCH BOOT PROBE. Mud on the bank: dry mud must be zero, and the bed must still be mud.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2500);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    console.log('drymud '+JSON.stringify(await W.page.evaluate('__hc.dryMud(70)')));
    console.log('bed    '+JSON.stringify(await W.page.evaluate('__hc.bedCensus(60,2)')).slice(0,300));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
