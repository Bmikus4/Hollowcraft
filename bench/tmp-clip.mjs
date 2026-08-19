// SCRATCH. "Make it so that the wretch cant clip his body through blocks", and "likes to wave his arms through trees".
// Count how much of the rig is inside the world while it moves through a forest, sampled over a stalk.
import { openWorld, sleep, pin } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.78);
    console.log('summon '+JSON.stringify(await W.page.evaluate('__hc.summonNow()')));
    await sleep(800);
    let samples=0, buriedFrames=0, buriedTotal=0, worst=0, worstNames=null; const byName={};
    for(let i=0;i<140;i++){
      await W.page.evaluate('__hc.cam({yaw:(__hc.cam().yaw+Math.PI)})');   // never look at it: being watched makes it flee, then despawn
      const r=await W.page.evaluate('__hc.rigBuried()');
      if(r && !r.err){ samples++;
        if(r.buried>0){ buriedFrames++; buriedTotal+=r.buried; for(const k in r.by) byName[k]=(byName[k]|0)+r.by[k];
          if(r.buried>worst){ worst=r.buried; worstNames=r.by; } } }
      await sleep(130);
    }
    console.log('samples '+samples+'  frames with a buried part '+buriedFrames+' ('+(samples?(100*buriedFrames/samples).toFixed(1):0)+'%)');
    console.log('mean buried parts per sample '+(samples?(buriedTotal/samples).toFixed(2):0)+'   worst '+worst+' '+JSON.stringify(worstNames));
    console.log('by part '+JSON.stringify(byName));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
