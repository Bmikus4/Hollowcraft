// SCRATCH BOOT PROBE. The fox girl is gone: nothing references her, the world boots, and the giantess still exists.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    console.log('boot ok');
    console.log('probe    '+JSON.stringify(await W.page.evaluate("typeof __hc.foxgirl+' '+typeof __hc.foxgirlPose+' '+typeof __hc.foxgirlHurt")));
    console.log('spawn    '+JSON.stringify(await W.page.evaluate("__hc.cmdRun('/spawn foxgirl 1 6')")));
    console.log('cmd      '+JSON.stringify(await W.page.evaluate("__hc.cmdRun('/foxgirl')")));
    console.log('giantess '+JSON.stringify(await W.page.evaluate("__hc.cmdRun('/spawn giantess 1 14')")));
    await sleep(1500);
    console.log('errors: '+(W.errors.length?W.errors.slice(0,4).join(' | '):'none'));
  } finally { await W.close(); } })();
