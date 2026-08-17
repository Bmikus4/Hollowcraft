import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(1500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    await W.page.evaluate(`__hc.hold('iron_sword')`); await sleep(800);
    await W.page.screenshot({path:path.join(OUT,'stab-rest.png'),clip:{x:480,y:100,width:520,height:460}});
    await W.page.evaluate('__hc.bladePose(0.34,1)');
    await W.page.screenshot({path:path.join(OUT,'stab-out.png'),clip:{x:480,y:100,width:520,height:460}});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
