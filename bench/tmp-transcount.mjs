// SCRATCH. How many DIRT tops still draw grass now the trail is excluded from the transition?
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const c=await W.page.evaluate('__hc.transCensus()');
    console.log('upFaces '+JSON.stringify(c.upFaces));
    console.log('surface '+JSON.stringify(c.surface));
    console.log('share   '+JSON.stringify(c.share));
  } finally { await W.close(); } })();
