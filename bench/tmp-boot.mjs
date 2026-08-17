// SCRATCH BOOT PROBE. The bipod on every screen it has to read on: first person, and a peer.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(1500);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)'); await sleep(300);
    await W.page.evaluate(`__hc.hold('chassis_rifle')`); await sleep(900);
    console.log('stand  '+JSON.stringify(await W.page.evaluate('__hc.bipod()')));
    await W.page.evaluate('__hc.proneSet(true)'); await sleep(150);
    console.log('drop   '+JSON.stringify(await W.page.evaluate('__hc.bipod()')));
    await sleep(1400);
    console.log('planted'+JSON.stringify(await W.page.evaluate('__hc.bipod()')));
    await W.page.evaluate('__hc.proneSet(false)'); await sleep(1400);
    // THE PEER. Same gun, folded then planted, driven through the packet field a real peer uses.
    await W.page.evaluate('__hc.fakePeer(0,3.4)'); await sleep(600);
    console.log('peer up  '+JSON.stringify(await W.page.evaluate(`__hc.peerPose(0,0,'chassis_rifle',false)`)));
    await sleep(400); await W.page.screenshot({path:path.join(OUT,'bipod-peer-up.png'),clip:{x:340,y:150,width:620,height:400}});
    console.log('peer down'+JSON.stringify(await W.page.evaluate(`__hc.peerPose(0,0,'chassis_rifle',true)`)));
    await sleep(400); await W.page.screenshot({path:path.join(OUT,'bipod-peer-down.png'),clip:{x:340,y:150,width:620,height:400}});
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
