// SCRATCH. Ben's four faults on the horizon pines: texture, orientation, scale, placement. Shot from the shore at
// standing eye height, which is his vantage.
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10, w:1280, h:640});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.22);
    console.log('pines '+JSON.stringify(await W.page.evaluate('__hc.pines()')));
    const S=await W.page.evaluate('__hc.shoreSpot()');
    console.log('shore '+JSON.stringify(S));
    if(!S||S.err) return;
    await W.page.evaluate(`__hc.tpExact(${S.x}, ${S.z}, ${S.y}+1)`);
    await sleep(320);
    await W.page.evaluate(`__hc.cam({yaw:${S.yaw}, pitch:0.02})`);
    for(let i=0;i<12;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
    await sleep(1500);
    await W.page.screenshot({path:path.join(OUT,'pines_shore.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
