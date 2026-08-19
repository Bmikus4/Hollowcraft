// SCRATCH. Autumn leaves: what share turned, are any of them lonely, and what does a wood look like from a distance.
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.25);
    // THE COST OF SPLITTING A MERGED QUAD: the greedy mesher keys on the tile, so every autumn boundary stops a merge.
    const draw=async()=>{ await sleep(600); return W.page.evaluate('__hc.drawInfo()'); };
    const remesh=async(on)=>{ await W.page.evaluate('__hc.autumn('+on+')');
      for(let i=0;i<25;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); } await sleep(1200); };
    await remesh(false); const off=await W.page.evaluate('__hc.autumnCensus()'); const offD=await draw();
    await remesh(true);  const on =await W.page.evaluate('__hc.autumnCensus()'); const onD=await draw();
    console.log('share '+on.share+'  autumn '+on.autumn+' of '+on.leaves+'  lone '+on.lone+' ('+(100*on.lone/Math.max(on.autumn,1)).toFixed(2)+'% of the orange)');
    console.log('draw  OFF '+JSON.stringify(offD)+'   ON '+JSON.stringify(onD));
    // A WOOD FROM A DISTANCE, which is how Ben said to judge it: up high, looking across the canopy.
    const at=await W.page.evaluate(`(()=>{ const s=__hc.st(), px=Math.round(s.px), pz=Math.round(s.pz);
      __hc.tpExact(px, pz, __hc.surfH(px,pz)+34); return {px,pz,h:__hc.surfH(px,pz)}; })()`);
    await sleep(300);
    await W.page.evaluate('__hc.look('+at.px+', '+(at.h+8)+', '+(at.pz+70)+')');
    for(let i=0;i<20;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(300); }
    await sleep(1600);
    await W.page.screenshot({path:path.join(OUT,'autumn_wood.png')});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
