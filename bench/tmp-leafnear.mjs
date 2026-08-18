// DOES THE CANOPY STILL SHED? The fade is only correct if a leaf overhead is untouched, so this stands under a tree
// and photographs it at noon and at night, with a control frame that has the batch hidden -- without the control a
// frame of leafless air and a frame of leaves look the same to a reader who cannot see the difference.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    // under a real crown: step out until __hc.leaves reports one overhead
    // AT SPAWN, which has a mature tree beside it. The search for a column with canopy directly overhead put the
    // eye INSIDE a crown and photographed the inside of a leaf, which is not what "does the canopy shed" means.
    const P=await ev('__hc.probe()');
    await ev(`__hc.tp(${P.spawnX+4}, ${P.spawnZ+4})`);
    console.log('  at spawn '+JSON.stringify(await ev('__hc.leaves()')).slice(0,80));
    for(let i=0;i<12;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    for(const [tag,t] of [['noon',0.30],['night',0.86]]){
      await ev(`__hc.setTime(${t})`); await ev('__hc.cam({pitch:0.35})'); await sleep(1200);
      await ev('__hc.leaves(true)'); await sleep(600);
      await W.page.screenshot({path:path.join(OUT,'leafnear-'+tag+'.png')});
      await ev('__hc.leaves(false)'); await sleep(600);
      await W.page.screenshot({path:path.join(OUT,'leafnear-'+tag+'-control.png')});
      await ev('__hc.leaves(true)');
      console.log('  shot '+tag+' + control  '+JSON.stringify(await ev('__hc.leafFar()'))); }
  } finally { await W.close(); } })();
