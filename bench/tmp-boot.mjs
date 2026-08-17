// SCRATCH BOOT PROBE. Solid grass blocks: cut a step into a hillside and look at the exposed faces.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2500);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await W.page.evaluate('__hc.cam({pitch:-0.30})'); await sleep(1200);
    await W.page.screenshot({path:path.join(OUT,'grasssolid.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
