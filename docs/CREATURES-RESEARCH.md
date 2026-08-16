# THREE NEW HORROR CREATURES — RESEARCH BASE

Ben, 2026-08-16: three new creatures, each matching the Wretch's scare factor **for a different
reason**, one of which tunnels under the ground; research Dead by Daylight and Resident Evil, with
**RE9 Requiem** as the primary text, and mine them for mechanism rather than imagery.

Anything below that I could not verify from a source is marked **UNVERIFIED**. A design that cannot
name its source is a guess, so every design section ends with what it took and from where.

---

## 1. WHAT THE WRETCH ALREADY OWNS

Stated first, because the constraint is *a different reason*, and you cannot be different from
something you have not written down.

- **Capture.** The Wretch's terminal event is not damage, it is being taken: grabbed, hauled to the
  lair, bound through a 93-second ritual with a struggle bar that is nearly impossible to fill alone.
  Grab immunity is deliberate — fighting free turns dread into a damage race.
- **Recognition, then wrongness.** `feed 0.42 / blockMix 0.15` in the drift renderer: the body must
  read as a body first and be wrong second. A stronger feed reads as a broken texture, and a glitch
  is not frightening.
- **Pursuit you can lose.** It stalks, charges, and can be broken off — an encounter with an arc.

None of the three below may use capture as its terminal event, and none may lean on
recognition-then-wrongness as its primary effect. Those are taken.

---

## 2. DEAD BY DAYLIGHT — the taxonomy, and why it is the right text

DbD is the closest published thing to what Hollowcraft already is: an asymmetric pursuit where the
dread comes from **imperfect information**, not from the monster's stats.

**The information channels, which are the actual design.**
- **Terror radius / the heartbeat.** A sound that grows with proximity and tells you the killer is
  near — but not *where*. Base 32 m at 4.6 m/s and 24 m at 4.4 m/s, so the channel is tied to the
  killer's speed, and perks and powers exist purely to bend it (Myers' whole design). It is described
  as one of the core mechanics the game uses to relay information to survivors.
- **Scratch marks.** Every killer has them; they make the *survivor* the thing that leaves evidence.
  This is the inversion worth stealing: the horror of being tracked by your own trail.
- **Crows.** Environmental tattling — disturbed birds make noise and rise, and respawn 15 seconds
  later; a perk (Spies From the Shadows) turns them into a notification at 20/28/36 m. The world
  itself informs on you.

**Killer archetypes**, from the community taxonomy: stealth (undetectable / suppressed terror
radius), mobility-chase, trap/teleporter, zoner/area-control, ranged, oppressor, snowball, map
pressure. The taxonomy is community-authored rather than official — treat the *categories* as sound
and any specific killer's classification as **UNVERIFIED**.

**What this gives the brief.** "Three creatures, three reasons" is a solved problem here: the reason
is which information channel the creature owns and how it corrupts it. The Wretch owns pursuit. The
three below take **the ground**, **the population**, and **the interior** — and each carries an
information channel of its own.

## 3. RESIDENT EVIL — the body, and RE9 Requiem specifically

Released 27 February 2026. Two protagonists: Leon in an action register, Grace in a survival one.

**Verified from reviews and coverage:**
- **The Girl** — the stalker. Roughly seven feet, a malformed girl in a nightgown, legs bent into a
  canine shape, remaining hair hanging over a face with bulbous eyes, jaws described as wendigo-like.
  Reviewers place her lineage explicitly at Mr. X, Nemesis and Lisa Trevor, and her first appearance
  is called one of the game's most terrifying scenes precisely because it **trades jump scares for
  sustained dread**.
- **She lives in the ceiling.** She can be heard scuttling overhead as you move through the facility;
  make a noise and she comes out of a hole "like a lizard". Multiple reviewers compare the behaviour
  to the Xenomorph in Alien: Isolation — vents and darkness as the medium of travel.
- **Grace is under threat from stalker ghouls that descend from the rafters**, so the vertical
  ambush is a class of enemy, not one boss.
- **Gore is contested.** Several players complain that shots do not visibly land where you aimed —
  blood splatter without localisation — and compare it unfavourably with RE4 Remake; other coverage
  describes flesh torn from faces leaving eyes dangling. The lesson is the useful part and it is the
  same finding as `feed 0.42`: **gore that is not legible as a wound in a place reads as noise.**

