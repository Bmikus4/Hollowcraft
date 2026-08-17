// WHERE DOES THE SHELL ACTUALLY LAND? uDbg 3 paints every mountain fragment flat magenta, so the frame answers the
// occlusion question directly: any leaf, sand or water pixel that comes back magenta is a pixel the shell drew over.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  // post OFF: bloom smears magenta onto neighbours and would fake the very leak being looked for
  await W.ev(`__hc.pass('bloom',false); __hc.pass('grade',false); __hc.mtnDbg(3)`); await sleep(800);
  const f=(await shots(W,'ext-magenta',0.25,1))[0];
  const P=decodePNG(fs.readFileSync(f)); let n=0, rows={};
  for(let y=0;y<P.h;y++) for(let x=0;x<P.w;x++){ const i=(y*P.w+x)*P.ch;
    if(P.data[i]>120 && P.data[i+2]>120 && P.data[i+1]<80){ n++; rows[y]=(rows[y]||0)+1; } }
  const ys=Object.keys(rows).map(Number).sort((a,b)=>a-b);
  console.log(`magenta px ${n} (${(100*n/(P.w*P.h)).toFixed(2)}% of frame)  rows ${ys[0]}..${ys[ys.length-1]}  horizon is ~row 390`);
  await W.ev(`__hc.mtnDbg(0); __hc.pass('bloom',true); __hc.pass('grade',true)`);
}finally{ await W.close(); }
