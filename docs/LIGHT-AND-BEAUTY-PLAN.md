# Light and beauty — the plan, the measurements, and the traps

Written 2026-08-04 at the end of the session that shipped the ocean plane, the contact-occlusion pass, the
sky-coloured ambient and the water sunglade. Ben asked for a full research protocol for making the game
look spectacular at a decent frame rate, then for everything in this session's head to be written down for
the next one. This is that. It is a working document, not a record: correct it as things are measured.

---

## 0. The budget, and what it implies

Target 7.14 ms/frame (140 fps). Measured this session on Ben's box, rd=8, 1000x560, over water and forest:

| quantity | measured |
|---|---|
| CPU frame median | 1.9 – 3.9 ms |
| GPU total | ~0.7 ms |
| composer segment | 0.2 – 1.5 ms |
| draw scope | 1.4 – 3.9 ms |

**The frame is CPU/draw-bound with the GPU nearly idle.** That one fact sets the strategy: spend on
fragment shaders, refuse anything that adds vertices, chunks or per-frame CPU until it has been A/B'd.
Roughly 3 ms is available, and a fragment-shader effect at this resolution costs hundredths.

### CORRECTION, 2026-08-04 — that licence has expired at the water sites

Re-measured with the tooling §5 mandates, same box, rd=8, 1000x560. The table above still holds where
it was taken — `perf-run --scenes B1o` (standing in the overworld) reads **2.02 ms median, CPU 1.85,
draw 1.83, 323 draws**, unchanged. But the census sites are a different story:

| site (`perf-census --dur 10`) | median | draw | draws |
|---|---|---|---|
| shore | **7.70 ms** | 6.53 | 805 |
| forest | 6.27 | 5.99 | 479 |
| fogbank | 5.59 | 5.33 | 288 |
| spawn_night | 3.70 | 3.71 | 286 |
| underwater | 2.99 | 2.14 | 178 |

**`shore` is over the 7.143 ms target, and the GPU is not idle there.** Paired A/B at the shore with
`__hcPERF.nullFrag`, 4 pairs of 8 s: frame **7.53 → 5.17 ms** and **GPU 4.83 → 2.08 ms**. GPU at 4.83 ms
of a 7.14 ms budget is nearly seven times what the table above records, so *"a fragment effect costs
hundredths"* must not be quoted as licence at any water site again. Price each one.

Two honest limits on that number: `nullFrag` also dropped draws 810 → 557, so the −1.74 ms frame delta
is an upper bound on fragment cost rather than an isolation of it; and none of these sites has a
pre-today baseline, so the `shore` figure is **not attributed** — several sessions have been adding
props (sandbags, benches, chainlink, hanging lights) and 805 draw calls is where to look first. What is
attributable: `shore` runs at `setTime(0.35)`, full daylight, where the night-gated moonglade branch is
not taken at all, and the ocean-band and ring-landing edits are one `mix` each.

---

## 1. Ben's outstanding visual notes, verbatim, with the code each lands in

1. *"skybox pines are not vibrant/matching, the brown parts of them are not dark enough"* — `pineMat`
   (canopy band) and `pineUnderMat` (the woody band under it: `uBand`, `uFogMul`, `uFogCap`). Match value
   and hue against the REAL trunks and canopy in the same frame, not in isolation.
2. *"the volatility of the peaks is slightly too much"* — the treeline silhouette's noise amplitude in
   `pineMat`. Judge with (1), since flattening the peaks changes how the band's colour reads.
3. *"water is too dark/not transparent enough when close to it"* — three lines in `waterMat` in tension:
   `absorb = 1 - exp(-vDepth*0.9)`, `col = mix(col, vec3(0.002,0.008,0.012), absorb*0.97)`, and
   `alpha = clamp(0.72 + 0.26*absorb + 0.08*F, 0, 0.99)`. Shallow water gets a 0.72 alpha floor and a
   ten-metre absorption curve over a metre of sand. The far-sea disc carries a fixed `aDepth` of 12, so
   shallow chunk water can be cleared up without changing how open ocean reads.
