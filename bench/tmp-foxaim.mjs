// A2: DOES A CHEST SHOT REGISTER WHERE IT IS AIMED? The bullet tests animals against a vertical CAPSULE whose radius
// is max(0.95, h*0.18) — 1.49 blocks for a 7.2-block body — and whose height is h*1.15. Those two numbers are the
// whole answer, so aim at four places and see which ones the capsule accepts: chest, head, feet, and 2.5 blocks wide
// of her. A capsule too fat registers hits on air beside her; too short and a head shot passes over her.
// A FRESH BODY PER AIM POINT. The bolt rifle does 40 and she has 10, so the first hit kills her and every later shot
// is fired at a ragdoll — which reads as "no hit" and would have scored three of the four targets as misses.
import { openWorld, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1000, h:560 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await pin(W,0.25); await sleep(600);
  console.log(JSON.stringify(await W.ev(`__hc.cmdRun('/give @me hunting_rifle 1')`)));
  console.log('capsule: radius max(0.95, h*0.18) =', (7.2*0.18).toFixed(2), ' height h*1.15 =', (7.2*1.15).toFixed(2));
  // stand off 8 blocks on +x, at chest height, and aim by pitch at each target point in turn
  const R=8;
  // THE OFFSET GOES ON THE TARGET, NOT THE SHOOTER. Moving the camera sideways and still aiming at her centre is a
  // shot AT her from a new angle, which of course hits; it says nothing about how wide the capsule accepts.
  // EYE HEIGHT MATCHES THE TARGET so the ray is level: a steep downward shot at her shins ends in the ground short of
  // her, and terrain occlusion reads exactly like a capsule that is too short.
  for(const [name, dy, side] of [['1.0 wide a', 4.2, 1.0], ['1.0 wide b', 4.2, 1.0], ['1.0 wide c', 4.2, 1.0],
                                 ['1.8 wide a', 4.2, 1.8], ['1.8 wide b', 4.2, 1.8], ['1.8 wide c', 4.2, 1.8],
                                 ['2.5 wide a', 4.2, 2.5], ['shin level', 0.6, 0]]){
    await W.ev(`__hc.cmdRun('/kill mobs')`); await sleep(600);
    await W.ev(`__hc.cmdRun('/spawn foxgirl 1 10')`); await sleep(2200);
    const f0=await W.ev(`__hc.foxgirl()`);
    if(!f0 || !f0.at){ console.log(name.padEnd(12), 'no body to shoot at:', JSON.stringify(f0)); continue; }
    const before=f0.hp;
    const shot=await W.ev(`(function(){ const f=__hc.foxgirl();
      const px=f.at[0]+${R}, pz=f.at[2], py=f.at[1]+${dy};
      __hc.tpAt(px, py, pz);
      const p=__hc.pos();
      const tx=f.at[0], ty=f.at[1]+${dy}, tz=f.at[2]+${side};
      const dx=tx-p.x, dy2=ty-(p.y+1.62), dz=tz-p.z;   // +1.62 is the eye over the feet
      const yaw=Math.atan2(-dx,-dz), pitch=Math.atan2(dy2, Math.hypot(dx,dz));
      H.cam({yaw, pitch});
      // SIGHTS UP. Hip fire carries the crosshair's own bloom, so a shot "aimed" 1.8 blocks wide can still arrive on
      // her by luck of the cone — which is a measurement of the spread, not of the hit capsule.
      __hc.aim(true);
      // hotbar slot 1 holds the rifle after /give
      __hc.slot&&__hc.slot(0);
      const fired=__hc.shoot();
      return { fired, aimedAt:[+tx.toFixed(2),+ty.toFixed(2),+tz.toFixed(2)], from:[+p.x.toFixed(2),+(p.y+1.62).toFixed(2),+p.z.toFixed(2)], pitch:+pitch.toFixed(3) };
    })()`);
    await sleep(600);
    const f1=await W.ev(`__hc.foxgirl()`);
    const hit = (f1 && f1.alive===false) || (f1 && f1.hp!=null && f1.hp<before);
    console.log(`${name.padEnd(12)} aimed ${JSON.stringify(shot.aimedAt)}  pitch ${String(shot.pitch).padStart(6)}  hp ${before} -> ${f1&&f1.hp!=null?f1.hp:(f1&&f1.alive===false?'dead':'?')}  ${hit?'HIT':'no hit'}`);
  }
}finally{ await W.close(); }
