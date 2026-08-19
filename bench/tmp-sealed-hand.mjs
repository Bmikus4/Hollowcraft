// WHAT REACHES A SEALED ROOM AT NOON — is it the world, or is it the hand?
//
// assert-unlit-black and assert-cave-black both fail the same check from the same vantage: a room carved sixteen
// blocks under the surface, no sky access anywhere in it, reads 7.4 of 255 at noon against 3.15 at midnight. A
// sealed room has no term that varies with the sun, so something day-scaled is arriving. The frames those guards
// wrote contain one obvious candidate: the viewmodel forearm renders at ~218 IN A LIGHTLESS ROOM, and it is
// brighter at noon than at midnight, because it is lit by the sun through a MeshLambertMaterial that knows
// nothing about sky access, plus a constant eye fill.
//
// Bloom is a full-screen pass, so a bright slab in the corner of an otherwise black frame lifts the whole frame.
// The test is therefore not a shader read but a subtraction: hide the viewmodel and measure the same room.
// __hc.cinematic(true) is the only hook that hides it; it also sets fly and hides the HUD, and it does NOT move
// the player (applyCine zeroes velocity and leaves position alone), so the vantage survives.
//
// INTERLEAVED, and the baseline row repeated LAST, because this box's cooling fan has moved a whole bench table
// before now (docs/handoff/00-ground-rules.md).
//
//   node bench/tmp-sealed-hand.mjs
import { openWorld, pin, measure, CROP, fmt, sleep } from './lib/rig.mjs';

const NOON=0.25, NIGHT=0.75;

// Carved, not built: a box built in the open has sky-open walls and measures nothing. Copied from
// assert-unlit-black deliberately — the two harnesses must be looking at the same room for the numbers to compare.
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
    await P.evaluate(`__hc.tp(${CX-3}, ${R.CY+1.6}, ${CZ}, 0, 0)`);
    await sleep(800);

    const rows=[];
    async function row(tag, t, hands){
      await P.evaluate(`__hc.cinematic(${hands?false:true})`); await sleep(500);
      await pin(W, t);
      const m = await measure(W, `sealedhand-${tag}`, t, { c:CROP.centre, f:CROP.frame });
      rows.push({ tag, t, hands, c:m.c, f:m.f });
      console.log(`  ${tag.padEnd(22)} centre ${fmt(m.c)}`);
      console.log(`  ${''.padEnd(22)} frame  ${fmt(m.f)}`);
    }

    await row('noon  hands ON',  NOON,  true);
    await row('noon  hands OFF', NOON,  false);
    await row('night hands ON',  NIGHT, true);
    await row('night hands OFF', NIGHT, false);
    await row('noon  hands ON (again)', NOON, true);   // the noise floor: quote its agreement with row 1

    const g=(tag,k)=>{ const r=rows.find(r=>r.tag===tag); return r? r[k].lum : NaN; };
    const nOn=g('noon  hands ON','c'), nOff=g('noon  hands OFF','c');
    const gOn=g('night hands ON','c'), gOff=g('night hands OFF','c');
    const nAgain=g('noon  hands ON (again)','c');
    console.log('');
    console.log(`  noise floor            noon hands ON ${nOn} then ${nAgain}  (drift ${Math.abs(nOn-nAgain).toFixed(2)})`);
    console.log(`  the hour, hands ON     noon ${nOn} vs night ${gOn}   delta ${(nOn-gOn).toFixed(2)}`);
    console.log(`  the hour, hands OFF    noon ${nOff} vs night ${gOff}   delta ${(nOff-gOff).toFixed(2)}`);
    console.log('');
    console.log('  If the delta collapses with the hands hidden, the sealed room does not know the hour — the');
    console.log('  VIEWMODEL does, and it is telling the room through bloom. If it survives, the term is in the world.');
  } finally { await W.close(); }
})();
