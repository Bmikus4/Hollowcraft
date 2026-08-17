// SCRATCH BOOT PROBE. Does a peer's lean reach the screen -- the wire field, the ease, and the body.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(1500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    await W.page.evaluate('__hc.fakePeer(0,4.2)'); await sleep(700);
    for(const v of [0,1,-1]){
      console.log('ln '+String(v).padStart(2)+'  '+JSON.stringify(await W.page.evaluate(`__hc.peerPose(0,0,null,false,${v})`)));
      await sleep(500);
      await W.page.screenshot({path:path.join(OUT,'peerlean-'+(v>0?'right':v<0?'left':'none')+'.png'),clip:{x:330,y:120,width:640,height:420}});
    }
    // And that the field is on the WIRE, read off what the send path actually recorded.
    await W.page.evaluate('__hc.leanSet(0.8)'); await sleep(500);
    console.log('wire   '+JSON.stringify(await W.page.evaluate('__hc.netSelf()')));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
