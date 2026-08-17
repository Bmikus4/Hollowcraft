// SCRATCH BOOT PROBE. The peer avatar's tunic: does the hem overhang the trousers, and does a gap open when it walks?
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{
    await sleep(1500);
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    // PUMP THE MESHER FIRST. A screenshot taken before the terrain meshes is a black frame that looks exactly like a
    // rendering bug, and this harness has produced one already.
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    console.log('peer '+JSON.stringify(await W.page.evaluate('__hc.fakePeer(0,4.5)')));
    await sleep(900);
    await W.page.screenshot({path:path.join(OUT,'peer-tunic.png')});
    // Swing the legs to their extreme -- the seam only opens when the hip rotates.
    console.log('legs '+JSON.stringify(await W.page.evaluate('__hc.peerPose(0.85,0.5)')));
    await sleep(300);
    await W.page.screenshot({path:path.join(OUT,'peer-tunic-stride.png')});
    console.log('errors: '+ (W.errors.length? W.errors.slice(0,4).join(' | ') : 'none'));
  } finally { await W.close(); } })();
