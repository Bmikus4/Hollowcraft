# THE CERAPHIM — FULL SEQUENCE PLAN (plan of record, 2026-07-20)

Ben's spec is authority. Build order: P0 model adjustments (SHIPPED 7d271a2) → P1 3D rip →
P2 stage-II substages → P3 fractal void stage → P4 language + audio (woven through P1-P3 as built).
Push after each phase. Everything verified by headless harnesses.

## THE ARC
- Arrival: a PHYSICAL rip in spacetime, world-placed, ~55m tall; the creature emerges THROUGH it.
- Life I THE HERALD (1500hp): the measured fight (shipped: fight profile row 0).
- Life II THE ZEALOT (3000hp): + WING RAKE feather volleys (stick → sequential detonations),
  + BEAM SWEEP (locked line drag, not tracking spot), + PRAYER pauses (wings fold, eyes close, snap open).
- Life III THE FRACTAL (3750hp): all players into the WHITE VOID (flat white ground, massive white
  clouds, biblical); the creature glows GOLD at every edge, then morphs into fractal geometry that
  ENCLOSES the player in a perfect sphere (existing raymarch shader, uMorph 0→1, sphere inversion);
  its fractaled eyes fire CHAINS that BIND (Space-mash ≈ dungeon escape; feigned-slack tease near the
  end); each fired chain leaves a BLOODY EYE HOLE at the socket. Exit void on death → world restored.
- Death: existing beat (toll, corpse, angel-wings+minigun chest, Jesus risen) + death dialogue.
- Heavenly language (VOX SERAPH) + golden banner dialogue through ALL stages; custom synth audio per stage.

## HIT RULES (P0, SHIPPED)
Eyes = 100% damage (central 1.5×), checked first. Wings = hitboxes (3 spheres/span × 8 wings via
seraphWingSpheres) at 10% wound chance, else feathers eat the round. Outer two eyes per side ride the
mid wing row (FIX-5). Corona = under-fringe (r 0.10H, layer 5).

## P1 — THE 3D RIP (edit: index.html cutscene block ~"CERAPHIM ARRIVAL CUTSCENE")
Keep the liked 2D visuals by REUSING THE RIP CANVAS AS THE TEXTURE of a world mesh:
- `_cine.canvas` (the existing jagged destination-out tear) becomes a CanvasTexture on a double-sided
  plane placed at the summon point, facing the player. THREE layers: (a) core plane 34×56m, the canvas
  texture as alphaMap with a pure-white emissive material (the tear interior = blinding white void);
  (b,c) two additive halo planes scaled 1.06/1.14, opacity 0.5/0.25, slight z offsets — the glow bleed.
  Edge embers: spawnParticles along the tear rim every ~80ms (sample the path polygon).
- Timeline (t sec): 0 the air splits (thin sliver, scale.x 0.02→1 over 1.4s, rising crack audio);
  1.4 fully open + light spill (white point light, intensity ramp); 2.2 the creature EMERGES — model
  pre-attached (prewarmed) parked 20m BEHIND the plane, flies forward through the aperture over 2.2s
  (wings folded via setFold override 1→0 as it clears); 4.4 rip slams shut (scale.x→0.03 in 0.25s +
  white flash — the flash also hides any residual hitch) and shatters into particles; 5.0 boss bar,
  fight begins. Keep the existing 5s cutscene camera behavior (_cine look) but target the rip.
- The old fullscreen 2D overlay: retired as an overlay; its draw code now paints the shared canvas
  each frame (same visuals, new home). Letterbox + arrive dialogue (arrive1 at t0, arrive2 at t2.2).

## P2 — STAGE II SUBSTAGES (edit: bossUpdate, phase===2 only; cadence state `wretch._sub`)
Attack scheduler when _bossPhase===2: cycle [rake, beam(sweep), prayer] with the F profile cadence.
- WING RAKE: telegraph 0.6s (bank + wingRake() audio) → cast 7 feathers (thin red stretched-box
  meshes, buildFeather-shaped fan) along an arc toward the player's position, ballistic ~0.8s flight →
  featherStick() at impact, stuck 1.0s (tick audio) → detonate in sequence 130ms apart
  (featherDetonate(i,n) audio + bossBlast r1.5 + damage 3 within 2.2). Objects in a `_rakeFeathers[]`
  pool, cleaned on stage end.
- BEAM SWEEP (replaces the tracking beam in phase 2): at warn start, lock A = player pos, B = player
  pos + player velocity direction × 14 (lead); telegraph: showBossRing marched A→B repeatedly over
  F.warn; fire: beam aim lerps A→B linearly over F.fire (no tracking) — beamDragTick(u) audio at 150ms,
  bossBlast ticks as today. Dodge = cut perpendicular.
- PRAYER: every 3rd cycle: 4.6s pause — setFlapIntensity 0.1 + fold override 0.75, eyeBand
  telegraphBlink held (eyes closed), seraphPrayer() audio, prayer dialogue; attacks halt; SNAP-open
  sting at 4.2s then next cycle. (Eyes stay hittable — the prayer is the aim window, per hit rules.)

