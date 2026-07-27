# HOLLOWCRAFT — BACKROOMS OVERHAUL: SORTED PLAN

Compiled 2026-07-27. Everything Ben has asked for, sorted by real size, with a plan per item.

**The one hard constraint on parallelism:** the whole game is one `index.html`. Two agents editing it
concurrently will conflict on every hunk. So parallel agent work is confined to:
- separate files (`bench/*.mjs` harnesses, `sounds/gen-*.js`, `assets/`, `docs/`)
- isolated git worktrees, merged one at a time
- research/spec work that produces a precise diff plan but does not apply it

Sequential edits to `index.html` stay with the main session.

---

## TIER 0 — LIVE BUGS (fix first, minutes each)

### 0.1 Light bleeds through walls and doors
**Cause.** The halls are lit by 16 pooled `PointLight`s, and only the nearest `BR_SHADOW_LIGHTS = 2`
cast shadows. A point light with no shadow map lights every surface within its radius regardless of
geometry — so a fixture two rooms away lights the wall you are standing behind.
**Plan.** Do not just add shadow maps (6 faces each, unaffordable at 16 lights). Instead gate the pool
by *room visibility*:
1. Assign every fixture its room id at generation time.
2. Each frame, compute the set of rooms reachable from the player's room through open doorways within
   2 hops (the nav graph from `brNavGraph` already gives this, and it is already cached).
3. A fixture only gets a pool slot if its room is in that set. Everything else contributes nothing.
4. Keep the 2 nearest as real shadow casters; raise to 3 on Ultra.
This is cheap, exact for the common case, and it makes closed doors genuinely occlude light — which is
the effect being asked for.

---

## TIER 1 — SMALL, INDEPENDENT (each ≈ 30–60 min, no dependencies)

| # | Item | Plan |
|---|------|------|
| 1.1 | 5% arched doorways | Replace the flat lintel soffit with a stepped arch: 6 voussoir boxes across the opening, radius = `dw/2`. Header springs from `BR_DOORH - dw/2`. Purely a variant inside `brxEmitWall` + a soffit branch in `brBuildEnv`. |
| 1.2 | 2% window between rooms, random size | A new `BR.windows` list: pick a shared wall run, cut a gap in the *middle band* only (bottom stays solid), emit a sill + head lining and one `glassLite` pane. Collision keeps the full wall segment. Random 1.2–3.6 wide, 0.9–1.8 tall. |
| 1.3 | 1% blood room / 0.1% blood-and-bones room (tile floors only) | A decal pass: a merged set of flat quads (`polygonOffset`) on floor and lower wall using a generated blood texture. Bones = the existing `bone` item geometry scattered + a few rib arcs. Gate on `r.zone === 2`. |
| 1.4 | 4–5 furniture types + textured junk piles, tile only, 20%/room | Furniture: filing cabinet, stacked office chairs, a desk, a pallet of boxes, a coat rack. Junk pile = one merged irregular mass of 20–40 jittered boxes with the concrete/wood PBR. All batched per material like `brBuildTables` already does. |
| 1.5 | Floor-dependent darkness (carpet & wood 30%) | Move the no-lights roll after zone assignment and key it off `r.zone`: carpet (0) and wood (1) get a flat 30%; tile (2) stays hit-or-miss. |
| 1.6 | Double doors | **DONE** (shipped e548295). |

---

## TIER 2 — MEDIUM (each ≈ 2–4 h, touch generation but not the chunk spine)

### 2.1 Varying room heights
Rooms currently share `BR_WY1`. Give each room `r.h` (its own ceiling Y):
- default `BR_CH` (well above head)
- some rooms taller (up to 1.6×)
- **10% of outer rooms** (rooms on the region/chunk fringe) get `r.h` *below player height*, ~1.5 —
  which means they partially cover a doorway. Those rooms are crouch-only.
Touches: per-room ceiling quads (already per-room since the district work), wall `ty` per room, fixture
Y, and a **Y-aware collision** addition — currently Y comes from the voxel layer, so low rooms need a
per-room ceiling clamp in `brxCollide`.

### 2.2 Bulb on a chain you must switch on — low rooms only
Depends on 2.1. In rooms with `r.h` low: a chain (thin cylinder stack) + bulb, `on:false`. Right-click
within 2.2 → toggles, adds a pool light, plays a real pull-cord click. Needs one new sample
(`sounds/gen-cord.js`, same synthesis vocabulary as `gen-fluor.js`).

### 2.3 1% dropoff void room
The room's floor quad is omitted; the walls run down 40+ blocks into black. A **ledge** 1.6 wide runs
the perimeter (its own floor strip + collision segments), and the void has a kill plane. The room keeps
its zone texture all the way down so it reads as the same building continuing.

### 2.4 2% tilted / sideways / fully vertical rooms
The generator is 2D, so this is the awkward one. Approach: build the room in a local frame and apply one
transform to the whole group.
- **Tilted**: rotate about a horizontal axis by 8–18°. Floor becomes a ramp; collision gets a per-room
  height function instead of a plane.
