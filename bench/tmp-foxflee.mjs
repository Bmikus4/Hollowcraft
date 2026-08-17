// A2: DOES SHE STILL RUN FROM BEN? The animal update takes a `continue` for foxgirl before the flee branch, so the
// code says she cannot — and Ben has reported it twice, which outranks reading the code. So chase her: record where
// she is, spend thirty seconds closing on her, record where she is again. A body that has not moved cannot have fled.
// The chase is a teleport onto her every half second rather than a walk, because a walk that gets stuck on a tree
// proves nothing about her and the point is to keep the player inside her flee radius continuously.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await pin(W,0.25); await sleep(800);
  console.log('spawn:', JSON.stringify(await W.ev(`__hc.cmdRun('/spawn foxgirl 1 8')`)));
  await sleep(2500);
  const a0=await W.ev(`__hc.foxgirl()`);
  console.log('at rest:', JSON.stringify(a0));
  if(a0.err) throw new Error('no fox girl: '+a0.err);
  const t0=Date.now();
  let closest=999, chased=0;
  while(Date.now()-t0 < 30000){
    const r=await W.ev(`(function(){ const f=__hc.foxgirl(); if(!f||!f.at) return null;
      const yaw=Math.atan2(f.at[0]-__hc.pos().x, f.at[2]-__hc.pos().z);
      __hc.tpAt(f.at[0]+2.5, f.at[1]+1, f.at[2]+2.5); H.cam({yaw:yaw, pitch:-0.1});
      const p=__hc.pos(); return { at:f.at, d:+Math.hypot(f.at[0]-p.x, f.at[2]-p.z).toFixed(2) }; })()`);
    if(r){ chased++; if(r.d<closest) closest=r.d; }
    await sleep(500);
  }
  const a1=await W.ev(`__hc.foxgirl()`);
  const moved=Math.hypot(a1.at[0]-a0.at[0], a1.at[2]-a0.at[2]);
  console.log(`after 30s of chase (${chased} closes, nearest ${closest} blocks): at ${JSON.stringify(a1.at)}  moved ${moved.toFixed(3)} blocks`);
  console.log('height/meshes:', JSON.stringify({height:a1.height, meshes:a1.meshes, hp:a1.hp, alive:a1.alive}));
  console.log('human():', JSON.stringify(await W.ev(`__hc.human()`)));
  // and a frame from 7.2 blocks for the eye check the backlog asks for
  await W.ev(`(function(){ const f=__hc.foxgirl(); __hc.tpAt(f.at[0]+7.2, f.at[1]+2.5, f.at[2]);
    H.cam({yaw:Math.atan2(f.at[0]-(f.at[0]+7.2), f.at[2]-f.at[2]), pitch:0.05}); })()`);
  await sleep(900); await shots(W,'fox-7blocks',0.25,1);
}finally{ await W.close(); }
