# ENTITY COGNITION V3 — behavioral & reasoning markup of the Wretch

Fresh markup of the entity's whole mind. Three deliverables, each run as its own R&D protocol:

- **Protocol A** — a census of every context type the entity can receive (66 solidified), each with a reasoned, critiqued descriptor.
- **Protocol B** — one standardized interpretation format for Gemini: the envelope, the delta harness (what changed / what is new / what persists), the game-fundamentals primer, and the translation into the internal thoughts of a hyperintelligent predatory hunter.
- **Protocol C** — best practices for the Opus 4.6 orchestrator: once a day, plus a reunion nudge when player and entity have not seen each other in a while. Opus is no longer part of the live brain.

Governing principle (retardmaxxed): **one decision container, many inputs.** Every input that can move the body — reflex, commitment, urgent stimulus, standing plan, recommendation, drive, instinct — flows into a single arbiter (`WILL`) with an explicit priority order. Nothing decides from a side channel anymore.

---

## 0. THE THREE CLOCKS (final architecture)

| Clock | Rate | Owner | Job |
|---|---|---|---|
| BODY | 60 Hz | deterministic (`sense` → `updateWretch`) | perception, posture, movement, hard reflexes. Works with the network off. |
| INTERPRETER | every 10 s + instantly on any trigger | **Gemini** (`geminiInterpret`) | metabolise the report stream into spatial/situational understanding + a live internal thought + a recommendation; may divert the plan on `critical_change`. |
| ORCHESTRATOR | once a day (dawn) + reunion | **Opus 4.6** (`orchestrate`) | strategic: where the entity should be, how it spends the whole day+night, what the priorities are. Reads the entire day's Gemini reasoning journal. Never in the live loop. |

Decision flow: all three clocks are *inputs* to `WILL`. Priority (highest first):

1. **reflex** — dungeon-hunt materialisation, rout, drag/ritual, grace-period clamp. Body-owned, instant, never negotiable.
2. **commitment** — the uninterruptible latch. Once it comes, it comes.
3. **urgent** — a divert with a TTL: Gemini `critical_change`, thirst break, starvation forage. Auto-returns to the plan.
4. **plan** — the orchestrator's standing day plan (per-step phase: day / night).
5. **instinct** — mode-utility fallback when nothing above owns the body (network-off baseline).

---

## PROTOCOL A — CONTEXT CENSUS

### A.0 Method

Swept every system that produces observable state: time/astronomy, the sensorium (`wretch.sense`), body vitals, the geometry harness, player condition, the world model (`mind`), spatial/topology, weather, tension/pacing, and the stimulus stream. For each candidate asked three questions:

1. **Discriminative** — does it change a correct predator's decision? (If never, cut.)
2. **Earned** — does the body actually know it through senses/memory, or is it a truth-leak? (Estimates are labeled as estimates; the only sanctioned leaks are the dawn/dusk tip-off and lair omniscience, both game rules.)
3. **Discernible** — can a model separate it from its neighbours? This is what the descriptor is for.

