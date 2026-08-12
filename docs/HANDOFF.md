# Hollowcraft — handoff. Read this file and nothing else first.

Rewritten 2026-08-12. Everything described here is committed. **Check `git log origin/main..HEAD`
before you start** — the other session pushes constantly and twice today HEAD was unbuildable.

**This document is an index, not a briefing.** Each task names the ONE file to read when you start
that task. Do not read them all.

---

## BEFORE YOUR FIRST EDIT, AND BEFORE EVERY COMMIT

```
node --experimental-vm-modules bench/syntax-check.mjs
node bench/assert-imports.mjs
```

Both take milliseconds and open no browser. The second one is new today and it exists because
**production served a build that did not run at all**: `index.html` was committed importing
`giantessDeathFall` from a module that was still uncommitted on disk. An ES module that fails to
LINK never executes a statement — no `__hc`, no `startGame`, no watchdog, and the menu sits on the
key art for ever. It reads exactly like a loading bug and is not one. It has now happened **twice
in one day**, so assume it will happen again.

`assert-imports` reads `git show HEAD:` by default, NOT the files on disk. That is the whole point:
every other harness boots the dev server, which serves the working tree, where the module is
present and fine. Only git or a browser pointed at the deploy can see the break.

**Always read `docs/handoff/00-ground-rules.md` before your first edit.** Short, and every line is a
fault that has already cost a session.

---

## THE ORDER OF WORK

| # | task | read when you start it | state |
|---|---|---|---|
| 1 | **Black texels / "textures don't show in dark areas"** | `docs/handoff/02-black-texels.md` | **START HERE.** Fix measured, shipped OFF, needs the guard run. |
| 2 | Water: the black band on the far water | `docs/handoff/03-water.md` | Detector built and NOT YET RUN — one bench run forks it. |
| 3 | Water: the actual rebuild | `docs/ONE-LIGHT-WATER-HORIZON-PLAN.md` §2 | Not started. Ben's biggest open ask. |
| 4 | One lighting model, steps 2-5 | `docs/handoff/04-lighting.md` | Step 1 SHIPPED ON. Step 2 reverted, read before retrying. |
| 5 | Horizon, fog + DoF | `docs/ONE-LIGHT-WATER-HORIZON-PLAN.md` §3-4 | Not started. |

Ben's standing priorities: *"cohesion and beauty are your two main goals"*, *"hyperrealistic"* means
*"it fits in with our existing lighting"*. **His current order, verbatim (08-12): lighting,
texturing and water now — the FPS pass is later.** No status documents, no completion reports, no
emoji. Two lines and the numbers.

---

## WHAT CHANGED TODAY

- **Task 1 of the old handoff — "the game never loads" — is SOLVED and it was never a loading bug.**
  It was the unresolved import above. Everything the old handoff said about the loading gate, the
  streaming budget and `_playAt` was chasing the wrong thing. Production now boots in 6.0 s, 9/9
  chunks, gate-released, no page errors.
- **Per-corner sky access is ON** (`_SKY_SMOOTH = 1`, `11ba56c`). The cost it was disabled for did
  not reproduce at any vantage containing the fault. Regression net at documented baseline.
- **The world is no longer rendered behind the opaque loading plate** (`a6f6638`). Small win, ~0.6 s
  and a much tighter spread; it does NOT fix a slow machine.
- **Both texel floors are measured to be actively harmful to texture** and a replacement is built
  and dialled off. This is task 1 above.

## THE STANDING NUMBERS

Regression net, real baselines, all confirmed today with per-corner sky ON:

```
assert-cave-black      15/18
assert-unlit-black      9/11     (flaky: the foliage check has read both 0.87% and 3.074%)
assert-daylight-black    6/6
assert-lit-chroma        6/6
```

The two `unlit-black` failures are pre-existing. One is worth knowing: *"a sealed room reads the
same at noon as at midnight"* — noon 7.37 vs night 3.18. **The day is reaching an enclosed space
that by construction has no sky access.** Nobody has chased it and it is exactly the class of
inconsistency task 4 exists to remove.

---

## THE BACKLOG, EVERYTHING OPEN

| # | item | state |
|---|---|---|
| 6 | Water rebuild | task 3 — the big one, unstarted |
| 7 | Slow machines reach the world only by watchdog | at 6x CPU throttle the gate never releases; the watchdog fires at `LOAD_MAX_MS` and hands over terrain with no trees. What it waits on is the MESHER — `worldMeshed` tracks the gate's 3x3 exactly, so nothing else competes. Render distance is NOT the lever (rd 12 changes the load path by nothing; the gate waits on `LOAD_READY_R`). |
| 8 | Two coloured lights in one chunk | one channel + a per-chunk dominant tint. **BLOCKED on Ben's cave to aim at.** |
| 9 | Residual canopy black | alpha cutouts showing unlit space through leaves. Needs geometry, not a shader term. |
| 10 | Forest perf | 12.4 ms of the forest's 13.9 is scene draw, 1019k triangles vs the shore's 266k. **Gates the planar-reflection decision in the water rebuild.** Ben says the FPS pass is later — this is the exception, because task 3 depends on it. |
| 11 | Ben has never judged | the sun arc, the skylight flood, and now per-corner sky. |
| 12 | Desktop executable | asked about 08-12. Answer given: no help for lighting/texture/water/load, real wins for vsync uncapping, build ambiguity, tab throttling and Steam. Do it before the FPS pass, not now. |
| 13 | `_chunksReadyAround(r)` ignores its argument | it hardcodes a 3x3. `LOAD_READY_R = 4` is a dead constant and tuning it does nothing. |

---

## THE TRAPS LEARNED TODAY — these are not in the old ground rules

1. **Blocked benchmark runs on this box measure the cooling fan.** The identical build measured
   8.9 s and 13.4 s twenty minutes apart, three times the size of the effect being chased. Every
   comparison must be INTERLEAVED A/B/A/B inside one session, which usually means adding a runtime
   dial so both sides exist in one build. Repeat the baseline row LAST and quote its agreement as
   the noise floor.
2. **A uniform that is a `{ value: number }` is severed by three's `UniformsUtils.clone`** when a
   material is built from a ShaderLib entry — objects and arrays copy by reference, numbers by
   value. A scalar dial will read completely inert and look like a wrong hypothesis. Back it with a
   `Float32Array`; `_hcAux` is a vec4 with three spare slots for exactly this.
3. **Look at the frame before reading a statistic off it**, still. A midnight-wood A/B looked
   decisive and was worthless: the frame was 94% near-black, so it measured an unlit night rather
   than a lit surface. The speckle sits on a LIT surface by definition.
4. **`git show HEAD:` and the dev server are different programs.** The dev server serves the working
   tree. Anything about what Ben or a deploy sees must come from git or from the deployed URL —
   `bench/tmp-prod-boot.mjs` drives the real play path against production.
