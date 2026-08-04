# Backlog — light, sky, water, horizon, atmosphere

## Open
- Directional skylight (vSky per-face scalar)
- Coloured block light
- Water close up: shoreline foam
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
- Emitters visible from farther away: a lamp you have seen keeps burning after its chunk unloads
- Voxel hash lighting: unlit ground washes out to grey at night instead of collapsing onto red/green
- Storm clouds: deck value/colour off overcast
- Rain streaks take the air's value
- Ocean not drawn from under the ground inland
- Stars and Milky Way below the horizon
- Shallow water see-through
- Fresnel cap: depth colour survives a grazing angle
- Halo minimal
- Cloud k 0.8
- Darker sea anchor
- Sea curve at the far end only
- Entranceway off
- Phantom coast pulled in
- Pine colour 81%
- Glades x3 to the horizon
- God-ray seed threshold

## Unresolved measurements
- Grazing-angle water layers (needs a shelf placed at known depths)
- God-ray seeded-shaft isolation
- Woody band downward extent (bounded by occlusion)
