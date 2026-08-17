// SCRATCH BOOT PROBE. Whatever the current question is gets asked here rather than in a new file.
// Right now: the phantom second arm on tools -- which limbs are actually being drawn while a tool is held.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{
    await sleep(1500);
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    for(const id of ['iron_pickaxe','torch','stone','ar15']){
      await W.page.evaluate(`__hc.hold(${JSON.stringify(id)})`); await sleep(700);
      console.log(id.padEnd(13)+JSON.stringify(await W.page.evaluate('__hc.viewParts()')));
      await W.page.screenshot({path:path.join(OUT,'toolarm-'+id+'.png')});
    }
    console.log('errors: '+ (W.errors.length? W.errors.slice(0,4).join(' | ') : 'none'));
  } finally { await W.close(); } })();
