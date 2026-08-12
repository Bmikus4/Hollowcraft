# TASK 3 — the black band on the far water

## What Ben reported, 2026-08-11

> "water reflections look better, but water textures look garbage, remove them entirely. also the other
> water texture is showing weird lines in the water, and I still see black blotches in the water from
> far away."

## Already done, shipped in `39fa2d2`

- **The capillary "surface texture" is off** (`uFine`, was on). Three octaves at 7/13/29 world units,
  faded in over the last twenty blocks, built to Ben 08-04 "textured/styled when closer to it". At
  close range they are finer than the reflection they perturb, so it read as sandpaper catching the sky.
- **The flow filaments are off** (`uStreak`, was 1). The item's own name in the source is "LINES IN THE
  WATER", which is what Ben was reporting. Static in shape and only advected, so they read as printed
  streaks rather than as current.
- **Vertical bars on water columns are fixed.** Every octave is a function of `vW.xz`, constant down a
  vertical face, so the ripple that reads as waves on top read as stripes on the wall of every water
  column. The normal now blends to the geometric one by `vTop`; `vTop` is 1 on top faces so **the sea
  is bit-identical**.
- Both are dials, not deletions: `__hc.waterRefl({streak:1, fine:1})` restores either.
- The **coarse ripple** (0.6/1.7/4.0) is NOT on a dial and must not be removed — it is the wave normal
  itself, and the Fresnel, the sun/moon glade and the reflections are all shaped by it. Removing it
  leaves a mirror.

## Still open: the black band. This is the task.

### The vantage — use this one, do not invent another

`tmp-texel-day.mjs`'s **seawall**, verbatim, reproduced in `bench/tmp-water-band.mjs`:

- walk WEST from the island centre (`__hc.island()`) until ground <= sea+1, step **4 blocks back**
- stand at ground **+3**, look **east along +x** (`yaw = atan2(1,-0)`), pitch `-0.02`
- crop `[0.20, 0.80, 0.47, 0.58]` — a **TIGHT horizontal strip on the horizon**

The crop is the whole trick. A shore vantage invented on 08-11 with a wide crop read **0.04%** and could
not tell the band from noise; this one reads **1.5-1.6%** reproducibly.

### The measurements, clock frozen, noise floor 0.104-0.118

| row | pure black | band |
|---|---|---|
| base | 1.584% / 1.610% | rows 372-389, 18 rows, peak 16.5% |
| `farSeaOn(false)` | 0.885% | 17 rows, peak 9.2% |
| `waterRefl({amt:0})` | 0.379% | 11 rows, peak 4.7% |

Reading:

- It is on **BOTH water surfaces**, not the seam between them. Removing the painted far-sea disc only
  takes it from 1.584 to 0.885. **The "handover fault" hypothesis is wrong** — an earlier note in this
  session called it that from looking at one frame, before it was measured.
- **The reflection branch is ~76% of it** (1.584 -> 0.379 when flattened to `uRing`).
- Essentially every black pixel is ISOLATED — it has a lit neighbour. That is the classic signature of
  a per-pixel NaN or a non-finite value, not of an unlit surface.

### Tried and REJECTED — do not re-run

**A degenerate mirror direction.** `normalize()` of a zero-length vector is a division by zero and
returns NaN, and the reasoning fit the signature perfectly. A `dot(R,R) > 1e-12` guard measured
**completely inert**: 1.584% without it, 1.610% with it, against a noise floor of 0.104. `R` is never
degenerate here. The guard is left in the source with a comment saying exactly this, so it is not
credited with fixing anything.

### THE DETECTOR IS BUILT AND HAS NOT BEEN RUN (2026-08-12)

`__hc.waterNan(1)` paints any water fragment whose FINAL colour is non-finite or negative magenta.
The uniform is `uNanDbg`, ships at 0, and costs one comparison per water pixel when off. It is
written as `!(x >= 0.0)` rather than with `isnan()`, which is unavailable in GLSL ES 1.0 and
unreliable under fast-math; the negated comparison is true for NaN AND for negatives, and both
reach the framebuffer as black.

Run it interleaved from the existing harness, which takes arbitrary JS per row - no new bench
needed and the seawall vantage is already correct:

```
node bench/tmp-texel-day.mjs "0.030/0,0.030/0/__hc.waterNan(1)"
```

The seawall reproduces at pure black 1.579% with isolated black 1.579% - i.e. EVERY black pixel
has a lit neighbour, which is the NaN signature and not an unlit surface. Confirmed again on 08-12.

### What the run means

### The next step, which is one bench run

Put a **non-finite / negative detector** on the FINAL water fragment colour:

```glsl
if(!(gl_FragColor.r >= 0.0) || !(gl_FragColor.g >= 0.0) || !(gl_FragColor.b >= 0.0)) { ... }
```

`!(x >= 0.0)` is true for NaN **and** for negatives, which is why it is written that way rather than as
`isnan`. That single run forks the whole investigation:

- **band disappears** -> something upstream is going non-finite or negative. Bisect the terms between
  `col = mix(base, skyRefl, min(F, uFresCap))` and the end of `main()` — the absorption, the moonglade,
  the sunglade, the ring fade. Note the absorption "reaches 0.59 over a single block and 0.84 over two"
  and there are several `mix()` calls whose weights could overshoot.
- **band survives** -> the colour is legitimately near-zero and the GRADE is crushing it. AgX's
  log-domain toe is documented in this repo as dropping the two lower channels to zero while the top
  one survives. Then the fix is in the water's own floor, not in a NaN guard, and it is the same
  problem as task 2.

`skyAt()` cannot itself return black — it is a mix of positive colours plus a positive sun term — so
whatever is happening, it happens after the reflection is composed, not inside it.

## Not started: the water REBUILD

Ben's full brief for waves / real reflections / depth darkening / underwater rays / foam / momentum
physics is `docs/ONE-LIGHT-WATER-HORIZON-PLAN.md` §2. Read that only when you start that work. The
planar-reflection decision there is **gated on backlog item 9** (forest perf) and must be settled with
a measurement, not a preference.
