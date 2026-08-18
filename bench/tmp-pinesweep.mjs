// TWELVE BEARINGS FROM THE SHORE, AS ONE SHEET. The mask says 108 of 384 azimuth cells carry a treeline, so the
// band is drawing; the problem has been finding one to photograph. Level pitch, eye height, 30 degrees apart.
import { spawnSync } from 'node:child_process';
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    const P=await ev('__hc.probe()');
    await ev(`__hc.tp(${P.spawnX-30}, ${P.spawnZ})`);   // out toward the beach, off the bank
    for(let i=0;i<15;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(1000);
    // uDbgAll DRAWS EVERY AZIMUTH CELL, gates and envelope aside, which is the only way to see how big the band
    // actually is: canopyDeg reports h/d, the MAXIMUM, while every real cell is scaled by the mask's own height
    // envelope (mean 0.28), so the shipped band is about a third of the number the dial prints.
    const files=[];
    for(let k=0;k<12;k++){ const yaw=k*Math.PI/6;
      await ev(`__hc.cam({yaw:${yaw.toFixed(4)}, pitch:0.06})`); await sleep(700);
      const f=path.join(OUT,'pinesweep-'+k+'.png'); await W.page.screenshot({path:f}); files.push(f); }
    const args=['-y','-loglevel','error'];
    for(const f of files) args.push('-i',f);
    args.push('-filter_complex','[0][1][2][3][4][5][6][7][8][9][10][11]xstack=inputs=12:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0|0_h0+h1|w0_h0+h1|w0+w1_h0+h1|0_h0+h1+h2|w0_h0+h1+h2|w0+w1_h0+h1+h2,scale=1200:-2');
    args.push(path.join(OUT,'pinesweep.png'));
    spawnSync('ffmpeg',args);
    console.log('sheet '+path.join(OUT,'pinesweep.png'));
  } finally { await W.close(); } })();
