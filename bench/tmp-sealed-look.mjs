// WHAT IS THE FLAT 6 IN A SEALED ROOM MADE OF — PITCH AND THE GODRAY PASS
//
// The carrier has now been narrowed by elimination, every row interleaved with its baseline repeated last and a
// noise floor of 0.05 (bench/tmp-sealed-hand|base|sky|fog.mjs):
//   viewmodel        flat 1.27 at BOTH hours, so not day-scaled
//   base level       0 / 0.10 / 0.15 all 6.06-6.11, gate genuinely shut
//   sky curve        exp 0.55 -> 3.0 closes 0% of the gap
//   corner smoothing on -> off closes 1%      (with the curve result: vSky is a hard zero here)
//   scene.fog        gap 4.22 at 7.4 blocks, 4.25 at 0.6 — distance-independent, so not fog
// What is left is additive, constant, distance-independent and day-scaled: a full-screen or backdrop term rather
// than a lighting one. Two candidates have that shape and both are separable by WHERE THE CAMERA LOOKS rather
// than by a dial:
//   · the horizon backdrop (far-sea disc, horizon pines) bleeding through solid geometry — it lives in a band
//     around the horizon and fades toward _uPineFog, which is scaled by (0.10 + 0.90*day) and measures 0.0084
//     luminance at midnight. Look straight down and a backdrop bleed goes away; a full-screen add does not.
//   · the godray pass, which is additive and keyed to the sun.
//
//   node bench/tmp-sealed-look.mjs
import { openWorld, pin, measure, CROP, fmt, sleep } from './lib/rig.mjs';

const NOON=0.25, NIGHT=0.75;

async function carveRoom(P, CX, CZ){
  const GY = await P.evaluate(`__hc.groundY(${CX}, ${CZ})`);
  const CY = Math.max(6, GY - 16);
  await P.evaluate(`(function(){ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
  for(let i=0;i<40;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
  const roof = await P.evaluate(`(function(){ var n=0,a=__hc.bid('air'); for(var y=${CY}+5; y<=${GY}; y++) if(__hc.blockAt(${CX},y,${CZ})!==a) n++; return n; })()`);
  return { CY, GY, roof };
}

(async()=>{
  const W = await openWorld({ rd:8 });
  const P = W.page;
  try{
    const S = await P.evaluate(`__hc.st()`);
    const CX = Math.round(S.sx)+18, CZ = Math.round(S.sz)+18;
    const R = await carveRoom(P, CX, CZ);
    console.log(`  room roofed by ${R.roof} solid blocks`);
    await P.evaluate(`__hc.cinematic(true)`); await sleep(600);
    const YAW = Math.atan2(-1, 0);

    const rows=[];
    async function row(tag, t, pitch, js){
      if(js){ const r = await P.evaluate(js); if(r && typeof r==='object') console.log(`    ${tag} -> ${JSON.stringify(r).slice(0,140)}`); }
      await P.evaluate(`__hc.tp(${CX}, ${R.CY+1.6}, ${CZ}, ${YAW}, ${pitch})`); await sleep(450);
      await pin(W, t);
      const m = await measure(W, `sealedlook-${tag.replace(/[^a-z0-9]+/gi,'-')}`, t, { c:CROP.centre });
      rows.push({ tag, lum:m.c.lum });
      console.log(`  ${tag.padEnd(28)} ${fmt(m.c)}`);
    }

    await row('noon  level',        NOON,  0);
    await row('noon  looking down', NOON,  -1.45);      // radians: -83 degrees, floor fills the crop
    await row('noon  looking up',   NOON,   1.45);
    await row('noon  godrays OFF',  NOON,   0, `__hc.godrays({on:false})`);
    await row('noon  godrays ON',   NOON,   0, `__hc.godrays({on:true})`);
    await row('night level',        NIGHT,  0);
    await row('night looking down', NIGHT, -1.45);
    await row('noon  level (again)',NOON,   0);

    const L=t=>{ const r=rows.find(r=>r.tag===t); return r?r.lum:NaN; };
    console.log('');
    console.log(`  noise floor        noon level ${L('noon  level')} then ${L('noon  level (again)')}`);
    console.log(`  noon  level ${L('noon  level')}  down ${L('noon  looking down')}  up ${L('noon  looking up')}`);
    console.log(`  night level ${L('night level')}  down ${L('night looking down')}`);
    console.log(`  godrays on ${L('noon  godrays ON')} vs off ${L('noon  godrays OFF')}`);
    console.log('');
    console.log('  A lift that survives looking straight down at the floor is not a horizon backdrop bleed.');
    console.log('  A lift that survives godrays off is not the godray pass. If both survive, what is left is the');
    console.log('  tone map and grade acting on a frame whose scene radiance is genuinely zero.');
  } finally { await W.close(); }
})();