**What this gives the brief.** The engine already nails wounds to skin triangles at 2.5x with a
dark-bottomed hole — the RE lesson says keep spending on *localisation and persistence*, not on
volume of blood. And The Girl says the strongest stalker in 2026's biggest horror release travels
through a layer of the level the player cannot walk in. Ben's "one must tunnel underground" is that
idea rotated 180 degrees, and it is the right one.

## 4. FREE RESOURCES (Ben asked for free; these are the ones with clean licences)

- **Poly Haven** — every asset CC0, no attribution required: HDRIs, 8K textures, scanned models.
  For skin, wet stone, soil and root textures, and for the sky/HDRI work the atmosphere terminal owns.
- **Sketchfab**, filtered to CC0 — models; licence must be checked per asset, since only a subset is CC0.
- **awesome-cc0** (GitHub, madjin) and **3d-resources** (GitHub, devanshutak25) — curated CC0 indexes,
  worth one pass each rather than open-ended browsing.
- **3d.sk free samples** — human photo reference; the paid library is not needed for silhouette work.
- **Posemaniacs** — posable anatomy for extreme poses, which is what a quadruped-human hybrid needs.

Note for this engine: models are **built in code**, not imported. So the value of these is
**reference and texture**, not geometry — the Wretch and the seraph are both hand-built rigs, and the
fork pattern (rebinding `wretch`, body drawn under `src/entity/drift/` at 22 Hz, 0.059 ms/frame) is
cheaper than any import path would be.

---

## 5. THE THREE — mechanism first, model last

Item 4's "common fork of the Wretch" **folds in as creature 2**. It is not being dropped: the fork
pattern is the build method for all three, and the "spawns all the time" requirement is answered by
the creature whose entire dread depends on being numerous.

### CREATURE 1 — THE BURROWER. *Dread: the ground is not yours.*

**Mechanism.** Inevitability plus terrain betrayal. It never pursues you in the open, because it is
never in the open. It travels beneath the surface, and the only channel you have is **sound through
blocks** — a dig noise whose volume gives range and whose direction is smeared by the rock. It does
not chase your position; it surfaces where you are going. Breaking line of sight, the answer to the
Wretch, does nothing, because it never had line of sight.

**Terminal event (must not be capture).** Emergence and a single committed strike from below, then it
goes back down. You are not taken; you are *interrupted*, repeatedly, anywhere, and the only safe
ground is ground it cannot dig — stone, the dungeon floor, a built platform. That turns the whole
map into a legibility problem: which ground under me is soft?

**Taken from.** DbD trap/teleporter archetype (a killer whose power changes what hiding means) and
the terror-radius idea of range-without-direction, rotated into a sound that travels through blocks.
RE9's The Girl for the principle that the strongest stalker moves through a layer you cannot walk in.

**The hard part, honestly.** Terrain interaction, a below-surface path, emergence, and an audible cue
through solid blocks. This is the expensive one and it is budgeted as such.

### CREATURE 2 — THE MEEK. *Dread: you are never alone, and they are counting.* (the common fork)

**Mechanism.** Ubiquity and witness. Individually harmless and visibly weaker than the Wretch —
smaller, slower, no grab, no ritual. They do not attack. They **gather and watch**, and their number
is a function of what you have done: a kill, a felled tree, a night spent in the open. The horror is
statistical rather than acute — you turn around and there are four; you go inside and come out and
there are seven. The information channel is inverted from DbD's: **they are the crows.** Disturbing
one tells the Wretch where you are.

**Terminal event.** None of their own, and that is the design. They make the Wretch's terminal event
arrive. A creature that spawns constantly cannot carry a capture ritual — a ritual you meet six times
a night is a chore — so the Meek's function is to be the reason the rare thing finds you.

**"Similar but refined", pinned.** Same body language, one third the mass, the crawl gait inherited
outright. Refinements: no grab, no ritual, no eye light (see the cost section), and a death that is
cheap and immediate rather than a boss bar.

**Taken from.** DbD crows as environmental tattling with a respawn timer, and the survivor-leaves-
evidence inversion of scratch marks. RE9's "stalker ghouls" as a *class* rather than a single boss.

### CREATURE 3 — THE TENANT. *Dread: the inside is not a shelter.*

**Mechanism.** Sanctuary revoked. It only exists in enclosed space — a cabin, the dungeon, the
backrooms, anything you built and closed a door on. It does not enter while you watch; it is simply
already there when you come back, in the place you did not look. It does not pursue you outdoors at
all, and that is the point: going outside, at night, is the escape.

