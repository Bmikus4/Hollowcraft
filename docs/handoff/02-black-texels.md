# TASK 1 — black texels, and "textures don't show up at all in dark areas"

## What Ben reported

> 08-11: "the black voxels are absolutely everywhere, full regression... ALSO HALF OF the surfaces
> in game are completely matted, like no texture at all."
> 08-12: "i still see voxel lighting black texels", then **"in dark areas textures still dont show
> up at all"**.

## SETTLED — do not re-derive any of this

- **The matting is gone.** It was the uncompiled `hcLight()` extraction sitting in
  `lights_pars_begin`, reverted in `39fa2d2`. Verified: the game compiles with no shader errors,
  only one pre-existing HLSL `X3595` warning.
- **Per-corner sky access is not the cause and is now ON** (`11ba56c`). It REDUCES the speckle:
  wood at noon 0.107% -> 0.053%, lantern in a night wood isolated black 2.377% -> 1.915%.
- **The zeroed-fragment theory is dead** (`be81139`). The claim was that corner averaging pushes
  fragments to exactly zero where the floor is a scale and a scale cannot lift zero. Those
  fragments are not at float zero — they are at 8-bit black with a real positive value and already
  take the scale. A branch lifting them along the albedo's chroma measured completely inert.

## THE FINDING, AND THE FIX THAT IS BUILT BUT NOT SHIPPED

**Rendered radiance is albedo TIMES irradiance, so a texture's grain is scaled by the light.** Halve
the light and you halve the difference between a texture's dark and bright texels; below the 8-bit
quantum that difference is gone. That is the whole of "in dark areas textures don't show up".

**Both texel floors make it worse rather than better.** Each normalises a sub-floor pixel to a
CONSTANT — `gl_FragColor.rgb *= (_fmin/_fl)` and `*= (uScotK.z/_albL)` — so every pixel they touch
lands on the same value. They are not floors, they are clamps to a constant, and they erase what
grain survives in exactly the dim places Ben is looking at.

**The term that works is additive and carries the albedo**, which is Ben's own architecture: *"maybe
everything in the entire game needs a base lighting level"*. It is gated by `_lk`, the
delivered-light ramp the descent and the floor already use, so a sealed room takes exactly zero of
it and the black night is untouched.

Measured at the lantern in a night wood, interleaved, baseline row repeated last and landing on
5.932% twice — noise floor 0.002. `texSD` is mean per-tile luminance standard deviation, and it is
the only metric here that answers "is the texture visible" rather than "is it dark":

| config | texSD | pure black | isolated black | median |
|---|---|---|---|---|
| floors on, no base (SHIPPED) | 4.819 | 5.93% | 4.22% | 15.7 |
| floors off, base 0.08 | 5.699 | 4.61% | 3.24% | 18.8 |
| floors off, base 0.15 | 5.710 | 2.57% | 1.62% | 22.6 |

**+18% texture contrast and -62% isolated black at the same time**, which no setting of the floors
can achieve — pushing `disp` to 0.04 removes more black but takes texSD DOWN and the median to 50.6.

## WHAT IS LEFT TO DO, IN ORDER

1. Turn it on: `__hc.texFloor({k:0, disp:0})` then `__hc.baseAmb(0.15)`. The shipped defaults are
   `_scotK[2]=0.030`, `_scotK[3]=0.008`, `_hcAux[0]=0`.
2. **Run the four guards.** This is the only reason it is not already shipped. The last thing that
   went into this file unmeasured was `hcLight()` and it broke every lit material in the game.
   Baselines are in `docs/HANDOFF.md`.
3. Measure it BY DAY too. Every number above is one night vantage. `bench/tmp-texel-day.mjs` has the
   day sites; its shade wall reads 0.015% pure black, so the day case needs a vantage that contains
   the fault before it can say anything.
4. Then set the default in `_scotK` / `_hcAux` and let Ben judge the night. The cost is a brighter
   lamp pool — median 15.7 to 22.6 — and he has signed that night off four times, so it is his call
   and not a metric's.

## THE VANTAGES THAT WORK — do not invent another

- `bench/tmp-lightpool-speckle.mjs` — a lantern in a night wood, the frame Ben photographed. Takes
  rows `k/disp[/extra js]`, so an interleaved A/B is one command. It now reports `texSD`.
- `bench/tmp-texel-day.mjs` — a dirt wall in canopy shade at 1.5 blocks, plus the far water.
- `bench/tmp-blacktexel-forest.mjs` — a wood over several bearings, reports texSD and flatness.
  **Do not run it at midnight**: the frame comes back 94% near-black and measures an unlit night
  rather than a lit surface. The comment in the file says so.

Five crops in this bench's history did not contain what they measured, and one of them was made
today. Look at the picture first.
