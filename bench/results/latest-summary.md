# Hollowcraft bench — 2026-07-18T12:33:54.249Z

GPU: `ANGLE (AMD, AMD Radeon RX 5700 XT (0x0000731F) Direct3D11 vs_5_0 ps_5_0, D3D11)`  
Mode: headless-new (chrome)  
Viewport 1280x720 dpr1, settle 30s, measure 40s per scenario.

| scenario | avgFps | p50ms | p95ms | p99ms | worst | >16.7ms | >25ms | longtasks | ltWorst | heap MB | draws | tris | geoms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mp-2p-host | 114.3 | 6.95 | 13.9 | 62.52 | 145.8 | 157 | 100 | 61 | 144 | 91.8->79.4 | 295 | 159k | 645 |
| mp-2p-guest | 105.7 | 6.95 | 13.98 | 83.29 | 173.6 | 201 | 128 | 83 | 175 | 96.9->100.9 | 295 | 205k | 695 |
