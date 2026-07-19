// SERAPHIM — ANIMATION PRESETS (Agent E, Wave 2)
// ---------------------------------------------------------------------------
// States are DATA (canon §6 / contracts §API). The rig (rig.js) blends between
// two presets over ~0.4 s (smoothstep on scalars, quaternion slerp on the body
// lean). Everything the boss does at rest is a pure function of these numbers,
// so it is loopable and interruptible mid-motion.
//
// Every field is OPTIONAL except the flap scalars; missing fields inherit the
// previous state's value so a preset only states what it changes. The optional
// `lighting` / `fog` / `post` hint blocks exist so future `void` and `fractal`
// states (canon §6, §10) are PURE DATA additions — the rig routes them to the
// caller's scene without any structural change here.
//
// Scalar meanings:
//   omega        base flap rate ω (rad/s) — pair desync multipliers live in the
//                wing configs (upper 1.0 / mid 0.6 / lower 0.3), canon §3.
//   flap         flap intensity 0..1 (scales ω and stroke amplitude in wing.js).
//   fold         wing fold 0..1 (0 open, 1 furled).
//   droop        extra lower-wing pendulum weight 0..1 (visual hint for the rig).
//   bodyPitch    forward/back lean of the whole model (rad) — slerped.
//   bodyRoll     side lean (rad) — slerped.
//   yOffset      resting vertical offset (world units of the model) — the drop.
//   ember        core ember/fx intensity 0..1.
//   eyeClose     forced lid-close amount 0..1 (death closes eyes one by one on
//                top of this via the rig's sequencer).
//   gaze         'track' (all eyes chase the player) | 'wander' (idle drift).
// ---------------------------------------------------------------------------

export const BLEND_TIME = 0.4;               // seconds, smoothstep cross-fade

// keys the rig linearly-blends (bodyPitch/bodyRoll are slerped separately)
export const BLEND_KEYS = ['omega', 'flap', 'fold', 'droop', 'yOffset', 'ember', 'eyeClose'];

export const PRESETS = {
  // ---- IDLE: slow holy breathing, eyes wander, embers smoulder --------------
  idle: {
    omega: 0.85, flap: 0.45, fold: 0.06, droop: 1.0,
    bodyPitch: 0.0, bodyRoll: 0.0, yOffset: 0.0, ember: 0.6, eyeClose: 0.0,
    gaze: 'wander',
  },

  // ---- AGGRO: awake, wings spread wide, fast, all eyes lock -----------------
  aggro: {
    omega: 1.5, flap: 0.85, fold: 0.0, droop: 0.6,
    bodyPitch: 0.10, bodyRoll: 0.0, yOffset: 0.4, ember: 0.8, eyeClose: 0.0,
    gaze: 'track',
  },

  // ---- ATTACK WINDUP: pulls back, wings cup, charge telegraph beat ----------
  attack_windup: {
    omega: 0.55, flap: 0.35, fold: 0.18, droop: 0.5,
    bodyPitch: -0.14, bodyRoll: 0.0, yOffset: 0.7, ember: 1.0, eyeClose: 0.0,
    gaze: 'track',
  },

  // ---- ATTACK: committed lunge, wings driving, beam frame -------------------
  attack: {
    omega: 1.25, flap: 1.0, fold: 0.0, droop: 0.4,
    bodyPitch: 0.22, bodyRoll: 0.0, yOffset: 0.2, ember: 1.0, eyeClose: 0.0,
    gaze: 'track',
  },

  // ---- STAGGER: fold-snap + a 2 m drop, spring recovery (rig adds impulse) ---
  stagger: {
    omega: 0.5, flap: 0.2, fold: 0.8, droop: 0.9,
    bodyPitch: -0.05, bodyRoll: 0.28, yOffset: 0.0, ember: 0.5, eyeClose: 0.15,
    gaze: 'wander',
    _staggerDrop: 2.0,        // rig snaps yOffset here then springs back to yOffset
  },

  // ---- DEATH: ω→0, fold→1, slow descent, eyes close one-by-one, embers out ---
  death: {
    omega: 0.0, flap: 0.0, fold: 1.0, droop: 1.0,
    bodyPitch: 0.35, bodyRoll: 0.12, yOffset: 0.0, ember: 0.0, eyeClose: 1.0,
    gaze: 'wander',
    _descendRate: 1.1,        // world units / s the rig keeps sinking during death
    _eyeSequence: true,       // rig closes eyes centre-out over the death blend
  },

  // ---- STRUCTURE-ONLY future states (canon §6, §10): pure data additions -----
  // Not driven yet; present so the lighting/fog/post override plumbing is real.
  void: {
    omega: 0.4, flap: 0.3, fold: 0.1, droop: 1.0, yOffset: 0.0, ember: 0.7, eyeClose: 0.0,
    gaze: 'track',
    lighting: { key: 0.4, hemi: 2.2, point: 0.5 },   // blown-out white void
    fog: { color: 0xffffff, near: 6, far: 60 },
    post: { bloomStrength: 1.3, bloomThreshold: 0.7 },
  },
  fractal: {
    omega: 0.2, flap: 0.15, fold: 0.3, droop: 1.0, yOffset: 0.0, ember: 1.0, eyeClose: 0.0,
    gaze: 'track',
    fadeModelOut: true,                               // boss root fades vs the raymarch
    lighting: { key: 0.2, hemi: 0.6, point: 1.4 },
    fog: { color: 0xf5f1ea, near: 2, far: 40 },
    post: { bloomStrength: 1.1, bloomThreshold: 0.8 },
  },
};

export const DEFAULT_STATE = 'idle';
