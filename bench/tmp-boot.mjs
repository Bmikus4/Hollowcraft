// SCRATCH BOOT PROBE. Does the lay-flat rule fire at all during assert-drop-merge's exact sequence?
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(1500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    console.log('before '+JSON.stringify(await W.page.evaluate('__hc.layFlat()')));
    for(let k=0;k<8;k++) await W.page.evaluate(`__hc.dropAt('coal',4,${(k%3)*0.3-0.3},${((k/3)|0)*0.3-0.3},999)`);
    await sleep(3000);
    console.log('after  '+JSON.stringify(await W.page.evaluate('__hc.layFlat()')));
    console.log('here   '+JSON.stringify(await W.page.evaluate(`__hc.dropsHere('coal')`)));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
