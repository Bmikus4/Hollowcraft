// WHAT IS ACTUALLY LIGHTING A SEALED CAVE. Measured, not reasoned about: the sky curve and the day-shade dial were
// both swept over their whole range at this exact site and moved the wall by 1.3 of 255, so the ambient is not it.
//
// Each ?dbg mode is a COMPILE-TIME query flag, so this is one boot per mode — the room is carved from the same seed at
// the same coordinates every time, so the frames are comparable. The modes each answer one question about the same
// wall, and between them there is nowhere left for the light to be hiding:
//
//   dbg=sky   → is vSky really 0 here, i.e. is the mesher calling this face enclosed at all?
//   dbg=bl    → is the block-light volume really 0, i.e. is nothing flooding in from a neighbour?
//   dbg=lit   → what direct light is being DELIVERED (this is the term the wash gates on)
//   dbg=cave  → is the cave descent firing on these pixels, or is it being gated out?
//   albedo    → the raw texture with no lighting at all, which is the ceiling any lit result must sit under
//   (none)    → the shipped frame, plus the same frame with the wash switched off entirely (__hc.scot({amt:0}))
//
//   node bench/tmp-cave-why.mjs
import { openWorld, pin, measure, CROP, fmt, sleep } from './lib/rig.mjs';

const NOON=0.25;

async function atCave(mode){
  const W = await openWorld({ rd:8, query: mode||'' , quiet:true});
  const P = W.page;
  const S = await P.evaluate(`__hc.st()`);
  const CX = Math.round(S.sx)+18, CZ = Math.round(S.sz)+18;
  const GY = await P.evaluate(`__hc.groundY(${CX}, ${CZ})`);
  const CY = Math.max(6, GY - 16);
  await P.evaluate(`(function(){ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
  for(let i=0;i<40;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
  // Stand at one end and look at the far wall dead on, so the centre crop is one face and not a corner.
  await P.evaluate(`__hc.tp(${CX-3}, ${CY+1.6}, ${CZ}, 0, 0)`);
  await sleep(800);
  return { W, P, CX, CY, CZ };
}

(async()=>{
  for(const mode of ["","folfloor=0"]){
    const { W, P } = await atCave(mode);
    try{
      await pin(W, NOON);
      const m = await measure(W, `cw-${(mode||'shipped').replace(/[=&]/g,'_')}`, NOON, {c:CROP.centre});
      console.log(`  ${(mode||'(shipped)').padEnd(10)} centre ${fmt(m.c)}`);
      if(false){
        // THE WASH OFF, at the same site in the same boot: what the frame is BEFORE the desaturation and the descent.
        // If the wall is bright here, the light is arriving in the lighting and the wash is only recolouring it; if it
        // is dark here, the wash is what is lifting it, which is the opposite bug and a different fix.
        await P.evaluate(`__hc.scot({amt:0})`); await sleep(250);
        const a = await measure(W, 'cw-nowash', NOON, {c:CROP.centre});
        console.log(`  ${'wash off'.padEnd(10)} centre ${fmt(a.c)}`);
        // ...and with the descent released but the desaturation back on, which separates the two halves of the pass.
        await P.evaluate(`__hc.scot({amt:0.85, floor:1.0})`); await sleep(250);
        const b = await measure(W, 'cw-nodescent', NOON, {c:CROP.centre});
        console.log(`  ${'no descent'.padEnd(10)} centre ${fmt(b.c)}`);
        // THE FOG, which is the one term in this shader that adds a bright constant regardless of the light.
        const fg = await P.evaluate(`(function(){ return { col:[+scene.fog.color.r.toFixed(4),+scene.fog.color.g.toFixed(4),+scene.fog.color.b.toFixed(4)], d:+scene.fog.density.toFixed(5) }; })()`);
        console.log(`  fog ${JSON.stringify(fg)}`);
        const li = await P.evaluate(`(function(){ return { amb:[ambient.color.getHexString(), +ambient.intensity.toFixed(4)], hemi:[hemi.color.getHexString(), hemi.groundColor.getHexString(), +hemi.intensity.toFixed(4)], sun:+sunLight.intensity.toFixed(3), sunCast:sunLight.castShadow, expo:+renderer.toneMappingExposure.toFixed(3) }; })()`);
        console.log(`  lights ${JSON.stringify(li)}`);
      }
    } finally { await W.close(); }
  }
})();
