// SCRATCH BOOT PROBE. Grass: is the pack tile reaching the atlas, and what does the ground look like?
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    console.log('stamped '+JSON.stringify(await W.page.evaluate('__hc.stamped()')));
    await W.page.evaluate('__hc.lock(true)');
    await W.page.evaluate(`__hc.cam({pitch:-0.55})`); await sleep(700);
    await W.page.screenshot({path:path.join(OUT,'grass-ground.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
