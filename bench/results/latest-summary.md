# Hollowcraft bench — 2026-07-18T17:11:58.786Z

GPU: `ANGLE (AMD, AMD Radeon RX 5700 XT (0x0000731F) Direct3D11 vs_5_0 ps_5_0, D3D11)`  
Mode: headless-new (chrome)  
Viewport 1280x720 dpr1, settle 30s, measure 40s per scenario.

| scenario | avgFps | p50ms | p95ms | p99ms | worst | >16.7ms | >25ms | longtasks | ltWorst | heap MB | draws | tris | geoms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mp-2p-host | 140.1 | 6.94 | 6.97 | 13.88 | 451.4 | 22 | 4 | 0 | 0 | 102.6->86.9 | 285 | 164k | 658 |
| mp-2p-guest | 140.1 | 6.94 | 6.97 | 13.88 | 465.3 | 19 | 2 | 1 | 466 | 97.3->104.2 | 286 | 164k | 693 |
