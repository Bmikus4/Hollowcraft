// The base of the village buildings, which is where Ben photographed a dirt apron.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    await ev('__hc.tp(300,10)');
    for(let i=0;i<20;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    for(const [tag,yaw] of [['n',0],['e',1.57],['s',3.14],['w',4.71]]){
      await ev(`__hc.cam({yaw:${yaw}, pitch:-0.18})`); await sleep(700);
      await W.page.screenshot({path:path.join(OUT,'basegrass_'+tag+'.png')}); }
    console.log('grass '+JSON.stringify(await ev('__hc.buriedGrass()')).slice(0,120));
  } finally { await W.close(); } })();
