// SCRATCH BOOT PROBE. What each melee weapon actually hits for and reaches.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(1500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    for(const id of ['hunting_knife','bayonet','wood_sword','iron_sword','iron_pickaxe','stone']){
      await W.page.evaluate(`__hc.hold(${JSON.stringify(id)})`); await sleep(450);
      console.log(id.padEnd(15)+JSON.stringify(await W.page.evaluate('__hc.meleeStats()')));
    }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
