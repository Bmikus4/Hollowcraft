// HOW MANY FULL COLUMN WALKS THE GRASS PROMOTION PAYS FOR WHILE WATER IS MOVING. The promotion runs on every
// single (non-bulk) block write, and the water simulation writes one block per moved cell, so a running river
// pays a 128-deep column scan per cell per tick. Counted rather than assumed.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    const scans=async()=>(await ev('__hc.buriedGrass()')).scans;
    // IDLE: nothing moving.
    let a=await scans(); await sleep(5000); let b=await scans();
    console.log('  idle          '+(b-a)+' column walks in 5s');
    // A COLUMN OF WATER POURED ONTO DRY LAND, which is what a river bank or a broken dam does.
    const P=await ev('__hc.probe()');
    await ev(`(()=>{ const x=${Math.round(P.x)}+3, z=${Math.round(P.z)}+3, h=__hc.surfH(x,z);
      for(let i=0;i<12;i++) __hc.setBlk(x, h+3+i, z, 'water'); return true; })()`);
    a=await scans(); await sleep(6000); b=await scans();
    console.log('  water flowing '+(b-a)+' column walks in 6s');
  } finally { await W.close(); } })();
