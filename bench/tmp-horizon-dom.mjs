// WHAT SETS THE HORIZON LAYERS' VALUE? Their own dials barely move them, so each post pass is switched off in turn
// and the SAME two crops re-measured. Whichever pass moves them is the one that owns them.
import { openWorld, shots, statFile, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const MTN =[0.02,0.98,0.333,0.400];   // mountain band, from the row profile at this vantage
const PINE=[0.02,0.34,0.466,0.535];   // treeline band
const SKY =[0.40,0.90,0.05,0.12];     // control: open sky, nothing of mine in it
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x,p.y+38,p.z); H.cam({pitch:-0.16}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120); __hc.setTime(0.15)`);
  await sleep(1200); await W.ev(`__hc.setTime(0.15)`); await sleep(1500);
  console.log('passes:', JSON.stringify(await W.ev(`__hc.pass('bloom')`)));
  const shot = async (tag)=>{ const f=await shots(W,tag,null,1);
    const m=statFile(f[0],MTN), p=statFile(f[0],PINE), s=statFile(f[0],SKY);
    return `mtn ${String(m.lum).padStart(6)} (sat ${String(m.sat).padStart(5)})   pine ${String(p.lum).padStart(6)} (sat ${String(p.sat).padStart(5)})   sky ${String(s.lum).padStart(6)}`; };
  console.log('all on          ', await shot('hd-all'));
  for(const nm of ['bloom','grade','ssao','godray']){
    await W.ev(`__hc.pass('${nm}', false)`); await sleep(700);
    console.log(`${(nm+' OFF').padEnd(16)}`, await shot('hd-'+nm));
    await W.ev(`__hc.pass('${nm}', true)`); await sleep(500);
  }
  await W.ev(`__hc.pass('bloom',false); __hc.pass('grade',false)`); await sleep(700);
  console.log('bloom+grade OFF ', await shot('hd-both'));
}finally{ await W.close(); }
