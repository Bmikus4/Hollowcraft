# One lighting model, then water, then the horizon

Ben's brief, 2026-08-11. Four builds, in an order set by what the others depend on. Read §0 before
starting any of them — it is the reason the order is not the order he listed them in.

---

## 0. THE ORDER, AND WHY IT IS NOT HIS

He asked for water, then pines and mountains, then fog and depth of field, then "figure out what makes
lighting so inconsistent". But he also defined the target: *"What I mean by hyperrealistic, is that it
fits in with our existing lighting."* Everything in this document is a new surface that has to be lit —
an ocean, a treeline nine hundred blocks out, a range behind it, a fog that sits between them. Building
those against five lighting models and then unifying the models means building each of them twice.

So: **lighting first, and it is the smallest of the four.** It is not a new look. Ben has signed the
current look off ("lighting looks really great"); what he is reporting is that it is applied
*inconsistently*, and the fix is plumbing, not art.

---

## 1. WHY THE LIGHTING IS INCONSISTENT

Ben: *"certain textures on certain blocks looking weird, certain washed night time colors appearing on
random blocks when the ones next to them arent."*

### 1.1 There are five lighting models, not one

Every one of these composes light differently, and a surface's appearance depends on which one it
happens to be drawn by:

| path | sky | sun | block light | canopy | scotopic pass |
|---|---|---|---|---|---|
| voxel atlas (`injectAtlas`) | baked `aSky`, 4-bit per FACE | shadow map, scaled `0.17+0.83*vSky` | baked volume `_bl`, 1 channel | per-vertex Beer-Lambert | yes, `HC_SCOT_ATLAS` |
| props (lambert/phong/standard) | hemisphere + `_propFill`, day only | shadow map, unscaled | three.js point lights only | none | yes, `_open` pinned to 1 |
| foliage (`leafMat`/`foliageMat`) | as atlas | as atlas | as atlas | as atlas | as atlas, plus `uFolTrans` |
| water (`waterMat`) | own uniform | own Fresnel + moonglade | `uLampP`/`uLampC`, 4 lamps | none | partial — takes `uScotG`/`uScotH`, no descent |
| viewmodel (hands, held items) | **none** | **none** | **none** | **none** | **none** |

That table is the bug. A prop standing on a block is lit by a different function than the block is; a
gun in your hand is lit by no function at all.

### 1.2 The 4-bit per-face sky quantum IS "random blocks"

`aSky` is four bits, carried per FACE on greedy quads. So `vSky` arrives in steps of 1/15 = 0.0667 and
every term keyed on it — the ambient scale `0.26+0.74*vSky`, the sun scale `0.17+0.83*vSky`, the
scotopic `_open` gate, the descent — steps with it. Two adjacent blocks whose columns differ by one
sample of sky occlusion get visibly different light, and because the quantity is per-face on a merged
quad it reads as **whole blocks** rather than as a gradient. That is Ben's report exactly, and the code
already carries the finding: the `_open` knee was moved from 0.25 to 0.05 *because* one step of sky was
landing on the wrong side of it.

**This is the single highest-value fix in the document.** Everything else in §1 is tidying.

### 1.3 What to build

One function, `hcLight()`, in a shared GLSL chunk, taking a struct and returning radiance:

```
in:  albedo, world normal, world pos, skyAccess (0..1 continuous), blockLight (rgb), canopyDepth
out: radiance
composed as:  base ambient (sky colour x skyAccess)
            + sun/moon (N.L x shadow x skyAccess-scaled)
            + block light (rgb, additive)
            + emissive
then:         scotopic pass (one gate, one descent, one floor — the rule shipped today)
then:         fog / weather
then:         post (grade, bloom, DoF, height fog)
```

Ben's own words for this: *"Maybe everything in the entire game needs a base lighting level, and the
sun, moon, and external light sources are the only things that could possibly need to actually show
light... One standard way of doing lighting, across the entire game. Then over this, comes weather/fog,
the postfx pass."* That is the layering above, and it is correct.

Ordered work:

1. **De-quantise sky access.** Interpolate `aSky` across the quad rather than flat-shading it per face,
   or raise it to 8 bits. Either kills the block-shaped stepping. Measure with a crop across a shaded
   wall: the metric is the biggest step between adjacent columns.
2. **Extract `hcLight()`** and route the atlas through it with the output bit-identical. This is a
   refactor and must be provable: a paired A/B at three vantages, all three under 0.5 levels of 255.
