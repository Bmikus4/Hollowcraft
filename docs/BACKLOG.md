# Backlog — light, sky, water, horizon, atmosphere

## Open
- Shadow distance / cascades
- Planar or screen-space water reflection
- TAA instead of FXAA
- Bloom quality

## Blocked on Ben
- Shadow penumbra: filter change, priced A/B
- `shore` at 7.70 ms, 805 draw calls, unattributed

## Awaiting Ben's eye (shipped)
- Fog parity at the render wall: measured, no step at either hour (ratio 3.9 day / 4.7 night) — bench/tmp-sea-handover.mjs
- Night wash on the ocean: both water surfaces desaturate with the land, by the same amount, no descent
- Fog in-scatter: a night bank no longer deletes what a lamp lights; night only (__hc.scot({glow}))
- Thin-leaf transmission: a lamp on one side lights the whole plant; the daylight wood reads as volume (__hc.folTrans)
- Fog survives a doorway and a canopy, and eases instead of switching (__hc.fogEncl)
- Scotopic pass is global: patched into three's own lit shader chunks, so every material takes it, not the six atlas ones
- Unlit caves descend to black instead of parking on their own luma — at every hour, gated on the face's sky openness
- Horizon pines darker again, both halves: PINE_GREEN and PINE_BAND at 60%, hue held (`__hc.pineTone`)
- Entity contact shadows: one instanced quad per creature, at its own feet, one draw call
- Night chroma: the light you CARRY brings the colour back, and the washout is 0.85 not 1.0
- Shoreline foam: patchy surf at the waterline, driven off the water's own depth
- Coloured block light: shrine torches red, industrial lamps cold; warm lights unchanged
- God rays: only empty sky seeds one, so lanterns cannot
- Directional skylight: a floor, a wall and a soffit in shade are no longer the same brightness
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
