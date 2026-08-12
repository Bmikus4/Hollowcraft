# TASK 2 — black texels everywhere, and matted surfaces

## What Ben reported, 2026-08-11

> "the black voxels are absolutely everywhere, full regression. WHAT THE FUCK!!!!!!. ALSO HALF OF THE
> surfaces in game are completely matted, like no texture at all."

Three screenshots on the Desktop: `Screenshot 2026-08-11 122946.png`, `195156.png`, `195517.png`.

**These are TWO different faults and they must not be chased as one.**

## Fault A — matted surfaces, no texture

Almost certainly **already fixed**, and it was this session's doing. The `hcLight()` extraction was in
the tree Ben was playing, appended to `THREE.ShaderChunk.lights_pars_begin` — a chunk every lit material
in the game includes — and it had never been compiled. One error there breaks every lit material at
once, which is exactly "half of the surfaces". It was reverted in `39fa2d2` (via
`bench/make-preextract.mjs`, the exact inverse of the eleven edits).

**First action: ask Ben whether the matting is gone.** That single answer splits fault A from fault B
and is worth more than any bench run.

## Fault B — black texels

**Not reproduced. Do not trust any number below as a measurement of what Ben is looking at.**

What is known:

- **It predates all of 08-11's lighting work.** The 12:29 screenshot already shows it, before the texel
  rule commits (`f1eeb7c` 13:21 onward). This is the standing fault, not a fresh regression.
- **Per-corner sky is NOT the cause.** Measured with `bench/tmp-blacktexel-forest.mjs`, off vs on,
  interleaved, clock frozen, in a wood: noon pure black **0.107% -> 0.053%**, isolated black
  **0.071% -> 0.013%**. It slightly REDUCES black. It has been turned off by default anyway (task 4).
- **Reproduction attempts failed rule 1, twice.** A dirt wall in canopy shade reads 0.019%; a wooded
  site reads 0%. Looking at the frames showed why the second was worthless: the site was chosen by
  "most cover overhead", which put the camera INSIDE a tree. Frames are visibly full of black; the
  crops are not. The vantage is still wrong.

## The one lead worth following

The **scotopic wash** is the only mechanism in the game that produces BOTH symptoms from one cause: it
washes colour toward luminance (which is "matted, no texture") and its descent pulls toward black. Its
dials are all at documented shipped values (`_scotG`, `_scotH`, `_scotK` — verified unchanged across
the last six commits), so if it is firing where it should not, the fault is in its GATE, not its
strength. `?dbg=lit` draws the delivered-light gate and `?dbg=cave` draws the descent gate — but see
ground rule 6: those are pictures, not numbers.

The other candidate is the texel floor's own design, recorded in the source: `_scotK[3]` is a minimum
rendered luminance applied as a **SCALE**, deliberately, because a scale cannot desaturate. **A scale
cannot lift a fragment that has reached exactly zero.** Anything that pushes a texel to true black is
therefore past saving by the rule that exists to save it.

## How to get a vantage that actually contains it

Ask Ben for coordinates, or for the seed and a screenshot with F3-ish info. Failing that: the
established harnesses with known-good vantages are `bench/tmp-texel-day.mjs` (a dirt wall in canopy
shade at 1.5 blocks, plus the far water at the shore) and `bench/tmp-lightpool-speckle.mjs` (a lantern
in a night wood — the frame Ben photographed in an earlier round). Prefer extending those over
inventing a new site: two new sites were invented on 08-11 and both measured nothing.
