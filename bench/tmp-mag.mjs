import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6}); const p=W.page;
  try{ await sleep(2500);
    await p.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    const a=await p.evaluate('__hc.magAudit()');
    console.log('withMag '+a.withMag);
    for(const o of a.list) if(o.mag) console.log('  '+o.id.padEnd(18)+' d/r '+o.dropOverRun);
    console.log('--- reload, per gun ---');
    for(const g of ['ar15','ak','smg','pistol_heavy','pistol_compact','pistol_target','bullpup','chassis_rifle','shotgun','revolver','hunting_rifle']){
      await p.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1"); __hc.hold(${JSON.stringify(g)})`); await sleep(220);
      const r=await p.evaluate('__hc.reload()');
      console.log('  '+g.padEnd(16)+' '+JSON.stringify(r));
    }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
