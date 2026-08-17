// SCRATCH BOOT PROBE. The pack pickaxe's haft: does the tool come out as two materials, and does the frame change?
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{
    await sleep(1500);
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    for(const k of ['pickaxe','axe'])
      console.log(k.padEnd(8)+JSON.stringify(await W.page.evaluate(`__hc.toolMat(${JSON.stringify(k)},'iron')`)));
    await W.page.evaluate(`__hc.hold('iron_pickaxe')`); await sleep(800);
    await W.page.screenshot({path:path.join(OUT,'toolarm-iron_pickaxe.png')});
    console.log('errors: '+ (W.errors.length? W.errors.slice(0,4).join(' | ') : 'none'));
  } finally { await W.close(); } })();
