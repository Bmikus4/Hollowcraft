import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(1500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    for(const id of ['raft_paddle','gas_can','wooden_torch','hunting_knife']){
      await W.page.evaluate(`__hc.hold(${JSON.stringify(id)})`); await sleep(800);
      await W.page.screenshot({path:path.join(OUT,'size-'+id+'.png')});
    }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
