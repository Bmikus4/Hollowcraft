# Hollowcraft bench — 2026-07-18T12:43:07.794Z

GPU: `ANGLE (AMD, AMD Radeon RX 5700 XT (0x0000731F) Direct3D11 vs_5_0 ps_5_0, D3D11)`  
Mode: headless-new (chrome)  
Viewport 1280x720 dpr1, settle 30s, measure 40s per scenario.

| scenario | avgFps | p50ms | p95ms | p99ms | worst | >16.7ms | >25ms | longtasks | ltWorst | heap MB | draws | tris | geoms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo-roam | 133.1 | 6.94 | 7 | 20.86 | 159.8 | 91 | 53 | 4 | 162 | 90.5->83.2 | 284 | 160k | 586 |