4. *"the skybox/horizon no longer stretches down without a dark blue separation, the sky should actually
   run downward all the way down into the ground"* — the ocean CYLINDER's sea band (`oceanMat` on
   `_horizGeo`, with `uHorizonBlend`). Now that the far-sea disc covers water everywhere, that band is
   what makes the separation. Retiring or fading it is the change he is asking for. NOTE: this may be a
   regression from this session's ocean-plane commit (`ec43990`), which moved the disc from `SEA-0.03` to
   the real surface `SEA+0.85` and made it a disc rather than an annulus — both change where its rim meets
   the cylinder. Check that first.
5. *"a weird dark stripe on the horizon pines"* — see §2, it is probably not the band at all.
6. *"dark/overcast clouds on thunderstorms"* — `weather.overcast` / `_uCloud`. `updateSky` already dims
   sun, hemi and ambient by `oc` and greys the sun's colour; the clouds' own value never darkens, so a
   storm reads as a dim scene with cheerful clouds. Also the rain streaks draw near-white over a dark sky
   (visible in Ben's 09:55 screenshot) and want the sky's own value.
7. *"clouds blocking the sun"* — a scrolling cloud-shadow mask multiplying `reflectedLight.directDiffuse`
   at the same injection point where `vSky` already scales direct light (see `injectAtlas`). One noise
   sample in a fragment shader. **Highest value per millisecond on the whole list**: moving shadow across
   the ground, and it makes the god rays honest, since shafts should appear where the mask breaks.
8. *"lighting causing this black voxeling/texture pixeling"* — see §3. Same family as the historical "dark
   faces in the woods".

---

## 2. The dark blob on the treeline — diagnosis before fix

Seen in THREE unrelated frames this session (900 blocks offshore, 950 offshore, and Ben's 09:55 shot),
always at about the same bearing: **it is fixed to a place in the world, not to the camera.** It is a
localised soft-edged, vertically streaked black smear where the pines meet the terrain — not a stripe
across the band.

Two candidates, distinguishable in one run:

- **The skylight bake, on real trees.** `leaves_core` inflating `htop` drives `vSky` to 0, and the terrain
  shader strips BOTH ambient and direct where `vSky` is 0. That is the exact mechanism behind the old dark
  faces, fixed with the `occludesSky` mask; a residual cluster renders precisely like this, and the
  softness is the light volume's trilinear sampling.
- **The band itself** — the canopy mask having a dark region, or the woody band showing through where the
  canopy alpha reaches zero.

**Decisive test, one run: load with `?dbg=sky`**, which renders per-face baked skylight as greyscale, and
look at that bearing. Black there while its neighbours are white ⇒ it is the bake, and it is a WORLD
lighting bug that also affects the forest you walk through. Otherwise `__hc.horizonDbg(false,true)` says
which layer owns it.

---

## 3. The black voxel speckle — the mechanism, and the fix to try

Ben's 09:58 screenshot: trunks and grass carry scattered PURE BLACK texels in a dither pattern at night
under a lantern. It is not the texture. The chain is:

1. `paintTile` bakes per-texel value jitter into every tile (e.g. `jit(r,0,26)`).
2. The terrain shader multiplies albedo by irradiance, where `irradiance *= (0.26 + 0.74*pow(vSky,1.15))`
   and block light arrives as `vec3(3.6,1.95,0.80) * pow(_bl,1.45) * _fl`.
3. At night with `vSky` near 0 the only remaining term is `AmbientLight(0x1a2130, 0.12)` scaled by
   `lerp(0.055, 0.32, day)` — of the order of 0.007.
4. AgX has a strong toe. The darker half of each tile's texel jitter falls below the crush point and lands
   on exactly 0 while the brighter half survives ⇒ salt-and-pepper black texels.

Fixes to try, cheapest first, each measurable in one paired frame pair:

- A floor on the shaded result that sits ABOVE the tone curve's crush point, rather than a floor on the
  light: e.g. clamp the final `gl_FragColor.rgb` to a small non-zero minimum in the terrain shader, or lift
  `irradiance` with `max()` after the `vSky` scale.
- Per-hour `toneMappingExposure` (it is pinned at 1.05 all day) so night sits above the toe instead of
  inside it.
- Give the night ambient a COLOUR with some value rather than near-zero grey; the hemisphere is now
  sky-tinted (`b067a18`) but `AmbientLight` at 0.055 is doing nothing but crushing.
- Reduce the tile jitter's amplitude only as a last resort: it is what keeps surfaces from looking flat in
  daylight.

---

## 4. The protocol — tiers, in the order to take them

**Tier 1, free, one sitting.** ⇒ then ONE frame set at dawn/noon/dusk/night over water and forest so Ben
judges the whole look at once instead of five times.

1. **Moonglade sign fix.** Dead code: `reflect(+uMoonDir, N)` points down into the water, `dot(Rs,V)` is
   negative for any camera above the surface, `max(...,0)` zeroes it. Night water has NO specular at all.
   One character. (The sun's version had the same bug — fixed in `dc71963`, see §6.)
2. **Exposure curve per hour** — `toneMappingExposure` is fixed at 1.05.
3. **Fog colour from `_uSky`**, the same source the ambient now reads, so sky/fog/water stop drifting apart
   at dawn and dusk.
4. ~~**Shadow penumbra** — `sunLight.shadow.radius` is untouched with a 46-block frustum.~~
   **DEAD LEVER, measured 2026-08-04.** `renderer.shadowMap.type` is `PCFSoftShadowMap` (`setSoftShadows`,
   and `BasicShadowMap` when soft shadows are off). three.js honours `shadow.radius` for `PCFShadowMap`
   and VSM only; PCFSoft uses a fixed tap pattern and ignores it. `__hc.shadowSoft()` reports
   `honoursRadius:false`, and dialling radius 1 → 25 changed nothing. **Radius is untouched because it
   does nothing here, not because nobody got to it.**
   Buying real penumbra means changing the FILTER — PCF with a radius, or VSM with its blur passes — and
   that is a GPU cost, at a moment when the correction in §0 puts the GPU at 4.83 ms of a 7.14 ms budget
   at the shore. So it needs its own priced A/B and it is Ben's call, not a quiet swap. `__hc.shadowSoft({type})`
   exists to price it. Do not "just set radius".
   `bench/tmp-shadow-radius.mjs` holds the probe; note its penumbra-width metric is NOT trustworthy — it
   returns the sharpest edge anywhere in the crop (a block boundary, a leaf), which is why it read 1–2 px
   for every setting including ones that do work. The `honoursRadius` reading is the finding.
5. **God-ray strength by sun elevation** — the pass is gated by quality only; shafts should be strongest at
   low sun, absent at noon.

**Tier 2, cheap, target <0.5 ms each, each behind its own PERF flag.**

6. **Cloud shadows on the ground** (Ben's note 7). Do this FIRST of the tier — best value per ms on the list.
7. **Storm cloud value/colour ramp off `oc`**, and rain streaks taking the sky's value (note 6).
8. **Directional skylight.** `vSky` is a per-face SCALAR, so a canopy floor and a canopy wall are lit
   identically and shade has no direction. Three bands (up/horizontal/down) is a mesher attribute plus a
   few ALU. Biggest realism lever left. Mesher change ⇒ its own window.
9. **Coloured block light.** The volume carries intensity only, so a lantern cannot make a cellar's shadows
   amber and the red shrine torch cannot tint anything. Add a tint channel.
10. **Water close up** (note 3), plus shoreline foam from a depth edge and a second wave-normal octave.
11. **Entity contact shadows** — creatures get shadow-map only, inside 46 blocks.

**Tier 3, expensive, only with a paired A/B in hand.**

12. **Shadow distance.** Nothing beyond 46 blocks casts, which is the biggest landscape gap; cascades cost
    draw calls, the one resource that is short. Measure before believing.
13. Planar or screen-space water reflection (1–3 ms); TAA instead of FXAA to kill the shimmer that reads as
    "game"; bloom quality.

---

## 5. How anything here gets validated

- One `PERF` flag per change, so it is A/B-able and revertible without a rebuild.
- **Cost:** `bench/perf-flag-ab.mjs`, paired in ONE page, alternating A/B/A/B, at four census sites
  (forest, dungeon hall, beach, offshore). Two separate runs cannot resolve a sub-millisecond pass on this
  machine — this repo has been burned by that already.
- **Image claims:** grain off (see §7), clock pinned at every shot, control pair taken FIRST, mean for thin
  effects, median where bright things move. That is `bench/assert-ssao.mjs`'s pattern and it exists because
  four separate confounds each looked exactly like a broken pass.
- One durable `assert-<feature>.mjs` per shipped item, committed.
- `node C:\Users\thera\fleet\hc-guard.mjs 12` after every push, and it must say **0 reverted**.

---

## 6. What shipped this session (for context when reading the diffs)

| commit | what |
|---|---|
| `d60718b` | dungeon hunt: `moveEntity` rejected every heading while standing on a block shorter than one (`floor(gy)` is the block's OWN cell for a fractional surface — `ceil` now); no cover-orbiting inside the lair; no blink out of the lair; containment clamp `max(fy+7, player.y+3)` |
| `ec43990` | far sea is a DISC at the real water surface (`WATER_SURF_DROP`), not an annulus 0.91 blocks under it |
| `b067a18` | hemisphere colour follows `_uSky` with a warm ground bounce, instead of a fixed navy at every hour |
| `ac1e97b` | contact-occlusion pass (depth-difference, 8 taps, 3 rings, sky skipped) + grade `uSat` 1.3 → 1.06 |
| `3d1e8d8` | `bench/assert-ssao.mjs`, 6/6 |
| `dc71963` | water sunglade + `__hc.sunDir()`; three faults were hiding it (see §7) |

Hooks added this session, all useful for the work above: `__hc.sunDir()` (direction, elevation, and the
yaw/pitch that FACE the sun in the game's convention), `__hc.ssao(on,{strength,radius,bias})`,
`__hc.wretchFoot()`, `__hc.wretchAt(d)`, `__hc.unGrab()`, `__hc.lairNodes()`, `__hc.groundY(x,z)`,
`__hc.cabinInfo()`, `__hc.handSize()`, `__hc.itemFit()`, `__hc.objectives()`, `__hc.hwTint()`,
`__hc.hwAt(d)`, `__hc.pitScan().samples2`.

---

## 7. Traps this session paid for — do not re-learn these

- **`reflect(+dir, N)` vs `reflect(-dir, N)`.** `uSunDir`/`uMoonDir` point FROM the surface TOWARD the
  light, so the mirror direction is `reflect(-dir, N)`. The wrong sign points down into the water and the
  term is exactly zero everywhere, forever, silently.
- **Surface highlights must be added AFTER the Beer-Lambert absorption**, which mixes 97% toward near-black
  in deep water and erased the glade entirely.
- **Gates on sun elevation must outlive the geometric horizon.** `smoothstep(0.0, …, sunY)` switched the
  glade off at sunset, the one moment it is strongest. Fade in from about −0.06.
- **Aiming at a reflection needs pitch = −elevation.** A mirror image of something 40° up lies 40° DOWN;
  looking level with a high sun frames the sea that reflects the sky and reads as "no effect".
- **Animated film grain (0.06) makes any two frames differ across a sixth of the screen.** Off-vs-off
  control measured 15%. Set `localStorage.hollowcraft_grain='0'` in a Playwright init script BEFORE the
  module runs, because the composer reads it at build time.
- **The clock keeps running.** `setTime` once is not enough over a long run: the sun moves, its bloom moves
  further, and that alone put a 3.9-level mean change over a sky crop. Pin it at every shot.
- **`__hc.look(x,y,z)` takes a WORLD POINT; `__hc.cam({yaw,pitch})` takes angles.** Calling `look(yaw,pitch)`
  makes the camera's yaw NaN and every screenshot comes back as the renderer's clear colour with no error
  anywhere. `look()` now refuses non-finite input.
- **`groundYAt(x,z)` with no reference height starts at `opaqueTop`, which is the CANOPY.** Use
  `__hc.groundY` (surfaceH) for terrain, or pass a reference y. assert-cabin measured 422 leaves for weeks.
- **`setTime` is 0=midnight, 0.5=noon, but `uDay` is a DAYLIGHT AMOUNT, not the clock.** At t=0.5 the sun
  measured −0.16° elevation on this world; use `__hc.sunDir().elevDeg`, never the clock, to know where the
  sun is.
- **`index.html` is co-edited by two live sessions.** Commit the WHOLE file, never a hunk filter, then run
  hc-guard. Hunk-filtering displaced five commits' work out of HEAD on 2026-08-03.
- **A comment placed mid-line eats the rest of the line.** It has happened twice: it killed the reload
  animation and every reload, and it killed `hurtWretch` so no gun could damage the Wretch.

---

## 8. Local dev server

`PORT=8123 NO_OPEN=1 node server.js` from the repo, then **http://127.0.0.1:8123/index.html**. Port 8080 is
unbindable on this box (Windows reserves the range) and something unrelated already answers there — check
the served file contains a marker from today's work before trusting a frame.
