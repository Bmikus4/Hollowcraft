# Hollowcraft bench — 2026-07-18T12:25:46.186Z

GPU: `ANGLE (AMD, AMD Radeon RX 5700 XT (0x0000731F) Direct3D11 vs_5_0 ps_5_0, D3D11)`  
Mode: headless-new (chrome)  
Viewport 1280x720 dpr1, settle 30s, measure 40s per scenario.

| scenario | avgFps | p50ms | p95ms | p99ms | worst | >16.7ms | >25ms | longtasks | ltWorst | heap MB | draws | tris | geoms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo-static | 29.1 | 34.71 | 48.63 | 55.58 | 173.6 | 1164 | 1026 | 47 | 170 | 140->114.2 | 210 | 180k | 458 |
| solo-night-wretch | 27.4 | 34.73 | 48.65 | 62.5 | 83.4 | 1095 | 1016 | 85 | 79 | 121.4->108.9 | 222 | 231k | 554 |
| solo-roam | 23.9 | 34.75 | 83.33 | 104.17 | 256.9 | 956 | 892 | 175 | 257 | 101.4->110.3 | 290 | 199k | 649 |
| mp-2p-host | 14.8 | 52.26 | 173.58 | 243.06 | 277.8 | 590 | 588 | 313 | 274 | 141->139.9 | 268 | 183k | 660 |
| mp-2p-guest | 28.7 | 27.69 | 97.23 | 173.62 | 243.1 | 880 | 581 | 178 | 242 | 109.6->120.7 | 296 | 200k | 643 |
