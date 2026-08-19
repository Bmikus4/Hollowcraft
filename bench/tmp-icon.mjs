import { openWorld, sleep } from './lib/rig.mjs';
import fs from 'node:fs';
(async()=>{ const W=await openWorld({rd:6}); const p=W.page;
  try{ await sleep(2500);
    for(const id of ['table','planks','log']){
      const u=await p.evaluate(`__hc.iconURLFor(${JSON.stringify(id)})`);
      const r=await p.evaluate(`__hc.iconRoute(${JSON.stringify(id)})`);
      console.log(id, 'threeD='+JSON.stringify(r), 'len='+(u?u.length:null));
      if(u&&u.startsWith('data:image/png;base64,')) fs.writeFileSync('bench/results/icon-'+id+'.png', Buffer.from(u.split(',')[1],'base64'));
    }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,2).join(' | '):'none'));
  } finally { await W.close(); } })();
