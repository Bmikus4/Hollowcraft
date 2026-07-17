# THE WRETCH — BRAIN v2 · "the thing that keeps notes"

Design spec for the entity rework. Goal: a **human-level-aware, heightened-sensed, note-taking apex predator** that is terrifying *offline* (deterministic) and *smarter* online (LLM). Maps onto the real code in `index.html` (rig `P.*`, `wretch{}`, `updateWretch`, `brainSnapshot`, the audio engine). Nothing here rebuilds what §3 of HOLLOWCRAFT.md says is done — it replaces the entity's cognition and senses.

Design stance: **psychologist + predator + indie-dev.** Fear is engineered, not scripted. Density × density.

---

## 0. THE DIAGNOSIS (why v2)

The current entity perceives ONE thing — the player — through distance + LOS + a gaze dot. It has no model of the world it lives in. The Strategy LLM is fed a compass octant and stats; it cannot reason about *places* because it doesn't know any exist. There is no hearing, no scent, no memory of geometry, no posture vocabulary beyond a single `crawl` scalar, and the attack can be cancelled by the player merely glancing at it. v2 fixes the spine: **perception → world model → body → cognition**, four clocks running at once.

---

## 1. FOUR CLOCKS (cognition stack)

| Clock | Rate | Owner | Job | Blocks frame? |
|---|---|---|---|---|
| **PERCEPTION** | 60 Hz | `sense()` | build the live sensorium (vision/hearing/scent/proprioception/observation) | no |
| **BODY / REFLEX** | 60 Hz | `updateWretch` v2 | state machine, posture blend, commitment latch, movement, teleport gate | no |
| **LIVE AWARENESS** | ~2–4 s | `awareness()` deterministic | fold sensorium → world model → a first-person "thought" string + drive nudges. **This is the offline live-awareness — no network.** | no |
| **STRATEGY (Director)** | ~30–70 s | `stratTier` (Opus + vision) | long-horizon intent, mode-bias, rule-violations, rewrites the *notes* | no (fire-and-apply) |
| **FAST (instinct)** | ~3 s | `fastTier` (fast model) | one micro-expression: posture/gait/vocal/reveal | no |

The two LLM tiers already exist (`stratTier`/`fastTier`, `makeTier`, `orCall`). v2 **enriches their payloads with the world model** and adds the deterministic LIVE AWARENESS layer between Body and Strategy so it stays clever with the network off. LLM remains enhancement, never dependency (doc §1).

Delete the vestigial `director`/`updateDirector`/`opusDirective`/`heuristicDirective`/`applyDirective`/`rewriteMemory` block (dead code, `~1978–2063`) — its two-brain idea already lives in `brain.strat`. Keep `director.directive.bearing`? No — replace spawn bearing with a world-model choice (§4 teleport/ambush).

---

## 2. PERCEPTION — heightened senses (`sense(dt)`, 60 Hz)

The Body knows the player's true position ONLY through these channels (Alien-Isolation asymmetry, doc §7.3: Director may be omniscient to *pace*; the Body must *earn* the hunt). Each channel writes to `wretch.sense`:

