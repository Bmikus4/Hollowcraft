// THE TREELINE FROM THE SHORE AT EYE HEIGHT, ALL FOUR SIDES. Ben has rejected this feature six times and the
// last three replies were made off one bearing; he asked for four. Level pitch, standing on the sand.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    console.log('  pines '+JSON.stringify(await ev('__hc.pines()')));
    // ON THE SAND, NOT ON THE BANK: his vantage is the shore, and a bank three blocks up changes the elevation
    // the band is judged against.
    // ON THE BEACH, WEST OF SPAWN: the bank at spawn is three blocks up and the band is judged against the
    // waterline, not against a terrace.
    const P0=await ev('__hc.probe()');
    const spot={x:P0.spawnX-30, z:P0.spawnZ};
    await ev(`__hc.tp(${spot.x}, ${spot.z})`);
    for(let i=0;i<15;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    console.log('  shore '+JSON.stringify(spot));
    for(const [tag,yaw] of [['N',0],['E',Math.PI/2],['S',Math.PI],['W',3*Math.PI/2]]){
      await ev(`__hc.cam({yaw:${yaw.toFixed(4)}, pitch:0.03})`); await sleep(900);
      await W.page.screenshot({path:path.join(OUT,'pines4-'+tag+'.png')});
      console.log('  shot '+tag); }
  } finally { await W.close(); } })();
