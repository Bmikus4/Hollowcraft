// SCRATCH BOOT PROBE. The grass leaf variants: does the pack tile reach the ground between the leaves?
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    const st=await W.page.evaluate('__hc.stamped()');
    console.log('stamped want '+st.want+' got '+st.got+' missing '+JSON.stringify(st.missing)+' into '+JSON.stringify(st.into));
    await W.page.evaluate('__hc.lock(true)');
    await W.page.evaluate(`__hc.cam({pitch:-0.62})`); await sleep(900);
    await W.page.screenshot({path:path.join(OUT,'grassleaf.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
