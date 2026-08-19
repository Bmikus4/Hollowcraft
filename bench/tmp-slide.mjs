// SCRATCH. "Likes to ... walk away sliding." Two numbers, both from the animation frame itself:
//   FROZEN SLIDE — blocks covered while the gait frequency is zero (the stalk freeze-gate and the hitch stop the legs
//                  and nothing stops the body).
//   FOOT SKATE   — how far the CONTACT foot travels in world space per frame, as a fraction of how far the body
//                  travels. A planted foot scores 0; a foot carried along by the body scores 1, which is a slide
//                  whatever the legs are doing.
// The player faces AWAY the whole time: being looked at makes it flee and then despawn, and a despawned creature walks
// nowhere. Night, because it is DORMANT by day.
import { openWorld, sleep, pin } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.78);
    console.log('summon '+JSON.stringify(await W.page.evaluate('__hc.summonNow()')));
    await sleep(800);
    await W.page.evaluate("__hc.rigTrace('wretch')");
    const states={};
    for(let i=0;i<50;i++){
      const s=await W.page.evaluate(`(()=>{ const s=__hc.st();
        // face directly away from it so it never counts as watched
        if(typeof s.wx==='number'){} __hc.cam({yaw:(__hc.cam().yaw+Math.PI)}); return s; })()`);
      states[s.ws]=(states[s.ws]|0)+1;
      await sleep(400);
    }
    const t=await W.page.evaluate('__hc.rigTrace()');
    console.log('states '+JSON.stringify(states));
    if(!t||!t.rows||!t.rows.length){ console.log('no rows'); return; }
    let cycling=0, slid=0, frozen=0, frames=0, maxRun=0, run=0;
    let skateNum=0, skateDen=0, movingFrames=0;
    for(let i=1;i<t.rows.length;i++){
      const a=t.rows[i-1], b=t.rows[i];
      const d=Math.hypot(b[4]-a[4], b[5]-a[5]), gf=b[6];
      if(d>0.6) continue;                                  // a blink or a yank is not locomotion
      frames++;
      if(gf<=0.001){ frozen++; slid+=d; run+=d; if(run>maxRun) maxRun=run; } else { cycling+=d; run=0; }
      // the contact foot is the lower of the two, this frame and last
      const la=a[8]<a[11]?0:1, lb=b[8]<b[11]?0:1;
      if(la===lb && d>0.004){
        const o=lb===0?8:11;
        skateNum += Math.hypot(b[o+1]-a[o+1], b[o+2]-a[o+2]);
        skateDen += d; movingFrames++;
      }
    }
    const tot=cycling+slid;
    console.log('frames '+frames+'  span '+t.span+'s  legsFrozen '+frozen+' ('+(100*frozen/frames).toFixed(1)+'%)');
    console.log('travel '+tot.toFixed(2)+' blocks:  cycling '+cycling.toFixed(2)+'   SLID '+slid.toFixed(2)+
      ' ('+(tot>0?(100*slid/tot).toFixed(1):0)+'%)   longest single slide '+maxRun.toFixed(2));
    console.log('foot skate '+(skateDen>0?(skateNum/skateDen).toFixed(3):'n/a')+
      '  (0 = planted, 1 = carried along)  over '+movingFrames+' moving frames');
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
