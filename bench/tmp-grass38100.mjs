import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    const a=await W.page.evaluate('__hc.buriedGrass()');
    console.log('t0  stillBuried '+a.stillBuried+'  chunks '+await W.page.evaluate('world.size').catch(()=>'?'));
    await sleep(12000);
    const b=await W.page.evaluate('__hc.buriedGrass()');
    console.log('t+12s  stillBuried '+b.stillBuried+'  demoted '+b.demoted);
    for(const s of (b.samples||[]).slice(0,4)) console.log(`  (${s.x},${s.y},${s.z}) htop=${s.htop}  ${s.col}`);
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
