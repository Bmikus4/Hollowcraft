# Hollowcraft bench — 2026-07-18T17:45:06.022Z

GPU: `ANGLE (AMD, AMD Radeon RX 5700 XT (0x0000731F) Direct3D11 vs_5_0 ps_5_0, D3D11)`  
Mode: headless-new (chrome)  
Viewport 1280x720 dpr1, settle 30s, measure 40s per scenario.

| scenario | avgFps | p50ms | p95ms | p99ms | worst | >16.7ms | >25ms | longtasks | ltWorst | heap MB | draws | tris | geoms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo-static | 144 | 6.94 | 6.96 | 6.97 | 7.1 | 0 | 0 | 0 | 0 | 102.7->96.2 | 254 | 196k | 547 |
| solo-night-wretch | 142.2 | 6.94 | 6.96 | 6.96 | 520.8 | 1 | 1 | 1 | 523 | 94.2->94.2 | 298 | 168k | 425 |
| solo-roam | 142.9 | 6.94 | 6.96 | 6.97 | 62.5 | 4 | 1 | 1 | 62 | 91.5->100.1 | 157 | 37k | 694 |
| mp-2p-host | 139.4 | 6.94 | 6.96 | 13.88 | 486.1 | 12 | 3 | 1 | 127 | 128.3->107.3 | 90 | 19k | 649 |
| mp-2p-guest | 139.7 | 6.94 | 6.96 | 13.88 | 513.9 | 12 | 3 | 2 | 514 | 92.8->104.1 | 91 | 19k | 702 |
