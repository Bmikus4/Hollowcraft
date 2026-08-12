# Hollowcraft — handoff. Read this file and nothing else first.

Written 2026-08-11, late. Everything described here is pushed to `origin/main`.

**This document is an index, not a briefing.** Each task below names the ONE file to read when you
start that task. Do not read them all. They are long, they contradict each other where the work has
moved on, and reading them together is how a session burns half its context before touching code.

---

## THE ORDER OF WORK

| # | task | read when you start it | state |
|---|---|---|---|
| 1 | **The game never loads for Ben** | `docs/handoff/01-load-hang.md` | **START HERE.** Not reproduced headless. |
| 2 | Black texels everywhere + matted surfaces | `docs/handoff/02-black-texels.md` | Not reproduced. Needs Ben's vantage. |
| 3 | The black band on the far water | `docs/handoff/03-water.md` | Isolated to 76% of the reflection term. |
| 4 | One lighting model, steps 2-5 | `docs/handoff/04-lighting.md` | Step 1 shipped but OFF. Step 2 reverted. |
| 5 | Water rebuild / horizon / fog+DoF | `docs/ONE-LIGHT-WATER-HORIZON-PLAN.md` §2-4 | Spec'd, not started. |

**Always read `docs/handoff/00-ground-rules.md` before your first edit.** It is short and every line
of it is a fault that has already cost this project a session. The shared checkout will bite you.

Ben's standing priorities: *"cohesion and beauty are your two main goals"*, and *"hyperrealistic"*,
which he has defined as *"it fits in with our existing lighting"*. He does not want status documents,
completion reports, or emoji. Two lines and the numbers.

---

## WHAT IS TRUE RIGHT NOW

- **Per-corner sky access is OFF** (`_SKY_SMOOTH = 0`). It shipped on in `2b42e7a` and was turned off
  the same evening. It is measured NOT to cause the black texels. See task 4.
- **The `hcLight()` extraction is REVERTED.** It was written, never compiled, never measured, and sat
  in the shared checkout while Ben played. See task 4 for the design finding that survived it.
- **Water's two procedural textures are OFF** behind dials (`__hc.waterRefl({streak:1, fine:1})`
  restores them), and vertical bars on water columns are fixed. See task 3.
- **The regression net was blind until `ca430c3`** and every "green" reading before that was taken off
  a JPEG. The real baselines are in `docs/handoff/00-ground-rules.md`. Do not trust any number in
  `fleet/resume/Hollowcraft-Lighting.md`, which predates the fix.

`fleet/resume/Hollowcraft-Lighting.md` is now HISTORY. Its §4 (the logic harness) is still the best
thing written about how to decide anything here and is reproduced in the ground rules. Its numbers are
not.

---

## THE BACKLOG, EVERYTHING OPEN

Items 1-5 are the tasks above. The rest:

| # | item | state |
|---|---|---|
| 6 | Black band on far water | task 3 — measured, not fixed |
| 7 | Two coloured lights in one chunk | `buildLightTexture` stores ONE channel + a per-chunk dominant tint, so the weaker light's pool is drawn in the stronger one's hue. Deliberate trade: per-cell RGB is 37 MB at rd 8. **BLOCKED on Ben's cave to aim at.** |
| 8 | Residual canopy black | alpha cutouts showing unlit space through leaves. Needs geometry, not a shader term. Reached from a new direction by per-corner sky (task 4). |
| 9 | Forest perf | 12.4 ms of the forest's 13.9 is scene draw, 1019k triangles vs the shore's 266k. Alpha-tested leaf-leaf faces are the suspect. **Gates the planar-reflection decision in the water rebuild.** |
| 10 | Ben has never judged | the sun arc, the skylight flood. All shipped, none judged. (Water reflections he has now seen and likes.) |
| 11 | The play path has NO bench coverage | every harness boots `?debug=1`, which sets `started` itself and never goes near `startGame`. This is why task 1 exists and why the menu plate blinded the whole net for a day. |
| 12 | `assets/models/`, `src/models/`, `tools/models/` are untracked | the model pack from `a4c89b3`. Confirm this is intended before anyone clones this repo. |

---

## THE FOUR GUARDS

`assert-cave-black` · `assert-unlit-black` · `assert-daylight-black` · `assert-lit-chroma`.

Their real baselines, and the reason five checks fail, are in `docs/handoff/00-ground-rules.md`.
Get them on the parent commit before you attribute a failure to your own work.
