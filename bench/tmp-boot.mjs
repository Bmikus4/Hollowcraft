// SCRATCH BOOT PROBE. Does the crouch have knees: the eye must drop, the spring must overshoot and settle, and the
// collision box must follow rather than snap.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)'); await sleep(400);
    const line=r=>'sneak '+(r.sneak?1:0)+' fly '+(r.fly?1:0)+' key '+(r.keyDown?1:0)+'  t '+String(r.t).padStart(7)+'  v '+String(r.v).padStart(8)+'  eye '+String(r.eyeAboveFeet).padStart(7)+'  bodyH '+r.bodyH;
    console.log('stand  '+line(await W.page.evaluate('__hc.crouch(false)')));
    await W.page.screenshot({path:path.join(OUT,'crouch-stand.png')});
    await W.page.evaluate('__hc.crouch(true)');
    for(const ms of [60,60,60,80,100,150,300,600]){ await sleep(ms);
      console.log('  +'+String(ms).padStart(4)+'  '+line(await W.page.evaluate('__hc.crouch()'))); }
    await W.page.screenshot({path:path.join(OUT,'crouch-down.png')});
    console.log('release');
    await W.page.evaluate('__hc.crouch(false)');
    for(const ms of [60,80,120,300,600]){ await sleep(ms);
      console.log('  +'+String(ms).padStart(4)+'  '+line(await W.page.evaluate('__hc.crouch()'))); }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
