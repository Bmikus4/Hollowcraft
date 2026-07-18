# Hollowcraft bench — 2026-07-18T12:56:34.997Z

GPU: `ANGLE (AMD, AMD Radeon RX 5700 XT (0x0000731F) Direct3D11 vs_5_0 ps_5_0, D3D11)`  
Mode: headless-new (chrome)  
Viewport 1280x720 dpr1, settle 30s, measure 40s per scenario.

| scenario | avgFps | p50ms | p95ms | p99ms | worst | >16.7ms | >25ms | longtasks | ltWorst | heap MB | draws | tris | geoms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo-static | 144 | 6.94 | 6.96 | 6.98 | 7.1 | 0 | 0 | 0 | 0 | 91->103.7 | 516 | 450k | 469 |
