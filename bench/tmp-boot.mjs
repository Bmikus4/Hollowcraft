import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const r=await W.page.evaluate('__hc.gunBoxes()');
    console.log('guns '+r.guns+'  distinct boxes '+r.distinctBoxes);
    for(const b of (r.boxes||[]).slice(0,14)) console.log('   '+String(b.id).padEnd(22)+JSON.stringify(b.half||b.err));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
