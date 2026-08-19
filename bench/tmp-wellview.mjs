// SCRATCH. Can you see the water from where a person stands at a well? Three vantages, correct aim (look() now aims
// from the eye), noon so the shaft is as lit as it ever gets.
import { openWorld, sleep, OUT, pin } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    await pin(W,0.25);
    const at=await W.page.evaluate(`(()=>{ const s=__hc.st(); const wx=s.sx+14, wz=s.sz+34;
      return {wx, wz, gy:__hc.groundY(wx,wz)}; })()`);
    console.log('well '+JSON.stringify(at));
    const shot=async(name, cx,cz,cy, tx,ty,tz)=>{
      await W.page.evaluate(`__hc.tpExact(${cx}, ${cz}, ${cy})`);
      await sleep(250);
      console.log(name+' '+JSON.stringify(await W.page.evaluate(`__hc.look(${tx},${ty},${tz})`)));
      await sleep(900);
      await W.page.screenshot({path:path.join(OUT,name+'.png')});
    };
    const {wx,wz,gy}=at;
    await shot('wellv_stand', wx+0.5, wz+3.5, gy+1,   wx+0.5, gy+0.6, wz+0.5);   // standing beside it, eyes over the rim
    await shot('wellv_lean',  wx+0.5, wz+2.5, gy+2.2, wx+0.5, gy+0.6, wz+0.5);   // leaning in
    await shot('wellv_wide',  wx+7.5, wz+7.5, gy+4,   wx+0.5, gy+2.0, wz+0.5);   // the whole structure
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
