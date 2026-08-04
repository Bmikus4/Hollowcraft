# Backlog — light, sky, water, horizon, atmosphere

## Open
- Ocean appears below a certain level inland
- Voxel hash lighting
- Emitters visible from farther away
- Storm cloud value/colour off overcast; rain streaks take the sky's value
- Directional skylight (vSky per-face scalar)
- Coloured block light
- Water close up: shallow alpha floor, absorption curve, shoreline foam
- Entity contact shadows
- Shadow distance / cascades
- Planar or screen-space water reflection
- TAA instead of FXAA
- Bloom quality
- Fog parity: far-sea disc vs chunk water, step at the render wall

## Blocked on Ben
- Shadow penumbra: filter change, priced A/B
- `shore` at 7.70 ms, 805 draw calls, unattributed

## Awaiting Ben's eye (shipped)
- Halo minimal
- Cloud k 0.8
- Darker sea anchor
- Sea curve at the far end only
- Entranceway off
- Phantom coast pulled in
- Pine colour 81%
- Glades x3 to the horizon
- Night sky below the horizon
- God-ray seed threshold

## Unresolved measurements
- God-ray seeded-shaft isolation
- Woody band downward extent (bounded by occlusion)
