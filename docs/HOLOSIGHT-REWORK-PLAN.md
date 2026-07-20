# HOLOSIGHT REWORK — cohesive plan

One rework, three pillars: (A) a hyperrealistic EOTech XPS2/3 holographic sight with the true
68 MOA / 1 MOA reticle, (B) genuine aim-through-the-optic ADS with a clean HUD, (C) a real,
smooth camera recoil system for every gun. All changes are in `index.html`.

---

## 0. Reference — the real optic (researched 2026-07-19)

EOTech **XPS2 / XPS3** holographic weapon sight ("XPS 2-3"):

| Fact | Value |
|---|---|
| Body | 3.8" x 2.1" x 2.5" (96.5 x 53 x 64 mm), 9.0 oz, one-piece hard-anodized aluminum, matte near-black |
| Window | 1.2" x 0.85" (31 x 22 mm) rectangular; FOV 90 ft @ 100 yd |
| Front glass | canted, purple/blue-red notch-filter mirror tint (the signature look) |
| Rear glass | near-clear, faint blue-grey laminate |
| Battery | single CR123A mounted TRANSVERSELY at the front — a tube bridging the housing like a roll bar, knurled slotted cap; "hovers over the delta ring" |
| Controls | two grey rubber up/down buttons on the REAR face below the window (XPS3 adds an NV button). NOT side buttons, NOT a QD lever — those are the EXPS, a different model |
| Mount | short Picatinny clamp, single cross-bolt, large slotted nut on the right flank; minimal rail footprint |
| Branding | "EOTECH" on the left flank |
| Reticle (-0 pattern) | **68 MOA ring (1.133 deg) + 1 MOA center dot**, short tick stadia at the ring's cardinal points, red ~630nm |
| Holographic character | reticle is slightly GRAINY (laser speckle), soft bloom halo, never LED-crisp; visually sits out at the target plane, parallax-free |

Sources: eotechinc.com product page, Primary Arms / B&H / PSA spec sheets, Freedom Gorilla XPS2/XPS3 review.

---

## 1. Current state (code sweep, exact seams)

- `buildHoloSight()` @ **6717-6746** — WRONG BODY: solar panel + elevation/windage turrets + QD throw-lever = Holosun 510C traits, not XPS. Glass teal `0x123c3c`.
- Reticle @ **6741-6745** — raw `RingGeometry(0.019,0.0225)` + `CircleGeometry(0.0038)`, additive red. At the aimed eye distance that ring subtends ~3-4 deg vs the real 1.13 deg → **~3x oversized**, no ticks, no dot-to-ring proportion, no speckle/bloom. `g.userData.reticle=[ring,dot]`.
- Mount points: minigun @ **6761**, AR-15 @ **6778**, bolt rifle @ **6826** (scout-mounted IN FRONT of the scope, scaled 0.8). `g.userData.dotY` = eye-line height used by the ADS pose.
- ADS: `view.ads` recomputed each frame @ **6924-6925** — requires `heldBtn===2`; bolt guns additionally require `view.boltT<=0` (scope drops for ~0.95s per bolt cycle, set @ **7013**). Raise ease `view.adsT` @ **6941-6979**; Holosun aimed pose centers `dotY` on the eye line @ **6976-6977**. FOV 74→62 @ **3590-3591**.
- **Fire cancels ADS (structural):** `heldBtn` is ONE variable @ **3073-3077** — left-click overwrites the right-click state, so firing drops `view.ads` every shot. Full-auto repeat also gates on `heldBtn===0` @ **3830**.
- HUD crosshair `#xh`: white "+", CSS @ **19-22**, div @ **136**, never hidden by any JS.
- **Red screen reticle** `_dotEl` @ **6906-6910**: DOM red ring (26px) + red center dot fixed at screen center, `z-index:24`, shown whenever a `dot` gun is held — INCLUDING while aiming a Holosun (only hidden for bolt-scope ADS). This is the "red reticle on the viewport crosshair".
- Bolt rifle `_dot` variants keep the magnified PiP scope (`scopeLensMat` shader @ **3782-3811**, `updateScopeRT` @ **3813-3820**) AND the holo — double optic.
- **No camera recoil exists.** Only `view.revKick` (revolver viewmodel flip, @ **7015**, applied @ **6980**).
- Items: `dot_sight` "Holosun Sight" @ 2663; `_dot` variants @ 2665-2668; recipes @ 2785-2786. Guns: AR-15 (`gun:true`), minigun (`'auto'`), hunting rifle (`'bolt'`, x4 variants), revolver (`'revolver'`, no optic by design).

