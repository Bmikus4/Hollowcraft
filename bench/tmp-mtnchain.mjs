// THE VALUE CHAIN, STAGE BY STAGE. uDbg 4..7 write the band's colour after the gain, after snow, after the sun terms
// and after the haze; uDbg 3 gives the mask of the layer's own pixels. Everything is measured over that mask, so the
// numbers are the band's and nothing else's, and the stage where the value stops responding is the term that owns it.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
function overMask(M,P){ let n=0,s=0;
  for(let y=0;y<M.h;y++) for(let x=0;x<M.w;x++){ const i=(y*M.w+x)*M.ch, r=M.data[i], g=M.data[i+1], b=M.data[i+2];
    if(r>g+25 && b>g+25){ n++; s+=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2]; } }
  return { n, lum:+(s/Math.max(n,1)).toFixed(1) }; }
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  for(const gain of [1.1, 0.35]){
    await W.ev(`__hc.mtn(true,{band:0, gain:${gain}})`); await sleep(600);
    await W.ev(`__hc.mtnDbg(3)`); await sleep(400);
    const mask=px((await shots(W,`ch-mask-${gain}`,0.25,1))[0]);
    const out=[];
    for(const [tag,mode] of [['afterGain',4],['afterSnow',5],['afterSun',6],['afterHaze',7],['final',0]]){
      await W.ev(`__hc.mtnDbg(${mode})`); await sleep(350);
      const f=(await shots(W,`ch-${tag}-${gain}`,0.25,1))[0];
      out.push(`${tag} ${String(overMask(mask,px(f)).lum).padStart(6)}`);
    }
    console.log(`gain ${String(gain).padEnd(5)} maskPx ${overMask(mask,mask).n}   ${out.join('   ')}`);
  }
  await W.ev(`__hc.mtnDbg(0); __hc.mtn(true,{band:-1, gain:1.1})`);
}finally{ await W.close(); }
