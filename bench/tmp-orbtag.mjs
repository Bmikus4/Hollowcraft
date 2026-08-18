// ALL THREE WORLD-SIDE EMITTERS TAGGED MAGENTA AT ONCE, and one frame per bearing. Leaves, fireflies and lamp
// halos all paint magenta; anything still warm in the frame belongs to none of them, which is the identification
// four counting passes could not produce.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    for(const t of [0.30, 0.86]){
      await ev(`__hc.setTime(${t})`); await sleep(900);
      await ev('__hc.emitTag(1)'); await ev('__hc.leafTag(1)'); await sleep(900);
      console.log('  t='+t+'  '+JSON.stringify(await ev('__hc.emitTag()'))+' '+JSON.stringify(await ev('__hc.leafTag()'))
        +'  ff '+JSON.stringify(await ev('__hc.fireflies()')).slice(0,60)+'  lamp '+JSON.stringify(await ev('__hc.lampPts()')).slice(0,60));
      const files=[];
      for(let k=0;k<4;k++){ await ev(`__hc.cam({yaw:${(k*Math.PI/2).toFixed(4)}, pitch:0.05})`); await sleep(500);
        const f=path.join(OUT,'orbtag-'+t+'-'+k+'.png'); await W.page.screenshot({path:f}); files.push(f); }
      const args=['-y','-loglevel','error'];
      for(const f of files) args.push('-i',f);
      args.push('-filter_complex','[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack,scale=1200:-2', path.join(OUT,'orbtag-'+t+'.png'));
      spawnSync('ffmpeg',args); }
    console.log('sheets in '+OUT);
  } finally { await W.close(); } })();