**Its channel is silence.** Inverted terror radius — it is audible when it is far and **completely
silent when it is close**, so the absence of the sound is the warning. That is DbD's most-copied idea
turned inside out, and it costs nothing to implement.

**Terminal event.** It does not kill you quickly and it does not take you. It **occupies**: it puts
out your light, closes what you opened, and stands where you were about to walk. Damage is a last
resort, at contact, in the dark it made.

**Taken from.** RE9's The Girl for interior stalking and for "make a noise and she appears" —
sound as the trigger rather than sight. DbD stealth archetype (undetectable / suppressed terror
radius) as the channel to corrupt.

---

## 6. THE THREE ANSWERS THE BRIEF DEMANDS BEFORE CODE

**The light pool.** 16 slots, and `bench/tmp-break-light-wash.mjs` measured **14 already lit by a
single lantern** at spawn. Decision, stated plainly:

- **The Meek borrow no slot at all.** Ever. A creature that spawns constantly cannot hold a light; at
  four alive it would take the pool apart and dim the world, and nothing on screen would explain why.
  Their eyes are emissive material only — bright in the texture, contributing no lighting.
- **The Burrower borrows none either.** It is underground; there is nothing to light.
- **The Tenant may hold ONE slot, under a hard cap of one instance alive**, released on death,
  despawn *and* chunk unload — the three paths the Horrific Wretch's fork leaked on. It is the one
  creature whose whole act is about light, so it is the one that gets to touch it.

**Population budget and despawn.**
- Meek: at most **4 alive**, despawn beyond **64 blocks** or after 90 s unseen, and the population
  is recomputed on load rather than restored, so a save/load can never accumulate them.
- Burrower: **1 alive**, tied to the surface region; despawns when you enter the dungeon.
- Tenant: **1 alive**, bound to one interior; despawns when that interior is left for good.

**Cost at volume.** Priced before shipping, not after: four Meek at 22 Hz on the drift path is
4 x 0.059 ms = **0.24 ms/frame**, against a 7.1 ms budget at 140 fps. That is the number to beat, and
it will be measured with a bench that spawns the cap rather than asserted from this line.

**Two bugs from the Horrific Wretch fork that must not be inherited**, both of them light-related and
both of them silent in play: a killed creature **stranded its eye light**, leaving eyes floating in
the world forever, and **the borrowed slot was never released**, so the torches lost one of ten for
the rest of the session and the game got darker the longer you played. The Meek and the Burrower
avoid both by construction. The Tenant is the only one that can reproduce them, which is precisely
why it is capped at one and why its release path is named in three places above.

---

## 7. SOURCES

- Dead by Daylight Wiki — Terror Radius (32 m at 4.6 m/s, 24 m at 4.4 m/s): https://deadbydaylight.fandom.com/wiki/Terror_Radius
- Dead by Daylight Wiki — Powers: https://deadbydaylight.fandom.com/wiki/Powers
- Steam Community — New Players Guide to Killer Archetypes (community taxonomy, UNVERIFIED as official): https://steamcommunity.com/sharedfiles/filedetails/?id=3013041768
- EIP Gaming — finding hiding survivors (scratch marks, crows, the 15 s crow respawn, Spies From the Shadows ranges): https://eip.gg/dbd/guides/how-to-find-hiding-survivors/
- Resident Evil Wiki — Resident Evil Requiem: https://residentevil.fandom.com/wiki/Resident_Evil_Requiem
- Rely on Horror — Requiem review (The Girl, ceiling scuttling, "slithering out of a hole like a lizard"): https://www.relyonhorror.com/reviews/review-resident-evil-requiem/
- GamingBible — Requiem's stalker mechanic, fans divided: https://www.gamingbible.com/news/resident-evil-requiem-stalker-mechanic-780596-20260226
- TechRadar — Leon vs Grace registers, twisted stalker ghouls from the rafters: https://www.techradar.com/gaming/resident-evil-requiems-leon-will-make-zombies-cower-with-adrenaline-pumping-action-while-scaredy-cat-grace-will-fight-for-survival
- Steam Community — gore comparison thread, RE4R vs Requiem (player opinion, not documentation): https://steamcommunity.com/app/3764200/discussions/0/762934390303076339/
- Poly Haven licence (CC0, no attribution required): https://polyhaven.com/license
- awesome-cc0: https://github.com/madjin/awesome-cc0
- 3d-resources (CC0 reference hub): https://github.com/devanshutak25/3d-resources
- 3d.sk free samples: https://www.3d.sk/photos/freeSample
