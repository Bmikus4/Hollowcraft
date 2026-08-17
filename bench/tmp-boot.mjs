import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2500);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const sh=await W.page.evaluate('__hc.shoreSpot()');
    console.log('shore '+JSON.stringify(sh));
    if(sh&&!sh.err){ await W.page.evaluate(`__hc.tpExact(${sh.x}, ${sh.z}, ${sh.y})`);
      await W.page.evaluate(`__hc.cam({yaw:${sh.yaw}, pitch:-0.45})`); }
    for(let i=0;i<30;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    console.log('on  '+JSON.stringify(await W.page.evaluate('__hc.transitions(true)')));
    for(let i=0;i<30;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    await W.page.screenshot({path:path.join(OUT,'trans-on.png')});
    // Inland from the same spot: sand meeting grass, which is the other pair Ben named.
    await W.page.evaluate('__hc.cam({yaw:'+(sh.yaw+Math.PI)+', pitch:-0.5})'); await sleep(900);
    await W.page.screenshot({path:path.join(OUT,'trans-grass-on.png')});
    console.log('off '+JSON.stringify(await W.page.evaluate('__hc.transitions(false)')));
    for(let i=0;i<30;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    await W.page.screenshot({path:path.join(OUT,'trans-grass-off.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,4).join(' | '):'none'));
  } finally { await W.close(); } })();
