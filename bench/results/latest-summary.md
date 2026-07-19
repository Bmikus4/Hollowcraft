# Hollowcraft bench — 2026-07-19T13:05:16.993Z

GPU: `ANGLE (AMD, AMD Radeon RX 5700 XT (0x0000731F) Direct3D11 vs_5_0 ps_5_0, D3D11)`  
Mode: headless-new (chrome)  
Viewport 1280x720 dpr1, settle 25s, measure 30s per scenario.

| scenario | avgFps | p50ms | p95ms | p99ms | worst | >16.7ms | >25ms | longtasks | ltWorst | heap MB | draws | tris | geoms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo-roam | 138.5 | 6.94 | 6.99 | 7.03 | 861.1 | 3 | 3 | 2 | 862 | 89->100.1 | 49 | 11k | 672 |