- **VISION** — extend current LOS. Cone: `dot(forward, toPlayer) > cos(HFOV)` AND `!losBlocked`. Heightened = wide FOV (~140°) + long range (~90 blocks in open, less in fog). On a valid sight: `sense.seen=true`, `sense.lastSeen.set(player)`, `sense.seenAge=0`, `sense.confidence=1`. Peripheral catch (branch silhouettes) feeds apophenia audio, not certainty.
- **HEARING** — the player emits **sound stimuli** (new: a tiny event ring buffer `noiseEvents[]`). Emitters: footstep (loud if sprinting, muffled if sneaking/water), block break/place, chest slam, eating, jump-land, spear swing. Each event = `{pos, loudness, t}`. `sense.heard` = nearest recent event within `hearRadius*loudness`, occlusion-attenuated. Produces a *fuzzy* heard-position (± a few blocks of noise) → the entity investigates a **guess**, not the truth.
- **SCENT** — the player drops a **scent trail**: ring buffer of past positions stamped with time, decaying over ~90 s. When vision+hearing are cold, the entity can **acquire the trail** at its nearest breadcrumb and follow it (TRACK state). Heightened senses = it can smell where you *were*. This is the cunning-tracker feel.
- **PROPRIOCEPTION / TERRAIN** — samples the world around itself each tick: footing surface (floor/wall/ceiling via `surfaceUp`), nearest cover trunk, in-cave (opaque ceiling above), over/near water (avoid), local light level at its cell (prefers shadow: reads `skyExposure` + nearby emitters), slope/drop ahead (already in `moveEntity`). Feeds posture + the "stay in the dark" instinct.
- **OBSERVATION** — is it watched right now (`playerSees`, exists) + accumulator `observed` (exists). Drives freeze/hold — EXCEPT when committed (§4).

`wretch.sense = { seen, seenAge, lastSeen:Vec3, confidence, heard:{pos,age}|null, scentIdx, onWall, inCave, nearWater, coverPos|null, litLevel, watched, observed }`.

---

## 3. THE WORLD MODEL — "the notes" (`world.mind`, persisted)

A structured, continuously-updated record. This is what makes it *aware* and what the Strategy tier reasons over. Persisted to `localStorage['hollowcraft_mind']` as JSON + a rolling NL reflection (`brainMem` upgraded).

### 3a. PLACES — named locations with meaning
Auto-discovered + seeded. Each: `{id, type, pos, radius, playerFreq, danger, lastVisitByPlayer, note}`.
- **spawn** (seeded), **lair/dungeon** (seeded, `wretch.lair`), **den/caves** (discovered when it crawls into one), **water bodies** (from `hasWater` chunks), **treeline/dense-forest nodes** (from `pineAt` density — the cover map), **chokepoints** (narrow gaps), and — critically — **player structures**:
  - **CABIN / BASE detection**: scan `edits{}` (player-placed blocks). A cluster of placed planks/log/torch/bed above a density threshold = a "base." Its centroid = a Place of type `home`. **Door positions** = placed door/gate/trapdoor cells on the base perimeter. This is how it learns *where you live* and *how you get in* — for door-scratching, dusk-lingering, ambush.
- `playerFreq` = a coarse heatmap: increment the Place the player is nearest to, each second. The entity learns your routine — "haunt its routines, not its position" (doc §7.3).

### 3b. PLAYER MODEL
`{ baseId, doorCells:[], pathHistory (compressed scent), lastSeenPlace, encounterOutcomes:[{place,result}], holding:{light,weapon}, healthEst, sleepPattern, timesHitMe }`.

### 3c. SELF LOG
`{ mode, posture, committed, lastFedPos, carcasses:[], lastSeenByPlayerT, currentPlaceId, teleportCooldown }`.

### 3d. Persistence + reflection
Every dawn (night survived) + on major events, compress the model into a ≤1000-char first-person **reflection** ("It sleeps in the eastern rocks. The warm thing keeps a lit cabin by the river and leaves it at dawn by the north path. It has struck me once, by the water. I will wait where it does not look.") → this string IS `brainMem`, fed to Strategy every call. Structured JSON is also sent (compact) so Opus reasons over real places.

---

## 4. THE BODY — states, postures, commitment, teleport

