# TASK 4 — one lighting model, steps 2-5

## Ben's architecture, verbatim

> "Maybe everything in the entire game needs a base lighting level, and the sun, moon, and external
> light sources are the only things that could possibly need to actually show light. The moon and sun
> should shine light on the entire map, but the light direction of the sun should realistically
> project/determine shadows. One standard way of doing lighting, across the entire game. Then over
> this, comes weather/fog, the postfx pass."

That last sentence is the architecture and it is right. The full spec is
`docs/ONE-LIGHT-WATER-HORIZON-PLAN.md` §1 — read it when you start, and read §1.1's table of the five
lighting paths, which is the actual bug.

## Step 1 — per-corner sky access. SHIPPED, TURNED OFF, AND BACK ON AS OF 08-12 (`11ba56c`).

**Read the section below for the mechanism, but its conclusion is out of date.** The cost that got
it disabled - a night-canopy crop reading pure black 0.889% -> 3.145% - does not reproduce at any
vantage that contains the fault: a wood at noon over two bearings gives 0.107% -> 0.053%, and a
lantern in a night wood gives isolated black 2.377% -> 1.915%. Both say it REDUCES the speckle.
The theory that justified the disable - corner averaging pushing fragments to exactly zero, where a
scale cannot lift them - was tested directly and is inert (`be81139`); those fragments are not at
float zero. The regression net is at its documented baseline with it on. `_SKY_SMOOTH = 0` reverts.

## The original note, kept for the mechanism and the measurements


**What it does.** `aSky` was a 4-bit scalar carried PER FACE, so `vSky` arrived in steps of 1/15 and,
being face-wide on a merged greedy quad, read as **whole blocks** differing from their neighbours —
Ben's "random blocks". Each quad corner now averages the four air cells meeting there and the hardware
interpolates.

**The constraint that must not be forgotten.** Sky is packed into the greedy mesher's mask integer and
two faces merge only when their masks are **EQUAL**, so sky is part of the **MERGE KEY**. Widening it to
8 bits fragments every quad that currently merges — a triangle bill on exactly the surfaces the forest
already pays 1019k triangles for. So the mask stays 4 bits and the smoothing happens at EMIT. Verified:
**997252 quads with it off, mean and max — identical to the digit.**

**Measured**, at the worst-spread quad, square-on along its own normal at 2.6 blocks, noise floor 0.19:
adjacent-column step **8.55 -> 6.30**, row step **6.03 -> 4.64**, crop median holding 37.02 -> 36.34.
The seam flattens, the level does not move. Flat quads 100% -> 96.73%. Mesh time **+1.0 ms/chunk**.

**Mean, not max, and that is measured.** Corner MAX cannot darken (the merge key guarantees each
corner's cell set contains a cell of its own quad) but it overshoots: a shaded quad beside open sky
takes 1.0 at that corner and the step went UP to 8.74. Mode 2 is kept as the record of why mode 1 was
chosen.

**Why it is off.** `_SKY_SMOOTH = 0`. It is measured NOT to cause Ben's black texels (task 2), but it
is unproven at the scale of the game, its benefit is one flattened seam at one vantage, and "no black
pixels" is a rule Ben has signed off four times. Its one named cost was night canopy pure black
0.889% -> 3.145% at a single crop — the texel floor is a **scale** and a scale cannot lift a fragment
pushed to exactly zero.

**To ship it properly**, the floor has to be able to reach a zeroed fragment. That is a change to the
floor, not to the mesher. `__hc.skySmooth(0|1|2)` remeshes the loaded world and is the A/B;
`__hc.skyQuads()` reports what the mesher wrote, including each steppy quad's world position and normal
so a harness can **aim** at the fault instead of searching for it. `bench/tmp-sky-dequant.mjs` takes
`HC_QUAD=x,y,z` to pin the vantage — necessary, because the worst-quad list depends on the mode and
probing per-row silently changed the subject between two runs.

## Step 2 — extract `hcLight()`. ATTEMPTED AND REVERTED. Read this before retrying.

It was written, **never compiled, never measured**, and left in the tree Ben was playing. Reverted in
`39fa2d2` via `bench/make-preextract.mjs`. Two findings survived and both matter:

### It cannot be one `hcLight()` returning radiance from scratch

The plan's §1.3 sketches `in: albedo, normal, pos, skyAccess, blockLight, canopyDepth -> out: radiance`.
**That shape is not reachable bit-identically.** These terms do not compute light; they SCALE and ADD to
quantities three.js has already accumulated — `irradiance` from the hemisphere and ambient lights, and
`reflectedLight.directDiffuse` from the sun and every point light, both already carrying the shadow map.
A from-scratch `hcLight()` would have to reimplement three's own light loop, which is a rewrite with a
new look, not the plumbing job Ben asked for. **The extraction must preserve the seam: functions take
the accumulated value in and hand it back.**

### Float math is not associative, and the bar is 0.5 of 255

`((i*a)*b)*c` and `i*((a*b)*c)` differ in the last bit. Any function applying more than one factor must
take the accumulator and apply the factors **in the shipped order**, rather than returning a product for
the caller to multiply. That costs nothing and makes the refactor bit-identical **by construction**
instead of merely close.

### The shape that was written (and is worth reusing)

A JS const `HC_LIGHT_GLSL` appended to `THREE.ShaderChunk.lights_pars_begin` — included by every lit
shader three has, so the atlas, props and foliage all reach it from one place, which is what makes steps
3 and 4 a call rather than a copy. Uniforms passed as **parameters**, not named, because props do not
have `uSkyCurve` or `uCanopy` and a chunk that named them would fail to compile on every unconverted
material. Terms: `hcSkyDir`, `hcSunShade`, `hcCanopy`, `hcSkyAmbient`, `hcSkyDirect`, `hcFlicker`,
`hcPointGlow`, `hcHeldGlow`, `hcFlashGlow`, `hcCloudUV`, `hcCloudMask`, plus `hcAmbient` and
`hcEmitters` which own the ORDER.

### The danger

`lights_pars_begin` is included by **every lit material in the game**. One GLSL error there breaks all
of them at once. Compile it before it goes anywhere near a tree Ben is in.

### The proof required

Paired A/B at three vantages, all under **0.5 levels of 255**. `bench/make-preextract.mjs` builds the
"before" file by applying the exact inverse of the edits to the CURRENT `index.html` — which is the
honest baseline, because `HEAD` also carries the other session's uncommitted work and then a moved pixel
would have two possible authors. Every replacement in it errors loudly if its token is missing, because
a string replace that misses fails SILENTLY and would produce a "before" that is really an "after",
reading a perfect 0.0.

## Steps 3-5 — not started

3. **Props through it**, with a real sampled `skyAccess` from the block volume instead of `_propFill`'s
   day-only constant.
4. **The viewmodel through it.** Hands and held items are currently lit by **nothing at all** — no sun,
   no shadow, no ambient, no canopy, no block light, no scotopic pass. Start at `attachGunHand`. This
   closes the old backlog item "everything visual must apply to the hands and held items".
5. **Water's diffuse term through it**, leaving Fresnel/reflection/refraction alone (that is the water
   rebuild). This is also one of the two candidate fixes for task 3's black band.

## A real finding nobody has chased

`assert-unlit-black` fails on *"a sealed room reads the same at noon as at midnight"* — **noon 7.37 vs
night 3.17**. The day is reaching an enclosed space that by construction has no sky access. That is
precisely the class of inconsistency this whole task exists to remove, and it is sitting in a guard
output waiting for someone to look at it.
