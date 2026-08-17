// SCRATCH BOOT PROBE. The well: what is in the shaft, and what does it look like from the rim?
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    let d=await W.page.evaluate('__hc.wellDump()');
    if(!d.built){ console.log('forcing build'); console.log(JSON.stringify(await W.page.evaluate('__hc.wellCheck()')).slice(0,200));
      for(let i=0;i<20;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
      d=await W.page.evaluate('__hc.wellDump()'); }
    console.log('well '+JSON.stringify({at:d.at,ground:d.ground,built:d.built,hasWater:d.chunkHasWater,meshed:d.meshed}));
    for(const r of d.column) console.log('   dy'+String(r.dy).padStart(3)+'  '+r.name);
    console.log('water '+JSON.stringify(await W.page.evaluate('__hc.wellWater()')));
    await W.page.evaluate('__hc.lock(true)');
    // Stand at the rim on the +x side and look west and down into the shaft, which is the only way a player can
    // ever see into this thing: the plank lid at dy+4 covers all 25 cells, so there is no view from above.
    await W.page.evaluate(`__hc.tpExact(${d.at[0]+2.6}, ${d.at[1]}, ${d.ground+1})`);
    await W.page.evaluate('__hc.cam({yaw:1.5708, pitch:-0.62})'); await sleep(1200);
    await W.page.screenshot({path:path.join(OUT,'well-rim.png')});
    // GRAZING ANGLE. If the surface appears here and not from above, the cause is the shader's fresnel/depth terms and
    // not the geometry -- which is the difference between a tuning job and a missing mesh.
    await W.page.evaluate('__hc.cam({pitch:-0.10})'); await sleep(600);
    await W.page.screenshot({path:path.join(OUT,'well-graze.png')});
    // THE SAME CAMERA, TWICE: once normally and once with every water fragment forced magenta (uNanDbg mode 2,
    // already in the shader). Diffing the two says exactly which pixels the water is drawn on, if any.
    await W.page.evaluate('__hc.cam({pitch:-1.05})'); await sleep(900);
    await W.page.evaluate('__hc.waterNan(0)'); await sleep(300);
    console.log('rect '+JSON.stringify(await W.page.evaluate('__hc.wellRect()')));
    await W.page.screenshot({path:path.join(OUT,'wellA.png')});
    await W.page.evaluate('__hc.waterNan(2)'); await sleep(400);
    await W.page.screenshot({path:path.join(OUT,'wellB.png')});
    await W.page.evaluate('__hc.waterNan(0)');
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
