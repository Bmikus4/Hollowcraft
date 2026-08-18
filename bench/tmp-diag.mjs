import { openWorld, sleep } from './lib/rig.mjs';
(async () => {
  const W = await openWorld({ w: 600, h: 400, rd: 4 });
  const p = W.page;
  try {
    await p.evaluate(`__hc.lock(true);`);
    const t0 = Date.now();
    while (Date.now() - t0 < 200000) { const f = await p.evaluate(`__hc.fill()`); if (f && f.want > 0 && f.meshed / f.want >= 0.8) break; await sleep(1500); }
    console.log('bid  ' + JSON.stringify(await p.evaluate(`__hc.bid()`)).slice(0, 300));
    console.log('tn   ' + JSON.stringify(await p.evaluate(`__hc.trailNodes()`)).slice(0, 400));
  } finally { await W.close(); }
})();
