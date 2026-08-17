// SCRATCH BOOT PROBE. The three layers the last run could not reach: sprint, swap and eat. Each needs a real state,
// so each is driven the way a player drives it and the ledger is read while it is happening.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const show=async(tag)=>{ const r=await W.page.evaluate('__hc.pose()');
      console.log(tag.padEnd(12)+'residual '+String(r.residual.mag).padEnd(8)+r.active.map(k=>k+' p'+JSON.stringify(r.layers[k].pos)+' r'+JSON.stringify(r.layers[k].rot)).join('   ')); };

    // SPRINT — needs the player out of flight and actually moving, or `st` never latches.
    await W.page.evaluate(`__hc.hold('ar15')`); await sleep(600);
    await W.page.evaluate('__hc.move({fwd:1,sprint:1})');
    await sleep(1600); await show('sprint');
    console.log('  state '+JSON.stringify(await W.page.evaluate('__hc.moveState()')));
    await W.page.evaluate('__hc.move({})'); await sleep(1200);

    // SWAP — the dip decays fast, so the ledger is read immediately after the change.
    await W.page.evaluate(`__hc.hold('revolver')`);
    await sleep(120); await show('swap +120ms');
    await sleep(260); await show('swap +380ms');
    await sleep(1200);

    // EAT — its own hook, sampled through the rise.
    console.log('  eat '+JSON.stringify(await W.page.evaluate('__hc.eatStart()')).slice(0,110));
    for(const ms of [200,300,400]){ await sleep(ms); await show('eat +'+ms); }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
