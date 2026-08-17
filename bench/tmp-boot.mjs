// SCRATCH BOOT PROBE. One frame of the blade mid-cut. The swing decays every frame, so it is re-armed to 1.0 and the
// shot is taken with no wait -- the frame that renders is roughly a quarter through the arc, not the rest pose.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{
    await sleep(1500);
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    for(const id of ['iron_sword','iron_pickaxe']){
      await W.page.evaluate(`__hc.hold(${JSON.stringify(id)})`); await sleep(700);
      await W.page.screenshot({path:path.join(OUT,'slash-'+id+'-rest.png'),clip:{x:480,y:100,width:520,height:460}});
      await W.page.evaluate('__hc.swingAt(1)');
      await W.page.screenshot({path:path.join(OUT,'slash-'+id+'-cut.png'),clip:{x:480,y:100,width:520,height:460}});
      console.log(id+' after shot '+JSON.stringify(await W.page.evaluate('__hc.bladePose(0.35)')));
    }
    console.log('errors: '+ (W.errors.length? W.errors.slice(0,4).join(' | ') : 'none'));
  } finally { await W.close(); } })();
