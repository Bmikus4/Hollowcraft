import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(1500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    console.log('tps '+JSON.stringify(await W.page.evaluate('__hc.tpsProbe(true)')));
    await sleep(1200);
    await W.page.screenshot({path:path.join(OUT,'tpslean-none.png')});
    await W.page.keyboard.down('KeyE'); await sleep(900);
    console.log('lean '+JSON.stringify(await W.page.evaluate('__hc.lean()')));
    await W.page.screenshot({path:path.join(OUT,'tpslean-right.png')});
    await W.page.keyboard.up('KeyE');
    await W.page.keyboard.down('KeyQ'); await sleep(900);
    await W.page.screenshot({path:path.join(OUT,'tpslean-left.png')});
    await W.page.keyboard.up('KeyQ');
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
