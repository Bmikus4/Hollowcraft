# TASK 1 — the game never loads

## What Ben reported, 2026-08-11 late

> "it never loads, it gets stuck without fading on the main menu image and never loads the game"

Three separate facts in that sentence, and the second is the useful one:

- it is stuck on **the main menu image** — the key art, `assets/menu/keyart.jpg`
- **without fading** — the plate's blackout never even started, let alone finished
- **never loads** — and the watchdog, which exists, did not rescue it either

## What is already known — do not re-derive it

### It does not reproduce headless

`bench/tmp-playpath.mjs` drives the REAL player path: it loads `/index.html` with **no `?debug`**,
clicks `mb-solo` ("Enter the Wood"), and polls `__hc.loadState()` plus the computed style of every
overlay every two seconds. On this box it loads cleanly:

```
+3s   started:true  playAt:5272  circleDone:false  load:flex/op1.00  loadblack:block/op0.00  bgvid:none
+6s   heldMs:6035   icons:13/307   loadblack:block/op0.00/go
+11s  heldMs:11401  circleDone:true  load:none/op0.00  loadblack:block/op1.00/go   -> LOADED OK
```

No page errors, no shader errors, and **no 404s** (checked separately with a response listener —
`bench/tmp-404.mjs`). So this is path-specific or machine-specific, not universal.

### The gate, and where it can strand

- `_playAt = performance.now()` is set in `startGame`, ~line 11258. **It is the only place.** If a path
  reaches the loading plate without going through that line, the release block never runs at all.
- The release block is in `loop()`, ~line 14214, guarded by `if(!_circleDone && _playAt)`.
- `LOAD_MAX_MS = 20000`, `LOAD_READY_R = 4`, `CIRCLE_EXTRA_MS = 0` (~line 12952).
- `_circleHide()` ~line 12888 is the ONLY caller of `introRelease()`.
- The watchdog at ~line 14226 is `if(!initialReady && _playAt && ...)` — **also gated on `_playAt`**.
  So if `_playAt` is 0, nothing rescues the session. That is the shape of a permanent hang.

### The most likely untested path

This session clicked **`mb-solo`**. Ben has a saved world, so he most likely clicked **`mb-continue`**,
which does `window._resume = readSave(); startGame('solo')`. Inside `startGame`, `applySave(RES)` runs
on the line AFTER `_playAt` is set — and it is wrapped in a try/catch that logs `'resume failed'` and
sets `_introFly = true`. Worth checking whether a throw in there leaves the plate up.

`mb-host` restores a save too. `mb-join`, `mb-creative-btn` and the `?auto` path at ~line 11019 each
reach `startGame` differently.

## Where to start

1. Reproduce it the way Ben does. Extend `bench/tmp-playpath.mjs` to take the button id as an argument
   and run **every** entry point: `mb-continue` (with a save present), `mb-host`, `mb-creative-btn`,
   `mb-solo`. The save is in localStorage; a harness can plant one.
2. If none reproduce, the difference is the machine. Ben's box: Ryzen 3800X / B450 / **RX 5700 XT**, and
   **a failing cooling fan** with a history of thermal cuts. `rd` climbs adaptively to 12 (625 chunks)
   on capable machines, against the 8 (289) the benches use. A 625-chunk first mesh is a much longer
   wait than anything measured here.
3. Ask Ben which button he pressed and whether the note "the wood is still forming" was on screen. That
   note only draws inside the `_playAt` block, so **its presence or absence localises the fault in one
   question** — if he saw the note, `_playAt` was set and the gate was running; if he did not, it never
   armed.

## The systemic finding behind this — backlog item 11

**Every harness in `bench/` boots `?debug=1`.** That path sets `started = true` itself and never goes
near `startGame`. So the path every actual player takes has had, until `bench/tmp-playpath.mjs`, no
automated coverage of any kind.

That is not a small gap. It is the same gap that let the menu plate blind the entire regression net for
a day: `startGame` called `menuBgStop()` and the `?debug` auto-start did not, so every bench cropped the
key art while reporting green — including `assert-daylight-black` passing a check literally named "the
daylight frame is actually daylit". Fixed in `ca430c3`; the class of bug is not.

**Whatever else you do here, leave the play path with a harness that runs it.**
