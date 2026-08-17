import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS); await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500); await pin(W,0.25); await sleep(600);
  console.log(await W.ev(`(function(){
    const p=__hc.pos(), x=Math.round(p.x), y=Math.round(p.y), z=Math.round(p.z);
    const out=[];
    // a stone floor to stand things on, then one of each
    for(let i=-2;i<=8;i++) for(let k=-2;k<=2;k++) __hc.cmdRun('/setblock '+(x+4+i)+' '+(y-1)+' '+(z+k)+' smooth_stone');
    __hc.cmdRun('/setblock '+(x+4)+' '+y+' '+z+' sunflower');
    __hc.cmdRun('/setblock '+(x+4)+' '+(y+1)+' '+z+' sunflower_top');
    __hc.cmdRun('/setblock '+(x+6)+' '+y+' '+z+' pale_bloom');
    __hc.cmdRun('/setblock '+(x+8)+' '+y+' '+z+' tree_flower');
    // a vine hanging from an overhang
    for(let i=0;i<3;i++) __hc.cmdRun('/setblock '+(x+10)+' '+(y+3)+' '+(z+i-1)+' smooth_stone');
    __hc.cmdRun('/setblock '+(x+10)+' '+(y+2)+' '+z+' vine');
    __hc.cmdRun('/setblock '+(x+10)+' '+(y+1)+' '+z+' vine');
    for(const n of ['sunflower','sunflower_top','pale_bloom','tree_flower','vine'])
      out.push(n+'='+__hc.blockAt(x+({sunflower:4,sunflower_top:4,pale_bloom:6,tree_flower:8,vine:10})[n], y+(n==='sunflower_top'?1:(n==='vine'?1:0)), z)+'/'+__hc.bid(n));
    H.cam({yaw:Math.atan2(-(x+6-p.x), -(z-p.z)), pitch:0.0});
    return out.join(' ');
  })()`));
  await sleep(1500); await shots(W,'foliage-new',0.25,1);
}finally{ await W.close(); }