**Descriptor doctrine** (the user's constraint, resolved architecturally): a descriptor must help discernment *without* interfering with the specificity of the value. Therefore **descriptors never travel with the data**. They live once, in the system prompt, as a registry keyed by the exact field name; reports carry only `key: value`. The key is the join. This gives the model a stable dictionary while the payload stays pure signal — no prose diluting numbers, no per-report token bloat, and the descriptor can be as opinionated as needed without ever being mistaken for state.

Descriptor style rules (each entry below was critiqued against these):
- Say what the value **is**, then what it **implies for a predator**, in one breath.
- Name units and polarity explicitly (0=what, 100=what) — the classic LLM failure is inverted scales.
- State the delivery condition when conditional (`null unless …`) so absence itself is legible.
- Never embed thresholds that belong to the WILL ("attack when < 12") — descriptors describe reality, they do not command. That keeps the interpretation layer honest: Gemini recommends, it does not rule-follow.

### A.1 The registry — 66 context types

Grouped as delivered in the report envelope. **D** = delivery: A (always), C (conditional — condition given), E (event-only, arrives in the stimulus stream).

#### Group 1 — TIME & PHASE (6)
| # | key | D | descriptor (as compiled into the prompt) | critique / reasoning |
|---|---|---|---|---|
| 1 | `t_day` | A | brightness of the world, 0=blackest night → 1=full day; the raw clock behind `phase`. | Kept despite `phase` because Gemini can differentiate "deep night" from "night edge" numerically; phase alone quantises too hard. |
| 2 | `phase` | A | night / twilight / day. Night is its time; day is dangerous to it. | The single most load-bearing category; duplicated on purpose (redundant encoding survives model inattention). |
| 3 | `dawn_soon` | A | true when the light will turn against it soon — retreat pressure. | Precomputed so the model never has to derive it from `t_day`; boolean pressure flags outperform inferred ones. |
| 4 | `night_num` | A | which night this is (1,2,3…). Later nights: hungrier, angrier, bolder. | Encodes the escalation arc without exposing the tier table. |
| 5 | `nights_survived` | A | nights the intruder has lived through — how long this duel has run. | Longitudinal identity; lets thoughts reference history ("three nights it has evaded me"). |
| 6 | `grace_period` | A | true = the first day+night truce: it stalks and studies but will not commit, charge, or run prey down. | Must be in context or Gemini recommends hunts the body will silently refuse — the classic desync between will and body. |

#### Group 2 — SELF: BODY & VITALS (14)
| # | key | D | descriptor | critique |
|---|---|---|---|---|
| 7 | `self.x/y/z` | A | its exact block coordinates. | Anchor of every geometric derivation; rounded to whole blocks so deltas are quiet at rest. |
| 8 | `self.facing_deg` + `facing` | A | which way the body points (0=E, 90=S, 180=W, -90=N) + the compass word. | Degrees for math, cardinal for prose; both, deliberately. |
| 9 | `self.region` | A | which octant of the territory it walks (e.g. "NE wood"). | Coarse place-word for thought texture; too coarse for navigation — that is what coordinates are for. |
| 10 | `self.hunger` | A | 0=starving → 100=gorged. Hunger, not malice, sets its clock. | Polarity spelled out; inversion here would corrupt every plan. |
| 11 | `self.thirst` | A | 0=slaked → 100=parched. Parched enough, it must break for water. | Opposite polarity to hunger — flagged loudly in the descriptor precisely because they disagree. |
| 12 | `self.health_pct` | A | 100=whole; falling means the intruder's weapons are real. | Percent not raw hp — model needs proportion, not the 2700-point internal scale. |
| 13 | `self.energy` | A | stamina reserve 0–100; sprinting and terror-displays spend it. | |
| 14 | `self.wound` | A | fresh-injury signal 0–1; above ~0.5 the body favours flight. | The one place a body-threshold is mentioned, because the body enforces it regardless — the descriptor prevents Gemini fighting a losing reflex. |
| 15 | `self.state` | A | the body's current locomotion state (STALK, HUNT, CHASE, TRACK, FLEE, SCOUT, PEEK, DRAG, DORMANT). | The body reports what it is *doing*, so the interpreter grounds thoughts in actual motion. |
| 16 | `self.mode` | A | the current internal drive (EXPLORE, REST_DIGEST, STUDY, HUNT_PREY, HUNT_PLAYER, STARVING, TERRORIZE, AMBUSH, FLEE_RETREAT). | Drive ≠ state: mode is *why*, state is *how*. Separating them lets thought distinguish intent from execution. |
| 17 | `self.committed` | A | the latch: true = it is already coming and nothing calls it off. | Descriptor phrased as identity, not mechanics — the thought layer writes better sentences from identity. |
| 18 | `self.routed` | A | true = broken by overwhelming damage this encounter; it bolts and will not re-engage yet. | |
| 19 | `self.stealth` | A | 0=loud → 1=silent footfalls; how quietly it currently moves. | |
| 20 | `self.form` | A | wretch (lean stalker) or demon (the open-maw rage shape it takes to kill). | |

#### Group 3 — SELF: EXPOSURE & SOCIAL (6)
| # | key | D | descriptor | critique |
|---|---|---|---|---|
| 21 | `self.exposed_to_sky` | A | 0=deep cover → 1=naked under the open sky. It prefers shadow. | |
| 22 | `self.player_is_watching_me` | A | true = the intruder's eyes are on it right now. Being observed is a cost it hates paying. | |
| 23 | `self.seconds_under_your_stare` | A | how long the stare has been held; long stares force a choice: endure, melt away, or come anyway. | Duration is what matters; the boolean alone can't express a standoff. |
| 24 | `self.enc_damage_taken` | A | damage absorbed this encounter; past ~100 it breaks and routs. | |
| 25 | `self.active` + `spawn_in_s` | A | whether the body is out in the world; if not, seconds until it may re-emerge. | Lets night-thoughts exist while it bides underground instead of going silent. |
| 26 | `self.last_action` | A | what the will last had it doing, in plain words. | Continuity thread between reports; cheap, high leverage for delta-aware reasoning. |

#### Group 4 — SENSES (9) — the only channels through which it "knows" the player
| # | key | D | descriptor | critique |
|---|---|---|---|---|
| 27 | `senses.sees_player` | A | true line-of-sight this instant. The only channel that yields exact coordinates. | The census's most important epistemic statement: everything else is belief. |
| 28 | `senses.seen_age_s` | A | seconds since it last truly saw the intruder; 99 = effectively never / long cold. | |
| 29 | `senses.sighting_confidence` | A | 0–1 fade of the last fix; decays as the intruder could have moved. | |
| 30 | `senses.hears_player` | C (a noise within earshot) | a heard noise gives a *fuzzy* position, not truth — investigate a guess. | Descriptor explicitly demotes hearing below sight; models otherwise treat any position as exact. |
| 31 | `senses.smells_trail` + `scent_strength` + `scent_age_s` | C (trail acquired) | the ground remembers where the intruder walked; strength/age say how warm the trail is. Sprinting reeks, sneaking barely marks, water washes it out, blood makes it blaze. | The richest sense; the emission rules are in the descriptor because Gemini can *invert* them (fresh faint trail ⇒ it is sneaking). |
| 32 | `senses.being_watched` | A | duplicate of the stare channel inside the sense block. | Redundant with #22 by design — the sense block must be self-sufficient. |
| 33 | `senses.believed_dist` | A | its best guess at range when sight is cold. | |
| 34 | `senses.in_cave` / `near_water` | A | its own footing context: under stone / beside water. | |
| 35 | `senses.tip_off` (event) | E (dawn & dusk) | at each turn of the light it *feels* the direction the warm thing nests — a coarse regional fix, never coordinates. | The sanctioned truth-leak, named honestly so the interpreter treats it as instinct, not sight. |

#### Group 5 — PLAYER ESTIMATE & GEOMETRY (8) — precomputed ground truth
| # | key | D | descriptor | critique |
|---|---|---|---|---|
| 36 | `player_estimate.x/z` | A | best-believed intruder position. | |
| 37 | `player_estimate.confidence` | A | 0–1 trust in that position. | |
| 38 | `player_estimate.basis` | A | where the belief comes from: line_of_sight > fading_fix > last_seen > habitual_place > unknown. | The provenance ladder — the model reasons about *how it knows*, which is the heart of predatory inference. |
| 39 | `to_player.distance` | A | blocks between it and the believed position. | |
| 40 | `to_player.bearing_deg` + `dir` | A | absolute direction to the believed position. | |
| 41 | `to_player.relative_deg` + `side_of_me` | A | that direction relative to its own facing (+=its right). | Deterministic trig beats asking the model to do it; harness computes, model interprets. |
| 42 | `to_player.wretch_side_of_player` | A | which side of the *intruder's* facing it stands on — behind is the hunting side. | The single most predatory geometric fact; earned by knowing player facing only when seen. |
| 43 | `spatial.knowledge_tier` | A | how precisely it knows the intruder's whereabouts: exact_coords > grid_cell > region_only > landmark_only > none. Tight knowledge = tight approach; coarse = wide search. | The census's master epistemic dial; collapses 6 fields into one actionable grade. |

#### Group 6 — PLAYER CONDITION (12) — read only what a watching predator could read
| # | key | D | descriptor | critique |
|---|---|---|---|---|
| 44 | `player.health` / `hunger` / `thirst` / `stamina` / `sick` | A | the prey's condition: weakness it can smell — wounded, starved, parched, winded, fevered prey makes mistakes. | Grouped under one descriptor; the individual numbers stay individually keyed. |
| 45 | `player.moving` / `speed` / `sprinting` / `sneaking` | A | gait truth: sprinting is loud and desperate; sneaking is quiet and deliberate. | |
| 46 | `player.in_water` / `flying` | A | exposure states — water slows and silhouettes prey. | |
| 47 | `player.facing` | A | which way the prey's eyes point (only meaningful while it can see them). | Descriptor carries the caveat; otherwise the model uses stale facing as live truth. |
| 48 | `player.holding_light` | A | prey carrying a flame: visible from far in the dark — a beacon that betrays, and a sign it fears the dark. | Doubles as a *trigger* (#61). |
| 49 | `player.holding_gun` / `holding_weapon` | A | armed prey. Thunder-sticks wound it badly; blades less so. | |
| 50 | `player.armor_def` | A | how armoured the prey is, 0=soft. | |
| 51 | `player.indoors` / `sheltered` | A | prey under a roof / walled in — a den to be watched through windows, scratched at, waited out. | |
| 52 | `player.y` | A | prey altitude — high = climbed/towered, low = underground. | |
| 53 | `player.behavior` | A | one-line read of what the prey is doing (moving, holding light, climbing…). | |

#### Group 7 — WORLD MODEL (7) — what it has learned about the territory
| # | key | D | descriptor | critique |
|---|---|---|---|---|
| 54 | `landmarks[]` | A | every place it knows, with exact coords/distance/bearing: its lair, the spawn clearing, treelines, the shoreline, the intruder's logged places. | Capped at 10 by distance; labels are stable ids so delta tracking works on the *set*, not the ranges. |
| 55 | `landmarks: player_base` | C (base detected) | the intruder's nest — enough placed timber and light clustered together. It knows where you live. | Arrival of this key IS an event (#63); presence thereafter is standing truth. |
| 56 | `prey_nearby[]` | A | huntable animals with coords and direction — the other way to quiet its hunger. | |
| 57 | `distances.to_home/to_lair` | A | ranges to the two poles of its world: the prey's nest and its own dark. | |
| 58 | `habits.favourite_place` | C | where the intruder lingers most — routines are what it haunts. | |
| 59 | `memory` | A | its persistent learned reflection, rewritten only by the orchestrator. | Read-mostly; Gemini reads, Opus writes. One writer, no thrash. |
| 60 | `spatial.self_topology` / `player_topology` / `same_grid_cell` / grids | A | terrain class under each of them (water/shore/forest/highland/cave/open) + coarse 32-block grid cells. | Topology words carry tactics (forest=cover, open=exposure) without a pathfinding dump. |

#### Group 8 — WEATHER & TENSION (6)
| # | key | D | descriptor | critique |
|---|---|---|---|---|
| 61 | `weather.raining` + `rain` | A | rain muffles the world — sound carries less; trust ears less. | Mechanical consequence in the descriptor, because it is a real engine rule, not flavour. |
| 62 | `weather.fog` + `visibility_blocks` | A | fog shortens every sightline: it can loom closer unseen, and loses sight sooner. | Symmetric consequence stated; fog helps *and* hurts. |
| 63 | `tension.menace` / `tier` / `rage` | A | the dread economy: how thick its presence hangs, how far the escalation has climbed, how furious the later nights have made it. | |
| 64 | `tension.since_scare_s` / `encounters` | A | seconds since it last touched the intruder's fear; a long quiet is a debt to collect. | Pacing made legible to the mind that must *perform* the pacing. |
| 65 | `tension.hunt_armed` | A | true = the truce is over; killing is permitted tonight. | Paired with #6; both sides of the same gate. |
| 66 | `recent_events[]` + `last_stimulus` | A | the running stream of everything that just happened, each with kind, coords, timestamp. | The event backbone — see the trigger table below. |

### A.2 The trigger vocabulary (stimulus kinds inside #66)

Every kind below files a report **instantly** (per-kind 8 s debounce) on top of the 10 s heartbeat. Existing kinds kept; **bold = new in V3**.

| kind | fired when | why the predator must think NOW |
|---|---|---|
| `gunshot` | player fires (coords + weapon) | thunder pins prey from hundreds of blocks |
| `spotted_player` / `lost_player` | true sight acquired / cold >4.5 s | the two edges of the only honest channel |
| **`heard_noise`** | a fresh sound stimulus lands in earshot | a guess-position is born — investigate or ignore |
| **`saw_light`** | it sees the prey carrying a light source | a beacon in the dark: position + a read on prey psychology |
| **`being_watched`** | the stare has been held >1.5 s | the standoff decision point |
| `injured` | it takes damage | pain re-prices the hunt |
| `ate` / `drink` | fed on prey / drank at water | a drive just discharged; plans unblock |
| `terrorize` | the terror display begins | it is performing; thoughts should savour it |
| `player_in_lair` | prey entered its dungeon | the one place it is omniscient |
| `ritual_start` | the drag reached the altar | endgame narration |
| **`found_structure`** | the world model detects a new/grown player build (was defined but never fired — now wired) | the map of *where you live* just changed |
| **`entered_region`** | it crosses into a new octant of the wood | locational self-narration; keeps thoughts grounded in place |
| **`state_hunt/chase/flee/track`** | the body enters a major action state | action sequences must be narrated as they happen, not 10 s later |
| **`committed`** | the uninterruptible latch sets | the most dramatic single bit in the game |
| **`blinked`** | it relocated through the dark | it should *know* it moved and think from the new ground |
| **`arrived`** | it reaches a plan destination | step-complete: reassess from the new vantage |
| `changed_behavior` | drive mode flips | why-level shift |
| `rain_begins/stops`, `fog_rolls_in/lifts` | weather edges | sensory world re-weighted |
| `tip_off` | dawn/dusk regional fix | the instinct pulse |
| **`reunion_nudge`** | orchestrator intervened after long no-contact | the will just seized the body; the mind should feel the pull |

---

## PROTOCOL B — THE STANDARDIZED GEMINI FORMAT

### B.0 Requirements traced

1. Track what has **not changed** between deliveries. 2. Technically discern what is **new**. 3. Know the game's fundamental logic. 4. Know how/when context is produced and delivered. 5. Translate everything into subtle, realistic apex-predator internal thought. 6. Bridge into the real actions/states.

### B.1 The envelope (every delivery, identical shape)

```
{ seq, event, ...the full A.1 report..., delta: {
    seq_prev,            // what this diff is against
    new:      {key: value},          // context that did not exist last delivery (null→value, or first appearance)
    changed:  {key: {from, to}},     // existed, moved beyond its tolerance
    gone:     [key],                 // existed, now absent/null (a sense went cold, prey left)
    unchanged_n: N                   // count of fields that persist exactly as last delivered
} }
```

**Full state always ships.** The delta block is an *annotation*, not a compression. Critique that decided this: diff-only payloads make the interpreter stateful across an unreliable transport — one dropped response and its world dissolves. Annotated-full costs ~1.5 KB and makes every delivery self-healing. Retardmaxxed: send everything, and *also* tell it what moved.

### B.2 The delta harness (technical mechanism)

Deterministic, pure, runs before every delivery:

1. **Flatten** the report to `key.path → scalar` (arrays reduced to identity signatures: landmarks → label set; prey → `type@8-block-cell` set; behavior → joined string). Volatile bookkeeping keys (`t_day`, ages, the delta itself, `recent_events`, `memory`) are excluded from diffing — they change by definition and would bury the signal.
2. **Compare** against the previous flat map with **per-class tolerances**, so noise is not news: coordinates ±2 blocks, distances ±4, bearings ±15°, vitals ±5, booleans/strings exact. A predator does not re-notice a deer that shifted one block.
3. **Classify**: absent-before → `new` (this is the technical definition of "new context": the key was null or never yet delivered, and now carries a value — e.g. `senses.smells_trail` flipping true, `landmarks.player_base` first appearing). Present-both + beyond tolerance → `changed` with from/to. Present-before, null-now → `gone`. Everything else increments `unchanged_n`.
4. **Persist** the flat map + `seq`. First delivery of a session: everything is `new` — which is exactly right; it wakes and takes in the whole wood.

### B.3 What the system prompt teaches (the interpretation contract)

Assembled from five fixed sections + the auto-compiled registry:

1. **ROLE** — interpretive cortex; understands and recommends; never commands the body.
2. **COORDINATE FRAME** — the exact XZ/degree conventions (proven in production; unchanged).
3. **GAME FUNDAMENTALS** — the minimum true physics of its reality: night predator / dawn retreat; the grace truce; hunger-thirst clocks with their opposite polarities; senses-only epistemology (sight=truth, sound=guess, scent=history, tip-off=instinct); the escalation arc across nights; rain/fog sensory re-weighting; the lair's omniscience; the drag-ritual endgame; **and the delivery model itself** — "a report reaches you every 10 seconds, plus instantly when any trigger fires; `event` names why this report exists; per-kind conditions are listed in the registry." A mind that knows *why* it is being told something extracts more from it.
4. **DELTA PROTOCOL** — read order: `delta.new` first (attend! the world grew), `delta.changed` second (the world moved — from/to shows direction and rate), `gone` third (a channel died — sight lost, trail cold), then treat the remaining `unchanged_n` fields as standing truth already metabolised: do **not** re-derive or re-narrate them. This is what makes 10-second thoughts *evolve* instead of restarting.
5. **THOUGHT DISCIPLINE** — the output `reasoning` is the creature's live internal monologue: first person, present tense, ≤40 words, *for itself and never for the viewer* — no exposition, no game words (player, block, spawn), the human is only "the intruder / the warm thing / it / prey". Subtle and specific beats theatrical: reference the actual numbers' meaning (a bearing becomes "north of me, past the pines"), react to `delta.new` above all, and never reuse an opening word or image from recent reports. A hyperintelligent hunter's thoughts are mostly *inference*: where prey will be, not where it is.
6. **REGISTRY APPENDIX** — the A.1 descriptors, compiled `key — descriptor` per group, straight from the single source of truth in code (`CTX_DOC`), so prompt and payload can never drift apart.

### B.4 Bridge into actions & states (the existing body, examined)

What each body state means, how it is used, and what it does to the entity's reality — this table is also the basis of the `self.state` descriptor:

| state | meaning in code | in-game use | fundamental effect on its reality |
|---|---|---|---|
| DORMANT | inactive, spawn timer running | daytime rest, post-rout cooldown | it exists as pressure, not presence; thoughts turn inward (memory, hunger, the coming dark) |
| SCOUT | wide circling of the search anchor | travel, forage, patrol, plan steps | covers ground; its knowledge tier decays while it moves blind |
| PEEK | hold at cover, observe | ambush/wait steps, studying the base | information gain without exposure; the dread engine |
| STALK | cover-to-cover approach toward the anchor | default approach; terror display shell | closes distance while denying observation |
| TRACK | follow scent/sound with sight cold | after `lost_player` | belief-driven motion; confidence decays, trail age rules it |
| CHASE | committed run, mid-range | committed pursuit with sight | loud, fast, expensive; stealth abandoned |
| HUNT | terminal charge, close | the kill approach | the only state that ends in the grab |
| FLEE | scamper to cover / rout | daylight exposure, stare overload, 100+ damage | it pays a pride cost; rage accrues for later nights |
| DRAG | hauling the caught prey | post-grab ritual transport | the game's lose-state channel; mind narration hands over to the ritual |
| (modes) | EXPLORE / REST_DIGEST / STUDY / HUNT_PREY / HUNT_PLAYER / STARVING / TERRORIZE / AMBUSH / FLEE_RETREAT | the *why* behind the state; utilities biased by the orchestrator's `mode_bias` | drives are the entity's economy: hunger, curiosity, dread-craft, fear |

Plan intents map onto these (`explore/forage→SCOUT`, `stalk/terrorize→STALK`, `ambush/wait→PEEK`, `hunt→CHASE/HUNT` via commit, `retreat/rest→SCOUT home`), so an orchestrator step is always executable by the deterministic body even with the network off.

### B.5 The broadcast (viewer-facing surface, thought-facing content)

- Cadence: every 10 s (`REASON_INTERVAL`) **and** on every trigger in A.2 — both produce a fresh `reasoning`, which is the live thought.
- Surface: the existing top-left mind panel (`_mindEl`, fixed `left:14px; top:44px`), on by default, visible whenever the player is in-game; the thought line is the italic quote, with the action/belief/status lines above it.
- Freshness window widened so the live Gemini thought never flickers back to canned instinct lines between heartbeats while the AI is up; offline, the procedural instinct monologue continues to cover every bucket (dead/dormant/hunt/track/…) so the panel never goes silent.

---

## PROTOCOL C — THE OPUS 4.6 ORCHESTRATOR

### C.0 Best-practices R&D (distilled)

1. **Strategic/tactical split by timescale, not by model quality.** The failure mode of LLM-orchestrated agents is the strategist in the reflex loop: latency where reflexes live, cost where volume lives, and thrash where consistency lives. Opus's judgment is wasted re-deciding every 70 s what Gemini already handles. Correct shape: Opus decides *shape of the day*; Gemini decides *shape of the moment*; the body decides *shape of the second*.
2. **Low frequency demands high context.** If the orchestrator speaks once a day, its one call must see everything: the full day's interpretation journal, the world model, the vision frame, the outcome ledger. Frequency and payload richness trade off; V3 moves all savings from frequency into context depth.
3. **Journal, don't sample.** Feeding the orchestrator only the latest state loses the *trajectory* (was the player bolder today? did the ambushes fail?). Every Gemini reasoning + understanding is journaled with timestamp and trigger; the daily call receives the journal (capped, oldest compressed to counts) and is explicitly asked to read it as the day's story.
4. **Plans must be executable offline.** Steps are intent + absolute destination + phase tag; the deterministic body can run the whole plan with the network down. The orchestrator writes music the body can play solo.
5. **One writer per memory.** Opus alone rewrites `memory_summary`. Gemini reads it. No write contention, no drift.
6. **Interventions need cooldowns and reasons.** The reunion nudge carries its trigger (`reunion`) so the model knows it is being asked to *force contact*, and a cooldown prevents nudge-spam from eroding the daily plan's authority.
7. **Fail toward the animal.** No key, timeout, refusal → the deterministic drive economy runs the creature. Opus sharpens; it must never be load-bearing.

### C.1 The daily cycle

- **DAWN (once a day, the only scheduled call):** as the night ends and it retreats, Opus receives: full report, world model, day journal (all Gemini reasoning since the last dawn), recent events, the vision frame if available, capabilities. It returns: a 6–8 step plan covering **the entire coming day and night**, each step tagged `phase: day|night` (day = forage/rest/scout/pre-position; night = stalk/ambush/hunt/terrorize per the arc), `mode_bias` to tilt the drive economy, a rewritten `memory_summary`, and the strategy thought. The journal is then cleared: tomorrow's call reads tomorrow's story.
- **DUSK:** no call. The body simply advances to the plan's first `night` step (the orchestrator already decided dusk's shape at dawn). The tip-off still fires.
- **BOOT:** one orchestrate call so a fresh session always has a standing plan.

### C.2 The reunion nudge

Tracked: last moment of *mutual awareness* (it saw the prey, or the prey's stare was on it). When the entity is active and neither has perceived the other for **6+ minutes**, and the nudge cooldown (5 min) has elapsed: `orchestrate('reunion')` — Opus is told the duel has gone cold and asked for a corrective plan fragment that *engineers an encounter* (intercept the believed position, ambush the base door at the hour it is used, terrorize at the edge of perception to re-establish presence). The nudge diverts like a Gemini interrupt but rewrites the standing plan's remainder — the will keeps things going.

---

## IMPLEMENTATION MAP (V3 → code)

| piece | lands at |
|---|---|
| `CTX_DOC` registry + prompt compiler | new, above `GEMINI_SYS` |
| delta harness (`_ctxFlat`, `_ctxDelta`) | new, beside `buildReport` |
| `WILL` container (inputs, priority, submit/decide, trigger sentry) | new, reasoning section; thirst/starve/gemini diverts rerouted through it |
| trigger detectors (A.2 bold set) | `WILL.sentry(dt)` ticked from `updateReasoning` + point hooks (blink, detectBase, plan-arrive) |
| `GEMINI_SYS` v3 + journal capture | rewritten in place |
| `orchestrate()` (daily @ dawn + reunion + boot), per-step `phase`, dusk phase-advance | replaces `planHalfDay` scheduling |
| HUD freshness | `updateMindFeed` window 15→24 s |
