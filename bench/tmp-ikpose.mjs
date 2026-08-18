// WHAT THE FOOT IK ACTUALLY LOOKS LIKE. The offset sits at its cap on three frames in four of a stalk, which on
// paper is a creature folded to its knees the whole time. A burial count cannot see a pose; this photographs it.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.0)');
    await ev('__hc.wretchArm(true,true)');
    await ev('__hc.wretchAt(9)');
    await sleep(1500);
    for(const on of [true,false]){
      await ev('__hc.footIK('+on+')');
      for(let i=0;i<20;i++){ await ev('__hc.setTime(0.0)'); await ev('__hc.wretchCommit()'); await sleep(70); }
      // face it
      await ev(`(()=>{ const w=__hc.wpos(); if(w) __hc.look(w[0], w[1]+1.0, w[2]); return w; })()`);
      await sleep(500);
      console.log('  ik '+(on?'on ':'off')+' '+JSON.stringify(await ev('__hc.footIK()'))
        +'  span '+JSON.stringify(await ev('__hc.rigSpan()')).slice(0,120));
      await W.page.screenshot({path:path.join(OUT,'ikpose_'+(on?'on':'off')+'.png')}); }
    await ev('__hc.footIK(true)');
  } finally { await W.close(); } })();
