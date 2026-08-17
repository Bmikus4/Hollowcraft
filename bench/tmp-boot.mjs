// SCRATCH BOOT PROBE. The pose ledger records without applying: do the declared layers account for everything that
// moves the held item after the base pose? residual.mag is the answer — 0 means nothing moves it undeclared.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const show=async(tag)=>{ const r=await W.page.evaluate('__hc.pose()');
      console.log(tag.padEnd(16)+'marked '+(r.marked?1:0)+'  active '+JSON.stringify(r.active)+'  residual '+r.residual.mag);
      if(r.residual.mag>0.0005) console.log('      res pos '+JSON.stringify(r.residual.pos)+' rot '+JSON.stringify(r.residual.rot));
      for(const k of r.active) console.log('      '+k.padEnd(7)+' pos '+JSON.stringify(r.layers[k].pos)+' rot '+JSON.stringify(r.layers[k].rot)); };
    await W.page.evaluate(`__hc.hold('ar15')`); await sleep(800); await show('ar15 idle');
    await W.page.evaluate('__hc.aim(true)'); await sleep(900); await show('ar15 ads');
    await W.page.evaluate('__hc.aim(false)'); await sleep(600);
    await W.page.evaluate('__hc.attOpen(true)'); await sleep(1000); await show('attach open');
    await W.page.evaluate('__hc.attOpen(false)'); await sleep(700);
    await W.page.evaluate(`__hc.hold('chassis_rifle')`); await sleep(700);
    await W.page.evaluate('__hc.proneSet(true)'); await sleep(1800); await show('prone bipod');
    await W.page.evaluate('__hc.proneSet(false)'); await sleep(900);
    await W.page.evaluate(`__hc.hold('iron_pickaxe')`); await sleep(700); await show('pickaxe');
    console.log('known '+JSON.stringify((await W.page.evaluate('__hc.pose()')).known));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
