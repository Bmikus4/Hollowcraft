// WHICH TERM CARRIES THE DAY INTO A SEALED ROOM
//
// Established by bench/tmp-sealed-hand.mjs, noise floor 0.05: the viewmodel adds a flat 1.27 at BOTH hours, so
// it is not the author. With the hands hidden the room still reads noon 6.11 against night 1.92, and it reads it
// as a CONSTANT — min 6, p10 6, med 6.07, near-black 100%. A constant is not a gradient of leaked light; it is a
// term being added, and the only day-scaled gate in the atlas branch is the delivered-light ramp:
//
//   _litQ = max(_bl, vSky*uScotG.w, _emi)        uScotG.w is the DAY FACTOR
//   _lk   = smoothstep(0.0, uScotH.w, _litQ)     uScotH.w = 0.009
//   gl_FragColor.rgb += diffuseColor.rgb * (uHcAux.x * _lk)
//
// `vSky*uScotG.w` means a face needs only vSky > 0.009 for the gate to stand fully OPEN at noon and fully SHUT at
// midnight. The base level then lands as albedo times a constant, which is exactly the flat lift measured. A
// sealed room is supposed to sit at vSky = 0 — but aSky is 4 bits smoothed per CORNER (_SKY_SMOOTH = 1), and a
// corner of a wall quad averages the air cells meeting there, which for the room's own corners includes cells
// outside it. One 1/15 step is 0.067, seven times the knee.
//
// So this sweeps the base level at that vantage. If noon collapses onto night with uHcAux.x = 0, the gate is the
// author and the fix is in the gate, not in the level. Interleaved, baseline repeated last.
//
//   node bench/tmp-sealed-base.mjs
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
    // The hands are hidden for every row: they contribute a flat 1.27 that is the same at both hours, so they add
    // nothing but a constant to every comparison here and a constant in a black frame costs contrast in the read.
    await P.evaluate(`__hc.cinematic(true)`); await sleep(600);

    const rows=[];
    async function row(tag, t, js){
      if(js) await P.evaluate(js);
      await sleep(350);
      await pin(W, t);
      const m = await measure(W, `sealedbase-${tag.replace(/[^a-z0-9]+/gi,'-')}`, t, { c:CROP.centre });
      rows.push({ tag, lum:m.c.lum, med:m.c.med });
      console.log(`  ${tag.padEnd(26)} ${fmt(m.c)}`);
    }

    await row('noon  base 0.10 (shipped)', NOON,  `__hc.baseAmb(0.10)`);
    await row('noon  base 0',             NOON,  `__hc.baseAmb(0)`);
    await row('night base 0.10',          NIGHT, `__hc.baseAmb(0.10)`);
    await row('night base 0',             NIGHT, `__hc.baseAmb(0)`);
    await row('noon  base 0.15',          NOON,  `__hc.baseAmb(0.15)`);
    await row('noon  base 0.10 (again)',  NOON,  `__hc.baseAmb(0.10)`);

    const L=t=>{ const r=rows.find(r=>r.tag===t); return r?r.lum:NaN; };
    console.log('');
    console.log(`  noise floor        noon base 0.10  ${L('noon  base 0.10 (shipped)')} then ${L('noon  base 0.10 (again)')}`);
    console.log(`  hour gap, base on  noon ${L('noon  base 0.10 (shipped)')} vs night ${L('night base 0.10')}   delta ${(L('noon  base 0.10 (shipped)')-L('night base 0.10')).toFixed(2)}`);
    console.log(`  hour gap, base off noon ${L('noon  base 0')} vs night ${L('night base 0')}   delta ${(L('noon  base 0')-L('night base 0')).toFixed(2)}`);
    console.log(`  the level's own cost at noon: 0 -> 0.10 -> 0.15 = ${L('noon  base 0')} -> ${L('noon  base 0.10 (shipped)')} -> ${L('noon  base 0.15')}`);
    console.log('');
    console.log('  A delta that survives base 0 means the day is arriving by some OTHER term and the level is innocent.');
  } finally { await W.close(); }
})();
