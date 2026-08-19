// THE DAY THAT REACHES A SEALED ROOM IS SKY, AND THIS SAYS HOW MUCH OF IT AND FROM WHERE
//
// Two things are already measured at this vantage (bench/tmp-sealed-hand.mjs, bench/tmp-sealed-base.mjs, noise
// floor 0.05): the viewmodel adds a flat 1.27 at both hours and is not the author, and the base lighting level is
// completely inert here — 0, 0.10 and 0.15 all read 6.06-6.11 — which means its gate `_lk` is genuinely shut and
// therefore `_litQ < 0.009`, i.e. the room's own vSky is under 0.009.
//
// That number is the point. The ambient is scaled by `uSkyCurve.x + (1-x)*pow(vSky, uSkyCurve.y)` with x = 0 and
// y = 0.55, and an exponent below 1 AMPLIFIES small inputs: pow(0.0667, 0.55) = 0.226. So one 4-bit step of sky
// keeps 22.6% of the full day ambient, and even a quarter of a step keeps 10.7%. The curve was deliberately shaped
// that way (see the note at globalU.uSkyCurve: "one single step of sky keeps very nearly what the 0.26 floor was
// giving it") — but it was shaped against a shaded FOREST FLOOR, where vSky is ~1 and the curve is inert. In a
// sealed room it is the whole of the leak.
//
// Where the fractional step comes from is the other half: _SKY_SMOOTH = 1 averages the four air cells meeting at
// each quad corner, and a room's corner cells include cells outside its own walls.
//
// Interleaved at noon, baseline repeated last, with one night row for the target the room should be reading.
//
//   node bench/tmp-sealed-sky.mjs
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
    await P.evaluate(`__hc.tp(${CX-3}, ${R.CY+1.6}, ${CZ}, 0, 0)`);
    await P.evaluate(`__hc.cinematic(true)`); await sleep(600);

    console.log('  curve as shipped: ' + JSON.stringify(await P.evaluate(`__hc.skyCurve()`)));

    const rows=[];
    async function row(tag, t, js){
      if(js){ const r = await P.evaluate(js); if(r && typeof r==='object') console.log(`    ${tag} -> ${JSON.stringify(r).slice(0,160)}`); }
      await sleep(350);
      await pin(W, t);
      const m = await measure(W, `sealedsky-${tag.replace(/[^a-z0-9]+/gi,'-')}`, t, { c:CROP.centre });
      rows.push({ tag, lum:m.c.lum });
      console.log(`  ${tag.padEnd(28)} ${fmt(m.c)}`);
    }

    await row('noon  exp 0.55 (shipped)', NOON,  `__hc.skyCurve({exp:0.55})`);
    await row('noon  exp 3.0',           NOON,  `__hc.skyCurve({exp:3.0})`);
    await row('noon  exp 0.55 (again)',  NOON,  `__hc.skyCurve({exp:0.55})`);
    await row('noon  smooth OFF',        NOON,  `__hc.skySmooth(0)`);
    await row('noon  smooth ON (again)', NOON,  `__hc.skySmooth(1)`);
    await row('night exp 0.55',          NIGHT, `__hc.skyCurve({exp:0.55})`);

    const L=t=>{ const r=rows.find(r=>r.tag===t); return r?r.lum:NaN; };
    const base=L('noon  exp 0.55 (shipped)'), again=L('noon  exp 0.55 (again)'), night=L('night exp 0.55');
    console.log('');
    console.log(`  noise floor      ${base} then ${again} then ${L('noon  smooth ON (again)')}`);
    console.log(`  the target       night ${night} — what a room with no sky access should read at every hour`);
    console.log(`  exponent 3.0     ${L('noon  exp 3.0')}   (closes ${(100*(base-L('noon  exp 3.0'))/Math.max(1e-6,base-night)).toFixed(0)}% of the gap)`);
    console.log(`  corner mean off  ${L('noon  smooth OFF')}   (closes ${(100*(base-L('noon  smooth OFF'))/Math.max(1e-6,base-night)).toFixed(0)}% of the gap)`);
    console.log('');
    console.log('  Whichever closes the gap names the term. If neither does, the day is not arriving through the sky');
    console.log('  curve at all and the next suspect is scene.fog, which is day-COLOURED and flat over a small room.');
  } finally { await W.close(); }
})();
