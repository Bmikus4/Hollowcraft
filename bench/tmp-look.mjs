import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS); await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000); await pin(W,0.25); await sleep(600);
  // a wall of the blocks that changed, right in front of the camera
  await W.ev(`(function(){ const p=__hc.pos(); const x0=Math.round(p.x)+4, y0=Math.round(p.y), z0=Math.round(p.z);
    const B=['cobble','stone','dirt','gravel','sand','bricks','planks','bookshelf','hay','ice','marble','copper_sheet'];
    for(let i=0;i<B.length;i++) for(let dy=0;dy<3;dy++)
      __hc.cmdRun('/setblock '+(x0)+' '+(y0+dy)+' '+(z0-6+i)+' '+B[i]);
    H.cam({yaw:Math.atan2(-(x0-p.x), -(z0-p.z-0)), pitch:0.02}); })()`);
  await sleep(1500); await shots(W,'tiles-wall',0.25,1);
  await W.ev(`(function(){ const p=__hc.pos(); H.cam({pitch:-0.5}); })()`); await sleep(800);
  await shots(W,'tiles-ground',0.25,1);
}finally{ await W.close(); }
