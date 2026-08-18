// WHICH BEARINGS CARRY A TREELINE AT ALL, and a frame of the best one. look-horizon's sweep picks the bearing
// with the most dark-green rows, which in this world is the near forest, so it has been photographing trees that
// are not the band and reporting "none" for the band that is there.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    console.log('pines '+JSON.stringify(await ev('__hc.pines()')));
    console.log('mask  '+JSON.stringify(await ev('__hc.pinesMask&&__hc.pinesMask()')).slice(0,300));
    console.log('probe '+JSON.stringify(await ev('__hc.pinesProbe&&__hc.pinesProbe()')).slice(0,300));
  } finally { await W.close(); } })();