---

## 2. The changes — C1..C10

### C1 — XPS body rebuild (`buildHoloSight()` @ 6717-6746)
Full visual rebuild at real scale (guns are ~1:1 meters; AR handguard = 0.20):
- **Delete:** solar panel + cells, elevation/windage turrets, QD throw-lever.
- Chassis 0.096 L x 0.053 W x 0.064 H: lower housing + rectangular hood with rounded/chamfered shoulders, window opening 0.031 x 0.022, wall thickness ~0.006.
- Transverse battery tube (cylinder r≈0.0085 along X) at the front top, knurled cap disc on the left with a slot groove.
- Rear face below the window: two small grey rubber buttons (rounded boxes, `0x3a3a3f`).
- Base: low Picatinny clamp + cross-bolt cylinder + large slotted nut on the right flank.
- Front glass: canted plane (`rotation.x` a few deg), deep purple-magenta mirror tint (`0x2a1030`-ish phong, high specular, opacity ~0.35). Rear glass: near-clear, opacity ~0.10-0.12, faint blue.
- Finish: matte near-black `0x141519` body, `0x26282e` hardware. Optional: tiny canvas-texture label strip on the left flank (grey "HWS-XPS" style marking — no real trademark needed).
- Keep the `g.userData.dotY` contract; window center must sit EXACTLY at `dotY`.

### C2 — Holographic reticle rework (replaces 6741-6745)
- Replace geometry with a **canvas-texture plane** (256-512px, additive, `depthTest:false`, renderOrder 13, same `userData.reticle` contract):
  68 MOA ring + 1 MOA center dot + 4 short cardinal tick stadia, drawn with a soft 1-2px
  bloom halo and per-pixel speckle noise on the stroke (the holographic grain).
- **True angular size:** ring must subtend 1.133 deg from the aimed eye position. At eye→window
  distance d, ring radius = d * tan(0.566 deg) ≈ d * 0.00989 (≈0.0035 at d=0.35). Dot = ring/68,
  readable only via its bloom — i.e. "tiny", exactly as requested. Plane sits on the optical
  axis at the window, facing the shooter.
- **Alignment fade:** reticle opacity scales with eye/axis alignment (use `view.adsT`,
  ~`smoothstep(0.35..0.9)`) — off-axis hip-fire shows glass but no floating reticle,
  which is also how a real holo behaves off-axis. Slight brightness flicker (~2-3%) optional.

### C3 — True aim-through-the-sight ADS
- Aimed pose (6976-6979): solve so the sight's optical axis lies EXACTLY on the camera axis —
  window center at screen center; the reticle then IS the point of impact (bullets already
  originate from camera center). Verify with a screen-projection assert in QA (C10).
- Keep FOV 74→62 bring-to-eye; world visible straight through the window (no PiP at 1x).
- Nudge aimed gun Z so the eye sits at a realistic ~0.3-0.4 behind the rear window (hood
  edges softly frame the view without tunneling).

### C4 — HUD crosshair hides while aiming
- `#xh` gets JS-driven fade in `updateView`: `opacity = 0.85 * (1 - smoothstep(adsT, 0.3, 0.7))`
  whenever the held gun can ADS (holosight AND bolt scope). Restores on lower.

### C5 — Delete the red screen reticle
- Remove `_dotEl` entirely (creation + show/hide @ 6906-6910, call @ 3836). The red reticle
  lives ONLY inside the optic now. Hip-fire keeps the plain white `#xh` "+" — no red anywhere
  on the viewport.

### C6 — Rifles: holosight XOR scope, never both
- `buildBoltRifle(suppressed, dot)`: when `dot` is set, SKIP the scope entirely (rings, tube,
  bells, turrets, both lenses @ 6813-6821) and mount the XPS on the receiver rail at proper
  eye height (replaces the forward scout mount @ 6826, no 0.8 downscale).
