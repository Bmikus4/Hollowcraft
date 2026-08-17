import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await W.page.evaluate(`__hc.hold('chassis_rifle')`); await sleep(800);
    console.log('stand   '+JSON.stringify(await W.page.evaluate('__hc.bipod()')).slice(0,190));
    await W.page.evaluate('__hc.proneSet(true)'); await sleep(1800);
    console.log('planted '+JSON.stringify(await W.page.evaluate('__hc.bipod()')).slice(0,190));
    console.log('pose    '+JSON.stringify(await W.page.evaluate('__hc.pose()')).slice(0,220));
    await W.page.evaluate('__hc.proneSet(false)'); await sleep(1500);
    console.log('up      '+JSON.stringify(await W.page.evaluate('__hc.bipod()')).slice(0,190));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
