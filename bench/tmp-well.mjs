// The well from the rim, which is Ben's frame 212918.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    console.log('wellCheck '+JSON.stringify(await ev('__hc.wellCheck()')).slice(0,200));
    console.log('wellWater '+JSON.stringify(await ev('__hc.wellWater()')).slice(0,300));
    const p=await ev('(()=>{ const P=__hc.probe(); return {sx:P.spawnX, sz:P.spawnZ}; })()');
    const wx=p.sx+14, wz=p.sz+34;
    const gy=await ev(`__hc.surfH(${wx},${wz})`);
    for(let i=0;i<20;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    await ev(`__hc.tpExact(${wx+4}, ${wz}, ${gy+3})`);
    await sleep(400);
    await ev(`__hc.look(${wx}, ${gy+1}, ${wz})`);
    await sleep(900);
    await W.page.screenshot({path:path.join(OUT,'well_rim.png')});
    console.log('shot well_rim.png');
  } finally { await W.close(); } })();