- `updateScopeRT` (3813-3820): skip the PiP pass for `_dot` bolt variants (no scope lens exists).
- Wheel-zoom (3080) only applies when a scope lens is present.
- Non-dot variants keep the scope exactly as today. AR-15/minigun unchanged apart from C1 model.

### C7 — Input split: firing never breaks ADS (all guns)
- Replace single `heldBtn` with independent `lmbHeld` / `rmbHeld` booleans
  (mousedown/mouseup @ 3073-3077, blur @ 3103, pointer-lock loss @ 3065).
- `view.ads` uses `rmbHeld`; firing/swing uses LMB; full-auto repeat gate (3830) uses `lmbHeld`.
- Result: left-click while aiming fires WITHOUT touching aim state — for every weapon.

### C8 — Bolt cycle no longer drops the holosight
- ADS condition (6925): the `view.boltT<=0` requirement applies ONLY to scoped (non-dot) bolt
  variants. With an XPS mounted you stay on the glass while the bolt-handle animation
  (6928-6931) cycles in the aimed pose. `boltT` still gates fire rate.

### C9 — Recoil system (all guns, smooth, camera-real)
New tiny module + per-gun profiles; replaces/absorbs `revKick`'s camera role:
- **State:** `recoil = {pitch, yaw, tPitch, tYaw}` (applied offset + pending impulse).
- **`kickRecoil(profile)`** called from `fireGun()` (7010-7042): adds `tPitch += up*(0.85+rand*0.3)`,
  `tYaw += side*(rand-0.5)*2`.
- **Per frame (in updateView):** two-stage spring —
  1. KICK: applied offset chases the pending impulse fast (~40-60ms ramp, `1-exp(-dt*k)`) —
     never a single-frame snap;
  2. RECOVERY: pending impulse decays toward `impulse*(1-recovery)` (~0.3-0.5s, critically
     damped) — aim returns MOST of the way, so sustained fire walks up realistically.
  Deltas are applied to the REAL `player.pitch`/`player.yaw` (aim genuinely climbs; recovery
  gives back its share smoothly).
- **Profiles:** AR-15 0.35 deg/shot, fast 85% recovery | minigun 0.10 deg/shot at rate (heat
  wander via yaw jitter) | bolt rifle 1.6 deg, 70% recovery | revolver 2.2 deg snap, fast
  recovery. ADS multiplies kick by ~0.85 (cheek weld), sway already handles the rest.
- **Viewmodel layer:** generalize `revKick` → `view.gunKick` for every gun (rearward shove +
  muzzle rise on the model @ 6980 pattern, per-profile scale) so the gun visibly bucks
  independently of the camera.
- With C7+C8: while on the holosight you watch the reticle climb through the window per shot —
  recoil replaces ADS-interruption as the cost of firing.

### C10 — QA + headless verification (bench/tmp-verify-holosight.mjs)
- `__hc` hooks: give player each gun, force ADS, report — `#xh` opacity, `_dotEl` absence,
  reticle screen-projection (must be ±2px of screen center when `adsT`≈1), `view.ads`
  persistence across a fired shot, `player.pitch` delta after N shots (recoil up + partial
  recovery), and screenshots: XPS at hip, XPS on ADS, bolt-dot variant (must show NO scope).
- Syntax check + run existing bench/smoke-cognition.mjs to prove zero collateral.

---

## 3. Build order

1. **C7** input split (foundation — everything else assumes it)
2. **C9** recoil core + profiles (independent, testable immediately)
3. **C1+C2** XPS body + reticle (one visual unit)
4. **C3** axis alignment (needs C1's exact window geometry)
5. **C4+C5** HUD cleanup (trivial once C3 verified)
6. **C6+C8** bolt-rifle variant surgery
7. **C10** verify harness, screenshots, commit

## 4. Non-goals / kept as-is
- Scoped (non-dot) bolt rifle behavior, PiP shader, revolver's no-optic rule, crafting recipes,
  item ids ("Holosun Sight" name stays — it's the game's fiction for the holo sight),
  ADS sensitivity settings (`_aimFrac`), FOV values.