3. **Route props through it**, giving them a real `skyAccess` sampled from the block volume at their
   position rather than `_propFill`'s day-only constant.
4. **Route the viewmodel through it** — this is item 3 of the old backlog and it closes with this step.
5. **Route water's diffuse term through it**, leaving its Fresnel/reflection/refraction alone.

### 1.4 Traps

- The bar is "no visible change except where it was wrong". Every step needs a paired A/B, not an
  opinion.
- `assert-cave-black`, `assert-unlit-black`, `assert-daylight-black`, `assert-lit-chroma` are the
  regression net. They must be green at every step, and the chest check in cave-black is already
  failing on main — establish that baseline first so it is not blamed on this work.
- Do not change the LOOK while unifying the PLUMBING. If a surface changes, that is either a bug fixed
  or a bug introduced, and both need naming before shipping.

---

## 2. WATER

Ben: *"3 water should be redone entirely, I want hyperrealistic stylized flowing water... waves in the
ocean... beautifully reflective, and flowing... beautiful real reflections, not just a texture... the
water to get darker (like particulate in the atmosphere) the deeper it goes... light rays underwater...
water physics affected by momentum, so if I fall into water from a height I should drop far into the
water... realistic waves, with particle system foam, research this fully."*

### 2.1 What exists

`waterMat` already has Gerstner displacement, Fresnel-Schlick, Beer depth, a moonglade term, a real flow
field (`flowVec` baked per-vertex as `aFlow`), lamp reflections (4 lamps via `uLampP`/`uLampC`) and a
ring-fade handover to the painted far-sea disc. So this is a rebuild of composition and shading, not a
green field. **Read the existing shader before replacing it** — the ring handover, the `WATER_SURF_DROP`
alignment and the still-disc flow fix are all load-bearing and were each paid for.

### 2.2 The seven pieces

1. **Waves.** Sum of Gerstner waves is right and already there; what is missing is a spectrum. Four to
   six waves, amplitude and wavelength from a Phillips/JONSWAP-like falloff, direction spread around
   the wind, so it never reads as one repeating swell. Ocean gets long swell; rivers and shallows keep
   the current-driven ripple they have. Steepness must be capped or the crests self-intersect.
2. **Real reflection.** A planar reflection pass (render the scene into an RT with the camera mirrored
   in the water plane) is the honest answer for a flat sea and is what "not just a texture" means. Cost
   is a second scene draw — the forest is already 12.4 ms of scene draw, so this is gated on §4 perf
   work or on a reduced reflection draw (terrain + sky + horizon only, no foliage detail, half res).
   Screen-space reflection is the cheaper alternative and fails exactly where the sea meets the sky,
   which is the part Ben looks at. **Decide this with a measurement, not a preference.**
3. **Depth darkening.** Beer-Lambert on the *view ray through the water*, not on the surface: colour
   toward a deep tint with distance travelled below the surface, so a shelf reads shallow and a drop-off
   reads deep. This is the "particulate in the atmosphere" he asked for and it is the same maths as
   §4's height fog — build one and reuse it.
4. **Underwater light rays.** God-rays already exist as a post pass (`godrayPass`). Underwater they need
   to key off the sun's screen position through the surface and be masked to the submerged case. Cheap
   version: radial blur of a bright-pass, gated on camera below sea level. Expensive version: raymarch
   the shadow map. Start cheap, measure against a frame.
5. **Foam.** Particle system at wave crests and at the shoreline, spawned where the Gerstner sum's
   Jacobian goes negative (that is exactly where a real crest breaks) and where the surface meets solid.
   This is the piece most likely to sell the whole thing.
6. **Momentum physics.** Entering water carries velocity into the fluid: penetration depth proportional
   to entry speed, then buoyancy plus quadratic drag returning the body to the surface. Splash particles
   and sound scale with entry speed. This is player-facing feel and needs Ben's hands on it, not a
   metric.
7. **Composition.** Whatever the surface does, its diffuse term goes through `hcLight()` (§1) or it will
   not match the shore it touches.

### 2.3 Research to do first

Tessendorf's *Simulating Ocean Water* for the spectrum and the Jacobian foam criterion; the standard
planar-reflection RT setup and its cost on this renderer; how the existing `flowVec` field should feed
wave direction so rivers and sea do not disagree at a river mouth.

---

## 3. THE HORIZON: PINES OFF THE COAST, MOUNTAINS INLAND