- **Sideways-vertical / fully vertical**: the room is a shaft. Doors sit **on the ends** (floor and
  ceiling of the shaft become the two doorways), and the hallway doors around it render normally. Entry
  is a fall or a ladder; this pairs naturally with the stairwell work in 3.2.

---

## TIER 3 — THE SPINE (largest single piece; everything below waits on it)

Ben: *"perhaps the largest part of this project is the backrooms infinity/stairwells/angled rooms."*
Agreed. This is one project, built in four steps.

### 3.1 Chunked infinite generation
- A **BRX chunk** = 8×8 cells (64×64 blocks), keyed `(gx,gz)`.
- `brxChunk(gx,gz)` generates and caches that chunk's rooms/walls/doors/etc from
  `hash(BR.seed, gx, gz)` — a pure function, so it is identical on every visit. **Session-persistent
  by determinism**, which is better than either "streams and re-rolls" or "keep everything in RAM".
- Streaming manager keeps a 5×5 neighbourhood generated + meshed, one `THREE.Group` per chunk.
- **The critical trick:** every cross-chunk decision derives from a hash of the *shared edge*
  (`hash(seed, min(gx), min(gz), axis)`), so two neighbours independently agree on where the crossings
  are without ever talking to each other. This is exactly the discipline that made `pineEmit` work.
- Collision must stop iterating all walls: cull by chunk bounding box first, then by segment.
- `brGenColumn` (the voxel floor/ceiling that gives Y collision) becomes unbounded in the +X region.
- The Key objective needs rethinking: "the farthest room" is meaningless. Proposal: the key sits in a
  chunk at a fixed ring distance (say 6–9 chunks out) chosen by hash, and a compass-like cue warms as
  you approach.

### 3.2 Stairwells as a chunk connector (20% per chunk)
Chunks gain a **level** (`baseY = BR_FLOOR + level*BR_CH`), derived from a hash with neighbours
constrained to differ by at most 1. Where two adjacent chunks differ by a level, the connection *must*
be a stairwell: a switchback flight in the boundary wall, with a landing. Where levels match, the
connection is a door or a tunnel. This makes the halls genuinely three-dimensional and is what makes
2.4's vertical rooms fit in.

### 3.3 Tunnels as a chunk connector (20% per chunk)
A player-sized passage (1.6 wide, 2.0 tall) bored through the thick boundary wall, offset from any
doorway — a duct, not a door. Some near, some far: the crossing point is picked from the edge hash
across the whole edge length, so spacing varies naturally.

### 3.4 Angled rooms at chunk scale
Today's "angled" content is free-standing partial walls inside axis-aligned rooms. Real angled *rooms*
means giving a room a rotation about its centre and letting its walls be arbitrary segments — the
renderer and the segment collider already handle arbitrary segments, so the work is in the cell→room
merge (an angled room claims a rotated rectangle of cells) and in doorway placement on a rotated edge.

---

## TIER 4 — ENTITY BRAIN OVERHAUL (its own session)

Ben: *"same brain as the wretch but for the backrooms — FULL session and overhaul. No OpenRouter."*

### 4.1 Real pathfinding
Replace the room-BFS with **A\* over a navmesh**: nodes = room polygons + doorway/tunnel/stair portals,
edge cost = real distance, with portal traversal costs (a closed door costs more than an open one, a
crawl costs more than a doorway, stairs cost more than flat). Cache the path, invalidate on door state
change.

### 4.2 Deliberate door use
It already shoulders doors open. Add: it **closes doors behind itself** when stalking (so the map
changes under you), and it can *choose* a longer route through open doors over a shorter one through
closed ones when it wants to stay quiet.

### 4.3 Waits in predicted rooms
Port the Wretch's ambush logic: maintain a belief about where the player is heading (recent movement
vector + which portals they have used), pick a room 2–3 portals ahead on their likely route, and *wait
there* rather than chasing. This is the single biggest fear multiplier in the whole list.

### 4.4 The Wretch brain, deterministic
The Wretch's WILL container + context registry + delta protocol, ported — but with the LLM tiers
removed and replaced by a deterministic policy: a scored intent selector over
`{stalk, ambush, hunt, wait, reposition, withdraw}` driven by the same context fields. No OpenRouter,
no network, fully offline and reproducible.

### 4.5 Doorway traversal animation (new — Ben's spec)
*"two grabbing points on every door; when the tips of its arms come in range they snap onto those
points, then its body lowers, head still tracking, and it goes through."*
- Every door and doorway gets `gripL` / `gripR` — two world points on the jambs at ~1.5 height.
- New animation state `duck-through`, entered when the nav path's next portal is within ~2.5:
  1. **approach**: body lowers progressively as it closes (hips drop toward 0.62×, spine pitches)
  2. **grab**: when each hand is within ~0.4 of its grip, IK-snap the wrist to the point and hold —
     shoulder/elbow solved with a 2-bone analytic solve (upper 0.62, fore 0.44, both known)
  3. **pull**: hips translate through the opening while the hands stay planted, head still tracking
  4. **release**: hands let go, body rises back to run height on the far side