### 4a. POSTURE (new axis, independent of locomotion)
Replace the single `crawl` scalar with a **posture blend** `wretch.posture ∈ {STAND, SIT, CROUCH, CRAWL, CLING, PRESS}` + a 0–1 `postureBlend` for smooth transitions. Each posture = a target rig pose (reuse gesture math) + a movement profile + an eye-height:
- **STAND** — tall, upright, looming (default idle; the "it just stands there" dread). Full height.
- **SIT** — folds down, coiled, still — waiting at a Place (ambush idle, patient). Very low, minimal motion.
- **CROUCH** — the `crouch_peer` pose generalized: low, peering from cover, ready to spring.
- **CRAWL** — all-fours arrhythmic gallop (exists via `crawl`→1). Locomotion for HUNT/TRACK/FLEE.
- **CLING** — wall/ceiling quaternion attach (exists via `surfaceUp`); mandatory in caves (doc §7.6 TRAVERSE).
- **PRESS** — flatten against a trunk/wall to hide when watched near cover (new; the "where did it go").
Posture is chosen by state × sensorium (watched+near-cover → PRESS; waiting at Place → SIT; open approach → CROUCH/CRAWL).

### 4b. LOCOMOTION STATES (evolve the 7/9)
DORMANT · PATROL (wide circling, 60–90 b) · PROWL (cover-to-cover stalk) · OBSERVE (peek/study from a Place) · **TRACK** (follow scent when player lost) · AMBUSH (SIT at a predicted Place, teleport-assisted) · **COMMIT** (the attack — uninterruptible) · DRAG · FLEE (scamper to cover, silent) · GO_HOME (retreat to den) · FEED (kill prey, §animals).

