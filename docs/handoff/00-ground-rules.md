# Ground rules. Short, and every line is a fault that has already cost a session.

## The shared checkout

- **`index.html` is co-edited by another live Claude session, right now, continuously.** It moved
  under this session four times in one evening.
- **Commit the WHOLE file, never a hunk filter**, then `node C:\Users\thera\fleet\hc-guard.mjs 12` —
  it must say **0 reverted**. A partial stage is how five commits went missing on 08-10.
- Expect your own edits to land inside the OTHER session's commits. That happened to all three of this
  session's `index.html` changes (`90f5542`, `f4f02fd`, `a4c89b3`, `e7c3122`). Your commit message is
  then the only record of why the change exists — write it anyway, naming the commit that carried it.
- Explicit pathspecs only. Never `git add -A`, never `reset --hard`, never delete another session's
  untracked files. `bench/results/` is gitignored.
- **Syntax-check before every bench run and before every commit:**
  `node --experimental-vm-modules bench/syntax-check.mjs`
  It parses index.html's inline module without resolving imports. It caught the other session mid-edit
  with `buildMenuVisuals` declared twice, and caught a self-inflicted backtick, each before a run.
  (`bench/_syntax_extract.mjs` is a stale EXTRACTED COPY of an old index.html, not a tool.)

## Never put a backtick in a shader comment

`waterMat`, `skyMat`, the god-ray pass and the atlas all build GLSL inside **JS template literals**. A
backtick in a comment ends the string and the rest of the file becomes garbage; the error names a token
hundreds of lines away and nothing boots. Four separate warnings about this already exist in the file
and it still happened again on 08-11. Use "double quotes" when naming a variable in those comments.

## Never ship what you have not compiled

The `hcLight()` extraction was written, never compiled, never measured, and left in the tree Ben plays
on. It was appended to `THREE.ShaderChunk.lights_pars_begin`, which **every lit material in the game
includes**, so one error in it breaks all of them at once — the likely author of Ben's "half of the
surfaces in game are completely matted". Compile it, measure it, or take it out of the tree.

## The logic harness — run every question through this before spending a bench run

1. **Is the thing being measured IN the frame?** Look at the picture before reading a statistic off it.
   Five crops in this bench's history did not contain what they measured. Two of them were made on
   08-11 alone: a wall carrying a single sky level, and the interior of a single quad where by
   construction there is no seam.
2. **Is the vantage at the range the fault lives at?** Ben: *"its only when I as the player gets close
   that I see them."* Close range means 1.5 blocks, mip 0.
3. **Is there a noise floor?** The sea and the foliage animate. Pin the clock and the wind
   (`__hc.freezeT(0)`, `__hc.setTime(t)`) and repeat the baseline row at the end of every table.
4. **Is the A/B changing ONE thing?** Restore shipped values explicitly.
5. **Does the metric still mean what it meant?** A ratio over a shrinking denominator swings on nothing.
6. **Is a debug view a number?** No. `?dbg=` writes before OutputPass and AgX puts anything over ~0.2
   linear into near-white. **NO DEBUG VALUE IN A PRE-OUTPUT PASS CAN BE READ AS A NUMBER.**
7. **Which of the three fog systems does this material read?** `scene.fog`, the material's own
   hand-mixed term, and the volumetric/weather amount. Same class of bug in four separate places.
8. **Before claiming a guard regressed, get its baseline on the parent commit.**
9. **When Ben's words and the measurement disagree, the measurement tells you WHERE to look, not
   whether he is right.** Take the report as a pointer, not as a hypothesis.
10. **Report the numbers, not the verdict.** If part of the scope is blocked, finish the rest in full
    and say exactly what was left and why.

## Bench mechanics

- Dev server: `PORT=8123 NO_OPEN=1 node server.js`
- Run benches **one at a time** — parallel runs contend for the GPU and produce false reds.
- **This box has a failing cooling fan.** Interleave configurations, never block them, or the table
  measures thermal drift landing on whatever ran late.
- `__hc` is the ONLY thing a harness can reach. `CFG`, `camera`, `waterMat`, `menuBgStop` and friends
  are module-scope and a `page.evaluate` naming them throws a ReferenceError that a `try/catch` will
  swallow. Add a readout to `__hc` instead.
- Yaw: forward is `(-sin yaw, -cos yaw)`. To face `(dx,dz)`, `yaw = atan2(-dx,-dz)`.
- `setTime`: 0 = sunrise, 0.25 = noon, 0.5 = sunset, **0.75 = midnight**. Call it twice, read back `uDay`.
- PowerShell `Get-Content`/`Set-Content` double-encode UTF-8; python heredocs mangle `\n`. Use the Edit
  tool for anything with escapes and re-grep to confirm a scripted edit landed.

## The regression net, and its REAL baselines

Measured on the world for the first time on 08-11 after `ca430c3`. Everything recorded before that was
read off `assets/menu/keyart.jpg` — see task 1's file for how that happened.

```
assert-cave-black      15/18     (older notes claim 17/18)
assert-unlit-black      9/11     (older notes claim 11/11)
assert-daylight-black    6/6
assert-lit-chroma        6/6
```

Five checks fail and **none is attributable to recent work**. Two are worth knowing:

- `assert-unlit-black`: *"a sealed room reads the same at noon as at midnight"* — noon 7.37 vs night
  3.17. **The day is reaching an enclosed space that by construction has no sky access.** This is a
  real finding for the lighting unification and nobody has chased it.
- `assert-cave-black`: the "pre-existing chest failure" named in the old resume now PASSES. Three
  different checks fail instead. Do not go looking for the chest bug.
