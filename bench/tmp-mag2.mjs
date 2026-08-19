import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6}); const p=W.page;
  try{ await sleep(2500);
    for(const g of ['forest_rifle','hunting_rifle','marksman_rifle','chassis_rifle'])
      console.log(g.padEnd(16), JSON.stringify(await p.evaluate(`__hc.reloadParts(${JSON.stringify(g)})`)));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