### 4c. UNINTERRUPTIBLE COMMIT (your explicit ask)
Today an in-progress HUNT is cancelled if the player turns to look (reactive core reroutes `watched → STALK/RETREAT`, `updateWretch:1846`). v2: a **latch** `wretch.committed`. Set true when COMMIT triggers deterministically (hungry · anger roll · player hurt it · idle-too-long pacing · successful stalk = close+unseen+confident — doc §7.6 override #2). While committed: **`watched` is ignored entirely** — it does not freeze, does not reroute, it *comes*. Latch clears only on: grab (→ jumpscare→drag), or losing the player for >N s (→ TRACK), or taking a heavy hit (→ FLEE, once). "If it's already going in, nothing stops it."

### 4d. FLEE = scamper, silent (your explicit ask)
FLEE today = speed 13 + a scream + random jitter (`updateWretch:1872`). v2:
- **Locomotion**: full quadruped scamper (crawl gait at high `gf`) — it *runs on all fours*, readable, not a tweak.
- **Destination**: pathfind toward `sense.coverPos` → nearest **dense-forest / treeline Place** away from the player's facing, then GO_HOME to a den (doc §5 "flee INTO the woods," "retreat to the DUNGEON mostly"). Never open meadow / water / cliff / toward player.
- **Audio**: near-**silent** — footsteps drop to the quiet set, NO per-flee scream. Scream sting only on the specific break-free-from-grab escape.

### 4e. TELEPORT / BLINK (your explicit ask)
The Director's omniscience made physical, fairly. `blink(placeId)`:
- **Gates**: only when (a) fully unobserved — outside the vision cone AND occluded, (b) target is a known Place in the world model, (c) cooldown elapsed (~45–90 s), (d) destination is itself out of the player's current view. Never blink into sight.
- **Uses**: recover after losing the player (blink toward their base/last Place), set an AMBUSH (blink to the cabin door / river path and SIT), reach the lair to begin/continue a drag. Optional faint audio tell at the *origin* (a displaced-air whump) so a sharp player feels it leave.
- This is the Alien-Isolation "suddenly it's here" without homing: it still has to *find* you at the destination via §2 senses.

---

## 5. THE GRAB — FNAF jumpscare, THEN drag (your explicit ask)

On contact (`beginDrag`), insert a **jumpscare phase** before the haul:
1. Latch `player.grabbed=true`, freeze all player input, `player.vel=0`.
2. Camera override (extend `updateCamera`'s `grabbed` branch): snap to the entity's face, **face lunges into frame** (`P.head`/`P.face` scales up toward the lens), **jaw slams open wide** (`P.jaw` full open showing the dark maw), red eyes max (`P.eyeMat` emissive), `setForm('demon')`.
3. Hit it all at once: `wretchVoice('scream')` + hard **screen shake** + full-screen **red flash** (`#dmg` to 1) + bloom spike + sub-rumble slam.
4. Hold ~0.7–1.0 s (`wretch.jumpscareT`), then transition into the existing drag (`dragging=true`, camera to the on-back low view). The drag itself stays no-lethal-until-lair (doc §5, already implemented) — death only at the dungeon or on devour.
State: add `wretch.grabPhase ∈ {none, jumpscare, drag}`.

---

## 6. AUDIO — stealth footsteps + 128-sound library + living soundscape

### 6a. Footstep discipline (your explicit ask)
Add `wretch.stealth ∈ [0,1]` derived from intent:
- PROWL / OBSERVE / AMBUSH / TRACK / **HUNT-approach** → stealth high → footsteps **very light**: low gain, high-passed (no body), sparse cadence — "actually trying to be quiet."
- **FLEE / GO_HOME** → stealth max → **quietest possible** (near-inaudible pads).
- The terminal COMMIT lunge is the exception the *jumpscare* covers — silence, then the scream. So: it stalks silent, and the first loud thing you hear is your own death.
Wire into `wretchStep()` (`2197`): scale `burst` gain/filter by `1-stealth`.

### 6b. 128-sound procedural library (your explicit ask: "128 easy-to-generate sounds")
The engine already renders one-shots from `burst()` (noise+bandpass+env). Build a **data-driven SFX table** `SFX[]`: each entry = a compact recipe `{src:'noise'|'osc', wave, f0, f1(sweep), q, env:[a,d], dur, gain, jitter}`. A generator composes **~16 archetype families × variations → 128 named cues**, all cheap (noise/osc → filter → envelope), all spatializable via `panAt`. Families & counts (≈128):

| Family | n | examples |
|---|---|---|
| wind / air | 12 | gust, high whistle, low moan, canopy sizzle, draft swell |
| foliage | 14 | leaf rustle ×3, bush shake, grass swish, branch sway, leaf-fall patter |
| wood | 16 | **twig snap, stick break**, branch crack, trunk groan, **bark scratch**, log knock, root creak |
| fauna — day | 14 | sparrow, thrush, wood-pigeon coo, woodpecker knock, wing flutter, distant song |
| fauna — night | 14 | **owl hoot ×2, howl ×2, bat screech+flutter ×2**, nightjar churr, cricket bed, frog |
| water | 10 | lap, plip, drip, trickle, splash, stream hiss |
| earth / rock | 12 | pebble clatter, gravel shift, dirt crunch, stone tumble, footfalls ×6 (by material) |
| uncanny / apophenia | 16 | distant knock, unidentified thud, whisper-hiss, breath, wet click, bone creak, low sub-pulse, far scream echo, "something big shifting" |
| structure | 8 | wind-chime tone, fence rattle, cloth flap, door creak |
| weather | 8 | rain patter, distant thunder, post-rain drip, wind swell |
| entity | ~14 | wet footstep (stealth-scaled), breath, clicks, distant call, scream, sting, jaw wet-open, drag scrape, feeding tear |

`playSfx(id, pos, {gain,pitch})` picks the recipe and renders. Everything routes through the forest/cave convolver so it echoes through the trees (doc §audio VERIFY).

### 6c. 10–12 named ambient layers + ordered ducking
Continuous beds, each its own gain node, layered not one pad: **wind-through-pines** (exists), **night insects** (exists), **day birdsong**, **distant water lapping** (near shorelines), **forest low-hum**, **canopy sizzle**, **frog/marsh** (near water at night). Random spatial one-shots scheduled from §6b (twig snaps, owl, howl, bat, scratch, distant knock) at organic intervals.
- **Ordered ducking toward silence** (doc §audio): as menace/proximity rises, layers fall in ORDER — **insects cut first → birdsong → water → wind falls away** → near-silence before it strikes. "Silence is the loudest warning." Extend `setThreat` (`2219`) into a staged, per-layer fade keyed to `HORROR.menace` + `wretch.dist`.
- **Reactive**: crows **burst from trees** (playSfx flock takeoff) when the entity passes near them; ambient day fauna **go silent** inside its radius (early-warning by absence). Ties into the animal system.

---

## 7. LLM ENRICHMENT — density × density

- **Strategy payload** = the **world model**: its body state, the sensorium (what it sees/hears/smells RIGHT NOW + confidence), the **Places** (with player-frequency + danger + your base + door cells), the **player model** (routine, outcomes, what you hold), the current commitment, tier, tension, the NL reflection, + the vision frame (`grabFrame`, exists). Opus now reasons over *geography and routine*, not a compass letter. Output adds: `target_place` (where to want / ambush / blink toward), enriched `rule_to_violate`, `memory_summary` (rewrites the notes).
- **Fast payload** = reflex context (mode, reveal policy, dist, visible, watched, posture, energy). Output: `posture`, `gait`, `vocal`, `reveal`, `gesture`.
- **LIVE AWARENESS (deterministic, no network)**: every ~2–4 s, fold the sensorium into a first-person thought string shown in F8 and used to nudge drives — "heard splitting wood, north — it works." / "lost it in the pines; the trail is warm." / "it sleeps; I will be at the door." This gives *live* awareness with zero latency and works fully offline. LLM overwrites the thought when it answers; deterministic fills the gaps.

---

## 8. CODE HOOKS (where each lands)

- Rig `P.*` (`buildWretch:1654`) — reused for postures (STAND/SIT/CROUCH via spine/leg poses, CLING via `placeWretch`, PRESS new pose, jaw for jumpscare). **Do not rename joints** (doc gotcha).
- `wretch{}` (`1756`) — add `sense{}`, `posture`, `postureBlend`, `committed`, `stealth`, `grabPhase`, `jumpscareT`, `blinkCd`.
- `updateWretch` (`1815`) — restructure: `sense(dt)` → `awareness(dt)` (throttled) → state select (with commitment latch + world-model destinations) → posture select → move/`blink` → `placeWretch`.
- `brainSnapshot` (`2311`) — becomes the world-model serializer.
- world model — new `mind{}` object + `localStorage['hollowcraft_mind']`; base detection scans `edits{}`.
- Audio — `SFX[]` table + `playSfx`; extend `setThreat` (staged ducking), `wretchStep` (stealth), add ambient bed nodes in `initAudio` (`2162`).
- `beginDrag` (`1906`) — insert jumpscare phase; `updateCamera` (`1564`) grabbed branch gets the jumpscare sub-view.
- Delete dead Director (`~1978–2063`).

---

## 9. BUILD ORDER (brain v2)

1. **Perception core** — `sense()`: vision (extend) + hearing (noiseEvents) + scent trail + proprioception. F8 shows the sensorium. *(load-bearing; everything reads it)*
2. **World model** — `mind{}`: Places (seed + discover), base/door detection from `edits`, player-frequency heatmap, persistence + reflection.
3. **Posture system** — posture axis + rig poses + smooth blend; SIT/STAND/CROUCH/PRESS added to CLING/CRAWL.
4. **Body v2** — states incl. TRACK/AMBUSH/GO_HOME, **commitment latch** (uninterruptible), **FLEE scamper+silent**.
5. **Teleport/blink** — gated, cooldown, world-model destinations.
6. **Grab jumpscare** — FNAF sequence before drag.
7. **Audio** — stealth footsteps, 128-SFX table + `playSfx`, 10–12 ambient beds, ordered ducking, reactive crows/silence.
8. **LLM enrichment** — world-model payloads + deterministic live-awareness thought; delete dead Director.
9. **Day-1 grace** (from main backlog) folds in here: no spawn until night 1 / start of day 2.

Foolproof = it hunts, tracks, ambushes, flees, and remembers with the network OFF; the LLM only sharpens it. Every layer degrades gracefully to the layer below.