Ben: *"make skybox pines look like real pines off the coast, adding the effect when on the shore that
the coast extends far beyond our actual render distance... they should look like the existing forest
extends out beyond the render distance... mountains should be only inland, not out to the ocean, so when
looking inland, the player should see mountains behind the trees."*

And the caveat, which is the whole engineering problem:

> *"these should not move, or if they do move, their shapes should not change, this was a highly
> important caveat in the old skybox pines, when moving around as the player the mesh on them would
> recalculate, and they would look like they were morphing."*

### 3.1 Why the old one morphed, exactly

The mask was **recomputed from the player's position**: 128 rays cast from `player.pos` outward past the
fog wall, sampling `surfaceH`, re-uploaded whenever the player moved more than 2 blocks. So every ray's
sample points moved with the player, and the silhouette they described changed shape as he walked. It
was a per-frame *derivation* of a thing that should have been a fixed *object*.

**The rule for the rebuild: the backdrop is a property of the WORLD, not of the camera.** Sample the
heightfield on a fixed world-space grid, resolve it once, and let the camera move through it. Parallax
is then correct for free, and nothing can morph because nothing is recomputed.

### 3.2 The build

- **A ring of billboard trees at fixed world positions**, not a shader silhouette. Positions resolved
  once from `surfaceH` on a world grid (seeded, so it is identical every session and across
  multiplayer). Each tree is a quad with a real pine texture, sorted back to front, drawn beyond the
  render wall.
- **Depth, in three or four bands.** Ben asked for "some kind of depth effect": bands at increasing
  distance, each hazed harder toward the air colour, is what makes a treeline read as a forest with
  extent rather than as a cut-out. This is the one thing the old mountain shader got right and it is
  worth carrying: *the depth is in the aerial perspective, not the geometry*.
- **Lit by `hcLight()`** with a sun term, so the band facing the sun lifts and the far bands go blue —
  the reason to do §1 first.
- **Haze from the terrain's own fog term evaluated at that distance.** This is the second thing the old
  layer got right (see the WHY-THERE-WERE-SKYBOX-PINES comment in `index.html`): every version that
  picked its own colour read as a sticker on the sky.
- **Mountains: inland azimuths only.** A per-azimuth landward mask resolved once from the island's
  geometry, so a range never stands over open sea. Same banding and haze treatment; the old two-range
  aerial-perspective finding stands. Reference images needed — Ben said "get images somewhere" — and
  the target is a real coastal range at 15–40 km, which is mostly silhouette and haze, not rock detail.
- **Where it stops.** The backdrop must dissolve into the same air the last streamed chunk fades to, or
  the seam returns. That is a measurement (crop the join, compare the two sides), not an eye.

### 3.3 Traps

- `_uPine` was rewritten every frame by the day cycle, so external colour dials failed silently. Any new
  dial must be read back live from the material.
- A tone-mapped debug view is not a number: anything over ~0.2 linear renders near-white.
- The old layer cost +0.22 ms at the shore and +0.08 ms in the forest — i.e. under the noise. A billboard
  ring will cost more than that; price it before shipping, interleaved, never blocked (this box has a
  failing cooling fan and blocked runs measure thermal drift).

---

## 4. HEIGHT FOG AND DEPTH OF FIELD

- **Height fog** is built, off, and never calibrated (`1bc7172`, corrected `9edc0c6`). The ray needs no
  matrix inverse. The open question is whether it grades with distance at all, and it must be settled on
  the FINAL image with a near/far crop pair at a vantage whose crops are genuinely at different ranges.
  Useful density is well under 0.003. Share the Beer-Lambert integral with §2.3.
- **Depth of field** is not built. A physically-grounded DoF (circle of confusion from focal distance,
  aperture and the depth buffer) is a post pass. The two risks are the viewmodel — hands and held items
  must NOT be blurred, the same guard the motion blur needed — and the horizon, where a DoF that blurs
  the backdrop will fight §3's haze.

---

## 5. HOW THIS GETS VALIDATED

Ben: *"built seamlessly (carefully, with testing, critiquing, and truly grounded validation)."*

- Every claim in a commit message carries the number that proves it.
- Every visual change gets a paired A/B at a vantage that provably contains the thing being measured —
  three crops in this bench's history did not, and each cost a day.
- Every measurement is taken against a noise floor with the dial held still, and with the wind and clock
  pinned (`__hc.freezeT`, `__hc.setTime`), or the sea and foliage move 20% of the frame on their own.
- Anything Ben has signed off is a regression test before it is an opinion: the black night, the daylight
  frame, the lit cave, the shaded forest floor.
