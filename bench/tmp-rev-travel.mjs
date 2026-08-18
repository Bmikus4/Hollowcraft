// DOES THE CRANE MOVE, AND DOES THE BRASS GO WITH IT? Numbers, not a frame.
// The swing is 0.034 of a block across a 2.6 s reload, so a screenshot's answer depends on which millisecond it landed
// on. __hc.cylProbe reports the driven node and the first round in WORLD space; __hc.stepView walks the animation by
// hand so the sample is taken where the crane is out rather than wherever the wall clock happened to be.
import { openWorld, sleep } from './lib/rig.mjs';
const GUN = process.argv[2] || 'revolver';
(async () => {
  const W = await openWorld({ w: 900, h: 520, rd: 6 });
  const p = W.page;
  try {
    await p.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative');`);
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) { const f = await p.evaluate(`__hc.fill()`); if (f && f.want > 0 && f.meshed / f.want >= 0.90) break; await sleep(1500); }
    await p.evaluate(`__hc.hold(${JSON.stringify(GUN)})`); await sleep(400);
    const rest = await p.evaluate(`__hc.cylProbe()`);
    console.log('  rest  ' + JSON.stringify(rest));
    console.log('  armed ' + JSON.stringify(await p.evaluate(`__hc.reload(true)`)));
    for (const n of [6, 12, 20, 30]) {
      await p.evaluate(`__hc.stepView(${n},0.05)`);
      const q = await p.evaluate(`__hc.cylProbe()`);
      const d = (rest.round && q.round) ? Math.hypot(q.round[0]-rest.round[0], q.round[1]-rest.round[1], q.round[2]-rest.round[2]) : null;
      const dc = (rest.cylWorld && q.cylWorld) ? Math.hypot(q.cylWorld[0]-rest.cylWorld[0], q.cylWorld[1]-rest.cylWorld[1], q.cylWorld[2]-rest.cylWorld[2]) : null;
      console.log(`  +${String(n).padStart(2)} steps  cylX ${q.cylX}  cyl moved ${dc==null?'n/a':dc.toFixed(4)}  round moved ${d==null?'n/a':d.toFixed(4)}  roundInCrane ${q.roundInCrane}`);
    }
    console.log('  errors: ' + (W.errors.length ? W.errors.slice(0,2).join(' | ') : 'none'));
  } finally { await W.close(); }
})();
