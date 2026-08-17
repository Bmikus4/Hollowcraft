import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    const r=await W.page.evaluate('__hc.buriedGrass()');
    console.log('demoted '+r.demoted+'  stillBuried '+r.stillBuried+'  of '+r.grassBlocks+' grass blocks');
    const e=Object.entries(r.coveredBy||{}).sort((a,b)=>b[1]-a[1]);
    for(const [k,v] of e.slice(0,12)) console.log('   '+String(v).padStart(5)+'  under '+k);
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
