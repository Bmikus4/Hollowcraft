# TASK — the skybox pines, and the horizon they stand on

Written 2026-08-12, at Ben's instruction, as the next task after the water.

## What he asked for

> "hyperrealistic skybox pines off the coast, hyperrealistic mountains INLAND ONLY"

and, defining the word himself:

> "hyperrealistic... is that it fits in with our existing lighting"

So this is not a modelling exercise. A pine that does not sit inside the shipped lighting is wrong however
good it looks on its own. The mountains are the same task's other half and Ben wants to build them **with
him**, so do the pines first and bring him the frame.

## READ THIS BEFORE ANYTHING: the pines already existed and were deleted on purpose

`adfa6bb` scrapped the whole horizon backdrop — mountains, treeline, woody band, entranceway, the 128-step
mask, every hook. **What survives is a comment block in `index.html` recording WHY the pines existed, and
it is the foundation of the new spec: they hid the render wall at the island's edge.** Read it before
writing a line. Deleting them re-opened that hole, so the rebuild is not decoration — it is covering a
seam that is currently visible.

Two findings from the version that was thrown away, both worth more than the code was:

- **The depth was in the aerial perspective, not in the geometry.** Two ridged ranges at different
  distances, the far one mixed much harder toward the sky, is what read as distance. A single ridge
  silhouette reads as a cut-out whatever shape it is given.
- The old treeline was a bearing resolved once to the most densely forested direction and handed to the
  shader as a live azimuth, which is what kept it a PLACE on the horizon rather than a screen-space effect.

## The frame it is judged on

`bench/tmp-vista-after-scrap.mjs` — shore and inland vistas at noon and midnight. It was built for exactly
this decision. Do not invent a new vantage; the history of this bench is littered with crops that did not
contain the thing they measured.

## What changed under it today, and what it means for this task

The sea is no longer the old water. It is three's `webgl_shaders_ocean` Water (`__hc.ocean3`, on by
default), clipped to the real coastline by a land mask, with the painted horizon band and the far-sea disc
**deleted**. Consequences for the pines:

- **The old horizon band is gone.** It used to carry the join between sea and sky. Whatever the pines do at
  that join, they do alone now.
- The white line at the horizon in every frame of the water work was the **plane standing outside the sky
  dome**, fixed by sizing it `FAR*2`. If a seam shows up again at the horizon, check the pines' own extent
  against `skyGeo = SphereGeometry(FAR*1.4)` before assuming it is a gap.
- The sky dome may not draw inside the water's mirror pass — it takes the real sky with it, cause still
  unknown after five attempts. **Anything added to the horizon has to be checked with the ocean ON**, or a
  fault of this class ships invisible.

## The trap this whole programme keeps paying

Every number in the water investigation that was compared ACROSS bench runs was worthless: the same build
measured 0.948%, 4.333% and 4.539% on three runs while being bit-stable within each one. Interleave inside
one page, repeat the baseline last, and quote its agreement as the noise floor. And look at the frame
before reading a statistic off it — this session read a crop artifact as a NaN signature and spent a day on
it.

## Still open on the water, so it is not mistaken for finished

| item | state |
|---|---|
| A localised sun/moon glare | **The next water job.** `sunColor` cannot do it: in this material it multiplies a broad diffuse-and-scatter term over every fragment, so raising it whites out the whole sea (it did, at 5 and at 16). The glare has to come from the specular exponent in the example's fragment stage — a shader edit, not a value. |
| The sea reflecting the sky | Off, on Ben's word. The dome cannot draw in the mirror pass. The fix that sidesteps it: render the sky once per frame from a FIXED camera into a small cube and hand that to the water. |
| The sky vanishing with the ocean | Cause unknown. Turning the reflection off did NOT bring it back, which kills the theory that the second scene render is responsible and invalidates the five fixes built on that reading. |
| Shoreline has no shallows | The example's material has no depth absorption. Accepted when Ben chose to take the shader and material whole. |
| Cost | +50% frame: shore 8.6 -> 12.3 ms, forest 16.9 -> 26.8 ms, interleaved in one page. |

## Dials that exist

`__hc.ocean3(0/1)` · `ocean3Refl(0/1)` (mirror pass alone) · `ocean3Set({size, distortion, color, alpha, y})`
· `ocean3Err()` · `folOn(0/1)` (every foliage mesh) · `waterNan(0-6)` + `dbgT` (old water's debug modes) ·
`normFade(blocks)`.

## Ground rules that still bite

`docs/handoff/00-ground-rules.md`, and above all: `index.html` is co-edited by another live session, which
swept this session's work into ITS commits four times today. Commit the whole file, run
`node C:\Users\thera\fleet\hc-guard.mjs 12`, and expect your commit message to be the only record that the
change was yours. Syntax-check and `assert-imports` before every commit — a vendored addon that is not
committed alongside `index.html` serves a build that does not run at all.
