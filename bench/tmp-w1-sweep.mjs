// ONE RUN, FIVE OPEN ITEMS. Backlog 3.5 (optics must be shiny dark gunmetal), 3.6 (one attachment slot sits off its
// mount), 3.7 (suppressor too small / foregrip too big), 3.9 (reload drives the wrong part on some guns).
//
// Written as one pass because the alternative is four boots and forty round-trips for numbers that all come from the
// same held gun. Each gun is held once; the reload is stepped once; every attachment that fits is fitted once. What
// comes back is a line per gun and a line per fit -- summaries, not dumps.
//
//   node bench/tmp-w1-sweep.mjs [gun,gun,...]
import { openWorld, sleep } from './lib/rig.mjs';

const SLOT = { red_dot:'optic', holo_sight:'optic', optic_scope:'optic', suppressor:'muzzle',
               weapon_light:'light', laser_sight:'laser', foregrip:'grip' };
const ONLY = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2].split(',') : null;

(async () => {
  const W = await openWorld({ w: 900, h: 520, rd: 6 });
  const p = W.page;
  try {
    await p.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.cmdRun('/gamemode creative');`);
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) { const f = await p.evaluate(`__hc.fill()`); if (f && f.want > 0 && f.meshed / f.want >= 0.90) break; await sleep(1500); }

    const M = await p.evaluate(`__hc.attMatrix()`);
    const rows = (M.rows || []).filter(r => r.modelled && (!ONLY || ONLY.includes(r.gun)));
    console.log(`  ${rows.length} modelled guns\n`);

    console.log('  ---- 3.9 RELOAD: which part does the animation actually drive? ----');
    for (const r of rows) {
      await p.evaluate(`__hc.hold(${JSON.stringify(r.gun)})`); await sleep(220);
      await p.evaluate(`(()=>{ const q=__hc.attProbe(); if(q&&q.slots) for(const s of q.slots) __hc.attFit(s,null); })()`).catch(()=>{});
      const rl = await p.evaluate(`__hc.reload()`);
      const moved = (rl.moved || []).join(',') || 'NOTHING';
      const has = (rl.parts || []).join(',') || 'none';
      console.log(`   ${r.gun.padEnd(20)} parts[${has.padEnd(22)}] moved[${moved.padEnd(18)}] ${rl.why ? rl.why : JSON.stringify(rl.peak || {})}`);
    }

    console.log('\n  ---- 3.5 OPTIC FINISH + 3.6/3.7 FIT: gap is mm between piece and mount, negative bites in ----');
    for (const r of rows) {
      const fits = Object.keys(SLOT).filter(a => r.fits[a]);
      if (!fits.length) continue;
      await p.evaluate(`__hc.hold(${JSON.stringify(r.gun)})`); await sleep(200);
      const out = [];
      for (const a of fits) {
        const q = await p.evaluate(`(()=>{ const pr=__hc.attProbe(); if(pr&&pr.slots) for(const s of pr.slots) __hc.attFit(s,null);
                                           __hc.attFit(${JSON.stringify(SLOT[a])},${JSON.stringify(a)}); return __hc.attProbe(); })()`);
        const f = (q.fitted || []).find(x => x.id === a) || {};
        // The fitted piece's own materials, so "pale grey" is a number: a satin gunmetal is a near-black albedo with a
        // bright specular, and a pale part shows up as a high colour value here whatever the frame's lighting is.
        const mats = await p.evaluate(`(()=>{ const L=__hc.heldParts(); const seen={};
          for(const q of (L.parts||[])) if(q.col) seen[q.col]=(seen[q.col]||0)+1;
          return Object.entries(seen).sort((a,b)=>b[1]-a[1]).slice(0,4).map(e=>e[0]+'x'+e[1]).join(' '); })()`);
        out.push(`${a}:gap=${f.gap != null ? f.gap : '?'}${f.size ? ' size=' + JSON.stringify(f.size) : ''}`);
        if (a === fits[0]) console.log(`   ${r.gun.padEnd(20)} cols ${mats}`);
      }
      console.log(`   ${' '.repeat(20)} ${out.join('  ')}`);
    }
    console.log('\n  errors: ' + (W.errors.length ? W.errors.slice(0, 3).join(' | ') : 'none'));
  } finally { await W.close(); }
})();