This is the thing that will make it feel *physically real* rather than a sprite that glides.

---

## TIER 5 — OVERWORLD, SEPARATE PROJECT

Ben flagged trees and lighting as their own thing, apart from the backrooms. Both are already
substantially fixed (atomic `pineEmit`; the skylight floor raise). What remains is polish and should be
judged with Ben's eyes in-game rather than guessed at:
- canopy underside still reads very dark in daylight
- the shadow map's 46-block radius is a visible boundary in open terrain
- fog/treeline balance after the 2× reduction

---

# 12 MYSTERY ADDITIONS

Chosen across the whole scope spectrum, deliberately not all "more monster".

### S — small (an hour or two each)

**M1. The hum knows you.** Very rarely the mains buzz drifts into a two-syllable shape that matches the
cadence of your own footsteps. If you stand still for eight seconds, it stops too. No entity, no event,
nothing in the logs. It just happens about once every twenty minutes.

**M2. Wallpaper that remembers.** Sun-bleached rectangles on the wallpaper where furniture used to
stand — and in maybe one room in forty, the bleached shape is a person, arms at their sides, at the
exact height of a standing adult.

**M3. Ceiling tile collapse.** Certain ceiling cells are rigged: walk under one and the tile drops with
a bang and a puff of dust. It is harmless. It is also *noise*, and the entity investigates noise — so
the halls have a way of betraying you that isn't your fault.

**M4. Wet carpet trails.** Dark damp patches forming a trail across the carpet. Follow them forward and
they lead somewhere worth finding. Follow them *backwards* and they lead to whatever made them.

### M — medium (a day each)

**M5. Almond water.** A findable bottle. Drinking it restores hunger and thirst fully — and for thirty
seconds the hum inverts into a pure tone and the lights render as a photographic negative. Genuinely
useful, genuinely unpleasant, and you will still drink it.

**M6. The disposable camera.** Twelve flashes, no more. The flash lights a room for one frame — and in
that frame the room contains something that is not there under the fluorescents. Every shot is kept in
a roll you can page through, which means you can *prove* it to yourself, over and over.

**M7. The other player.** Footsteps one room behind you that match your gait exactly — your speed, your
stride, your pauses. There is no entity to find. If you stop dead, they take exactly one more step.

**M8. The vending machine.** A lit machine that hums on a different note to everything else. It gives
one item per visit. Its glass reflects the room behind you one frame stale — so anything that moves in
that reflection was there a moment ago, and isn't now.

### L — large (a session each)

**M9. The long room.** One chunk in a few hundred is a single corridor several hundred blocks long with
no branches at all. Same fixtures, same spacing, no landmarks. With the fog reduction it reads as
genuinely endless, and the only way to know you are moving is the fixture count.

**M10. Non-euclidean doorbacks.** Turn around and walk back through the door you just came through, and
sometimes you are not in the room you left. Rare enough to be deniable, consistent enough to learn.
Never traps you — the graph stays connected — but it dismantles your mental map.

**M11. Level "Run For Your Life".** A rare region where every fixture is red, the walls are the wrong
material for the district, and the Pale spawns permanently committed. There is exactly one exit door
and it is a long way off. It is not survivable by hiding, only by running.

**M12. The party.** Of all the dinner tables, one has its chairs pushed *in* and its candle lit. Sit in
a chair and the lights go out for three seconds. When they come back, every other chair is occupied by
a silhouette, all facing you, and the food is gone from every plate but yours.

---

# BUILD ORDER

1. **Tier 0** — the light-through-walls bug. Now.
2. **Tier 1** — all six, in one sequential pass (they barely interact).
3. **Tier 2.1** (room heights) then **2.2** (bulbs), then **2.3**, then **2.4**.
4. **Tier 3** — the spine, as a dedicated build: 3.1 → 3.2 → 3.3 → 3.4, verifying each.
5. **Tier 4** — the brain, as its own session, on top of the spine's navmesh.
6. **Mysteries** — M1/M2/M3/M4 fold into Tier 1's pass. M5–M8 after Tier 2. M9–M12 after the spine.

## Where agents help (given the one-file constraint)
- **Sound assets** — `sounds/gen-cord.js`, `gen-collapse.js`, `gen-vending.js`: separate files, fully
  parallel, same synthesis vocabulary as `gen-fluor.js`.
- **Verification harnesses** — one `bench/tmp-*.mjs` per feature, separate files, fully parallel.
- **Spec research** — the 2-bone IK solve for 4.5, and the A\* portal-graph design for 4.1, produced as
  precise written specs the main session then applies.
- **Texture generators** — blood decals, junk-pile albedo, red-level palette: canvas generators in
  their own files.
Everything that edits `index.html` stays sequential in the main session.
