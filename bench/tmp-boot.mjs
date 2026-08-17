// SCRATCH BOOT PROBE. Five layers applied by the stack: do their values and the residual match record-only?
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const show=async(tag)=>{ const r=await W.page.evaluate('__hc.pose()');
      console.log(tag.padEnd(13)+'residual '+r.residual.mag+'   '+r.active.map(k=>k+' '+JSON.stringify(r.layers[k].pos)).join('  ')); };
    await W.page.evaluate(`__hc.hold('ar15')`); await sleep(800); await show('idle');
    await W.page.evaluate('__hc.aim(true)'); await sleep(900); await show('ads');
    await W.page.evaluate('__hc.aim(false)'); await sleep(500);
    await W.page.evaluate('__hc.attOpen(true)'); await sleep(1000); await show('attach');
    await W.page.evaluate('__hc.attOpen(false)'); await sleep(700);
    await W.page.evaluate(`__hc.hold('chassis_rifle')`); await sleep(600);
    await W.page.evaluate('__hc.proneSet(true)'); await sleep(1800); await show('bipod');
    console.log('  bipod hook '+JSON.stringify(await W.page.evaluate('__hc.bipod()')).slice(0,120));
    await W.page.evaluate('__hc.proneSet(false)'); await sleep(900);
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
