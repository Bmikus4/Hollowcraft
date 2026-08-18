// ONE BEARING THAT CARRIES THE BAND, FULL FRAME, PLUS ITS HEIGHT IN DEGREES. canopyDeg is h/d -- the maximum a
// cell could reach -- and what matters is what a bearing actually draws.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    const P=await ev('__hc.probe()');
    await ev(`__hc.tp(${P.spawnX-30}, ${P.spawnZ})`);
    for(let i=0;i<15;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1000);
    console.log('pines '+JSON.stringify(await ev('__hc.pines()')));
    for(const yawDeg of [90,120,150]){
      await ev(`__hc.cam({yaw:${(yawDeg*Math.PI/180).toFixed(4)}, pitch:0.03})`); await sleep(800);
      await W.page.screenshot({path:path.join(OUT,'pineone-'+yawDeg+'.png')});
      console.log('  shot '+yawDeg); }
  } finally { await W.close(); } })();