## P3 — THE FRACTAL VOID (new module block in index.html + shader reuse)
- ENTRY (on startBossRegen → phase 3, after the surge shockwave): voidEntry() audio; screen whites
  via _surgeFlash held 1.2s; during the white: `enterVoid()` —
  chunkRoot.visible=false; skyDome/pineLayer/oceanLayer/rain hidden; scene.background=white(#f5f1ea);
  scene.fog white, density 0.010; sunLight/hemi overridden to the 'void' preset hints (key .4/hemi 2.2);
  a 600×600 white ground plane at groundYAt(player)+0 (players stay in place — no teleport, world swaps
  around them: MP-safe, zero position sync); 14 MASSIVE cloud billboards (flat white radial-gradient
  sprite texture, 60-140m, additive-none, slow drift y 20-60) + 6 underlit floor-haze sprites.
  HUD unaffected. `exitVoid()` restores every override (stored in one _voidPrev object). Exit on boss
  death or despawn (killWretch wasBoss + despawnWretch guard).
- GOLD RIM: bodyMaterial + coreMat get onBeforeCompile fresnel: uGold uniform 0..1,
  emissive += gold(#e8c070) * pow(1-dot(N,V),2.5) * uGold. Driven 0→1 over 3s at void entry
  (goldShimmer() audio loop). (If onBeforeCompile is closed in bodyMaterial.js, fall back to a slightly
  scaled BackSide gold-shell mesh clone of the core — decide at build.)
- FRACTAL SPHERE: demo mounting transplanted: half-res RT + fullscreen quad ShaderMaterial with
  experiments/fractal.frag.glsl (fetched at stage entry, cached), uniforms from the demo P defaults,
  camera basis fed per frame from the game camera; rendered to RT then painted as the scene BACKGROUND
  (camera-parented quad, renderOrder -1, depthTest false) — the shader's fog #f5f1ea IS the void white,
  so the fractal reads as structure materializing IN the void, enclosing the player (uInvR 1.9).
  uMorph ramps 0→1 over 6s (fractalSwell() audio) while the boss model fades (fadeModelOut: material
  opacity via a shared uniform or lod.visible swap at morph>0.85). Boss keeps flying/attacking (beam
  cadence from F row 3) — its ATTACK ORIGIN becomes the fractal: beam origin = central eye as today.
  maxSteps 96→64 if frame >20ms (adaptive knob).
- CHAINS: cadence every 9-12s, one active bind max, targets nearest unbound player (owner-authoritative;
  guests get 'dmg'-style directed message `{t:'bind',on:1}` — add 'bind' to mp-server ALLOWED).
  Visual: 22 gold torus links instanced along a CatmullRom from a CHOSEN EYE's world position to the
  player, sag collapsing as it tightens; chainShoot() audio; travel 0.35s, dodge ~3 blocks.
  On hit: BIND — player.vel zeroed each frame, look yanked toward the boss 30%, FOV pinch 74→70;
  struggle meter reuses the drag machinery numbers: each real Space tap +0.09, bleed 0.055/s,
  release at 1.0 (the dungeon tear-free calibration); 1 damage per 1.5s bound. THE TEASE: first time
  meter ≥0.80: chain slackens 0.5s (meter frozen, sag up, chainTease() audio + mock dialogue), SNAPS
  back to 0.65 — once per bind; next ≥0.80 crossing releases (chain shatters to gold particles).
  BLOODY EYE HOLE: when eye k fires its chain: hide that eye instance (matrix scale 0 — sclera/iris/
  cornea/lids at k), mount a wound: dark red disc + drip particle emitter at the pivot station riding
  the band; persists until stage end. Chains prefer un-fired eyes; all 6 flank eyes usable, central never.
- Substage flow inside life III: void entry → gold ramp (0-3s) → fractal morph (3-9s, fractal1/2
  dialogue) → combat loop (beam F3 cadence + chains + clouds) → death → exitVoid + existing reward.

## P4 — LANGUAGE + AUDIO (woven through builds; specs from the two completed R&D agents)
- VOX SERAPH generator + sacred lexicon (agent spec §1.3 verbatim), golden banner (_svWrap CSS spec §2),
  seraphSay(id)/seraphSayNow/seraphSilence with P0-P3 priorities, 28-line script table, MP 'seraphSay'
  relay (add to ALLOWED). Wire-up map per spec §4.
- AUDIO: implement the agent's recipe functions verbatim: bossLoop/bossPan scaffold, heraldDrone,
  beamChargeLayer/beamImpactTick/beamReleaseTick, wingRake, featherStick, featherDetonate, beamDragTick,
  seraphPrayer, voidEntry, goldShimmer, chainShoot, chainBind, chainTease, fractalSwell,
  seraphSyllable/seraphSpeak (SERAPH_VOWELS) — speech fires WITH each banner line (syllable count from
  the angelic text). Lifecycle on wretch._bossAudio, stage transitions stop prior loops. Mixing table
  respected (all Stage-III beds non-spatial).

## HARNESSES
- tmp-verify-bossphases.mjs (exists) + extend: phase2 rake/sweep events fire; phase3: bg turns white,
  fractal quad live, chain binds + mash releases (drive __hc.key('Space') taps), bloody-hole instance
  hidden, exit restores background. Screenshots: rip mid-open, rake volley, void+clouds, fractal morph,
  chain bind. __hc hooks: sub(), voidOn(), chainTest().
