import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const show=async(t)=>{ const r=await W.page.evaluate('__hc.pose()');
      console.log(t.padEnd(14)+'res '+String(r.residual.mag).padEnd(9)+r.active.map(k=>k+' p'+JSON.stringify(r.layers[k].pos)+' r'+JSON.stringify(r.layers[k].rot)).join('  ')); };
    // SWAP — the dip decays in a few hundred ms, so it is sampled immediately after the change.
    await W.page.evaluate(`__hc.hold('ar15')`); await sleep(900);
    // GUN TO GUN. The dip lives in the gun pose branch, so swapping to a berry bowl leaves that branch entirely and
    // neither the layer nor the ledger's mark ever runs -- which is why the first attempt read a flat zero.
    await W.page.evaluate(`__hc.hold('smg')`);
    for(const ms of [50,50,80,150]){ await sleep(ms); await show('swap'); }
    await sleep(700); await W.page.evaluate(`__hc.hold('berry_bowl')`);
    await sleep(900);
    // EAT — apple is food.
    console.log('  eatStart '+JSON.stringify(await W.page.evaluate('__hc.eatStart()')).slice(0,120));
    for(const ms of [150,150,250,400]){ await sleep(ms); await show('eat'); }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
