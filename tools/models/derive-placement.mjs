// Derive placement data for the model pack straight off the geometry: where the hand grips, which way
// the thing points, and for a gun the muzzle, the bore line and the two iron sights.
//
// This replaces the click-and-drag placement editor the brief describes. The editor's output is five
// points per model; hand-placing 110 models' worth of them is an afternoon of dragging spheres, and every
// number it produces is recoverable from the mesh: a gun's muzzle is the end of its long axis whose
// cross-section is a barrel and not a stock, its sights are the bumps standing above the receiver line,
// its grip is the rearmost thing hanging below the trigger. So the numbers are computed, then LOOKED AT
// (tools/models/inspect.html renders every derived point as a marker), and the handful the geometry lies
// about are pinned in OVERRIDE below with the reason.
//
//   node tools/models/derive-placement.mjs          → writes assets/models/placement-data.json
//
// Model space is the pack's own: +X toward the muzzle, +Y up, Z across. The game's guns point -Z, which
// is a yaw of +90° applied at build time (see GLB_GUNS in index.html), so nothing here is pre-rotated —
// placement data stays in the model's own frame, the only frame it can be checked against.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODELS = path.join(ROOT, 'assets/models');

// --- GLB reading (JSON + BIN chunk, dense accessors, node transforms baked) ---
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function glbParts(file){
  const b = fs.readFileSync(file);
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const dv = new DataView(buf);
  let off = 12, g = null, bin = 0;
  while (off + 8 <= buf.byteLength){
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) g = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = off + 8;
    off += 8 + len;
  }
  const acc = i => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], T = COMP[a.componentType];
    return new T(buf, bin + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * NC[a.type]); };
  const mul = (a, c) => { const o = new Float64Array(16);
    for (let j = 0; j < 4; j++) for (let r = 0; r < 4; r++){ let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * c[j * 4 + k]; o[j * 4 + r] = s; } return o; };
  const nodeM = n => { if (n.matrix) return Float64Array.from(n.matrix);
    const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const [x, y, z, w] = r, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return Float64Array.from([ (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
                               (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
                               (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1 ]); };
  const out = [];
  const walk = (i, par) => { const n = g.nodes[i], m = mul(par, nodeM(n));
    if (n.mesh != null) for (const p of g.meshes[n.mesh].primitives || []){
      const pos = acc(p.attributes.POSITION), v = new Float64Array(pos.length);
      for (let k = 0; k < pos.length; k += 3){
        v[k]     = m[0] * pos[k] + m[4] * pos[k + 1] + m[8]  * pos[k + 2] + m[12];
        v[k + 1] = m[1] * pos[k] + m[5] * pos[k + 1] + m[9]  * pos[k + 2] + m[13];
        v[k + 2] = m[2] * pos[k] + m[6] * pos[k + 1] + m[10] * pos[k + 2] + m[14];
      }
      out.push({ mat: p.material != null ? (g.materials[p.material].name || 'mat' + p.material) : 'mat', v,
                 idx: p.indices != null ? acc(p.indices) : null });
    }
    for (const c of n.children || []) walk(c, m); };
  const I = Float64Array.from([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  for (const r of g.scenes[g.scene || 0].nodes) walk(r, I);
  return out;
}

const r4 = v => +v.toFixed(4);
function bounds(parts){
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of parts) for (let i = 0; i < p.v.length; i += 3) for (let k = 0; k < 3; k++){
    const c = p.v[i + k]; if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c; }
  return { min: mn, max: mx, size: [0, 1, 2].map(k => mx[k] - mn[k]) };
}

// Profiles along an axis: the highest and lowest surface in each of N slabs. Every gun feature this file
// looks for is a bump in one of these two curves.
function profile(parts, axis, up, N, bb){
  const lo = bb.min[axis], span = bb.size[axis] || 1;
  const top = new Array(N).fill(-1e9), bot = new Array(N).fill(1e9), cnt = new Array(N).fill(0);
  const zmin = new Array(N).fill(1e9), zmax = new Array(N).fill(-1e9);
  const other = 3 - axis - up;
  for (const p of parts) for (let i = 0; i < p.v.length; i += 3){
    const b = Math.min(N - 1, Math.max(0, Math.floor((p.v[i + axis] - lo) / span * N)));
    const y = p.v[i + up], z = p.v[i + other];
    if (y > top[b]) top[b] = y; if (y < bot[b]) bot[b] = y;
    if (z < zmin[b]) zmin[b] = z; if (z > zmax[b]) zmax[b] = z;
    cnt[b]++;
  }
  return { top, bot, cnt, zmin, zmax, at: b => lo + (b + 0.5) / N * span, lo, span };
}
const median = a => { const s = a.filter(v => v > -1e8 && v < 1e8).slice().sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0; };

// A gun's five points. The reasoning per point is in the comments; the assumption that holds them all up
// is that the pack's guns lie along X with the muzzle at +X, which is asserted rather than trusted.
function deriveGun(id, parts){
  const bb = bounds(parts), N = 140, P = profile(parts, 0, 1, N, bb);
  const H = bb.size[1], L = bb.size[0];
  // WHICH END IS THE MUZZLE: the barrel end is thin and the stock end is tall. Measured over the outer
  // tenth of the length, because a scope or a carry handle can out-top the stock further in.
  const ext = (a, b) => { let m = -1e9, n = 1e9;
    for (let i = a; i < b; i++){ if (P.cnt[i]){ if (P.top[i] > m) m = P.top[i]; if (P.bot[i] < n) n = P.bot[i]; } } return m - n; };
  const front = ext(N - N / 10 | 0, N), rear = ext(0, N / 10 | 0);
  const muzzleAtPlusX = front < rear;
  // The bore: the barrel's own centre height, taken over the forward fifth where nothing but barrel and
  // sight exists. Mid-of-extent there, not the model centre — a rifle's mass is all below the bore.
  const f0 = muzzleAtPlusX ? Math.floor(N * 0.82) : 0, f1 = muzzleAtPlusX ? N : Math.ceil(N * 0.18);
  let bt = -1e9, bb2 = 1e9;
  for (let i = f0; i < f1; i++) if (P.cnt[i]){ if (P.top[i] > bt) bt = P.top[i]; if (P.bot[i] < bb2) bb2 = P.bot[i]; }
  const boreY = (bt + bb2) / 2;
  const tipX = muzzleAtPlusX ? bb.max[0] : bb.min[0];
  const dir = muzzleAtPlusX ? 1 : -1;

  // THE RECEIVER LINE, against which a sight is a bump: the median top height over the body of the gun,
  // excluding the outer eighth at each end (stock comb and muzzle device are not the receiver).
  const bodyTop = median(P.top.slice(Math.floor(N * 0.12), Math.ceil(N * 0.88)));
  // Sight candidates: contiguous runs standing clear of that line. 4% of the model's height is the floor —
  // below it, low-poly wobble in the top cover reads as a sight post.
  const thr = bodyTop + 0.04 * H, runs = [];
  for (let i = 0; i < N; i++){
    if (P.cnt[i] && P.top[i] > thr){
      const last = runs[runs.length - 1];
      if (last && i - last.end <= 1){ last.end = i; if (P.top[i] > last.peak){ last.peak = P.top[i]; last.at = i; } }
      else runs.push({ start: i, end: i, peak: P.top[i], at: i });
    }
  }
  // A run must be NARROW to be a sight. A scope tube or a carry handle spans a third of the gun; a post
  // and a notch are a couple of slabs each. 18% of the length is the cut, measured against the pack:
  // the widest real sight run in it is 9 slabs of 140 and the narrowest scope is 31.
  const scopes = runs.filter(r => (r.end - r.start + 1) > Math.max(3, N * 0.18));

  // THE GRIP: the rearmost thing hanging below the frame THAT IS NOT THE BUTTSTOCK. Three things hang low
  // on a rifle — butt, pistol grip, magazine — and the first pass took the rearmost of the three, which put
  // the hand on the buttpad of every long gun in the pack (see bench/results/model-placement.png, first
  // version). A run that reaches the model's rear end is the butt and is dropped; the rearmost survivor is
  // the pistol grip on an AK/SMG/pistol and the trigger guard on a full-stocked shotgun or bolt gun.
  const bodyBot = median(P.bot.slice(Math.floor(N * 0.12), Math.ceil(N * 0.88)));
  const gthr = bodyBot - 0.10 * H, gruns = [];
  for (let i = 0; i < N; i++){
    if (P.cnt[i] && P.bot[i] < gthr){
      const last = gruns[gruns.length - 1];
      if (last && i - last.end <= 2){ last.end = i; if (P.bot[i] < last.low){ last.low = P.bot[i]; last.at = i; } }
      else gruns.push({ start: i, end: i, low: P.bot[i], at: i });
    }
  }
  const butt = Math.round(N * 0.06);
  const held = gruns.filter(r => muzzleAtPlusX ? r.start > butt : r.end < N - butt);
  const rearmost = held.length ? (muzzleAtPlusX ? held[0] : held[held.length - 1]) : null;
  let gripX, gripY;
  if (rearmost){
    const depth = bodyBot - rearmost.low;
    gripX = P.at((rearmost.start + rearmost.end) / 2);
    // A SHALLOW RUN IS A TRIGGER GUARD, NOT A GRIP, and the hand goes BEHIND it — on the wrist of the stock.
    // Deep runs are the grip itself and the hand is on them, a third of the way down.
    if (depth < 0.18 * H){ gripX -= dir * 0.055 * L; gripY = bodyBot - 0.12 * H; }
    else gripY = bodyBot - 0.34 * depth;
  } else { gripX = P.at(N * (muzzleAtPlusX ? 0.30 : 0.70)); gripY = bodyBot + 0.1 * H; }

  // SIGHTS ONLY COUNT FORWARD OF THE HAND AND ABOVE THE BORE. Without those two conditions the comb of a
  // buttstock is a perfect false positive: narrow, standing well above the receiver line, and on every
  // stocked gun in the pack it beat the real rear sight.
  const sights = runs.filter(r => (r.end - r.start + 1) <= Math.max(3, N * 0.18))
    .filter(r => r.peak > boreY && (muzzleAtPlusX ? P.at(r.at) > gripX : P.at(r.at) < gripX));
  const fwd = a => muzzleAtPlusX ? a.at : -a.at;                 // sort key: bigger = closer to the muzzle
  sights.sort((a, b) => fwd(b) - fwd(a));
  const fs = sights[0] || null, rs = sights.length > 1 ? sights[sights.length - 1] : null;

  // TWO REGIONS THE GAME ANIMATES. index.html racks a shotgun's forend and drops a rifle's magazine, and a
  // one-primitive-per-material export has neither as a separate object — so the ranges they occupy are
  // recorded here and the triangles inside them are lifted out at build time (see splitTris in src/models/glb.js).
  //   woodFore: wood forward of the hand, which on a pump gun is the forend and nothing else.
  //   magRange: the low run forward of the hand, which is the magazine. Bounded above by the frame line or the
  //             box would swallow the barrel.
  let woodFore = null;
  { let lo = 1e9, hi = -1e9;
    for (const p of parts){ if (!/wood/i.test(p.mat)) continue;
      for (let i = 0; i < p.v.length; i += 3){ const x = p.v[i];
        if (muzzleAtPlusX ? x > gripX + 0.06 * L : x < gripX - 0.06 * L){ if (x < lo) lo = x; if (x > hi) hi = x; } } }
    if (hi > lo) woodFore = { from: r4(lo), to: r4(hi) }; }
  // A SCOPE IS FOUND BY ITS GLASS. The top-profile pass classifies a wide bump as an optic, and on this pack it
  // misses: the tube's own top dips below the threshold between the rings, so a scoped rifle came back with two
  // narrow "sights" (the rings) and no optic at all. The Glass material only ever exists on a lens, so its X
  // extent locates the optic exactly, and everything above the receiver line across that span is the optic —
  // which is what the game hides when a red dot is fitted instead (holosight XOR scope).
  let glass = null, opticY = null;
  { let lo = 1e9, hi = -1e9;
    for (const p of parts){ if (!/glass|lens/i.test(p.mat)) continue;
      for (let i = 0; i < p.v.length; i += 3){ const x = p.v[i]; if (x < lo) lo = x; if (x > hi) hi = x; } }
    if (hi > lo){
      glass = { from: r4(lo), to: r4(hi) };
      // THE OPTICAL AXIS IS THE GLASS'S OWN CENTRE, not the middle of everything standing above the receiver. The
      // first version averaged the optic's top with the LOWEST thing above the rail — its mount rings — and came out
      // 3 cm low on the sniper: aimed, the eyepiece sat 50 px below screen centre (bench/results/models/ads-hunting_rifle.png).
      // A lens IS the axis by definition, so it is measured off the lens.
      let t = -1e9, b2 = 1e9;
      for (const p of parts){ if (!/glass|lens/i.test(p.mat)) continue;
        for (let i = 0; i < p.v.length; i += 3){ const y = p.v[i + 1]; if (y > t) t = y; if (y < b2) b2 = y; } }
      if (t > -1e8) opticY = r4((t + b2) / 2);
    } }
  const magRun = held.find(r => muzzleAtPlusX ? P.at(r.at) > gripX + 0.04 * L : P.at(r.at) < gripX - 0.04 * L);
  const magRange = magRun ? { from: r4(P.at(magRun.start) - P.span / N), to: r4(P.at(magRun.end) + P.span / N), top: r4(bodyBot) } : null;

  return {
    axis: { long: 'x', up: 'y', muzzleAtPlusX, dir },
    woodFore, magRange, glassRange: glass,
    bbox: { min: bb.min.map(r4), max: bb.max.map(r4), size: bb.size.map(r4) },
    boreY: r4(boreY),
    gripPoint:          { position: [r4(gripX), r4(gripY), 0], rotation: [0, 0, 0] },
    directionIndicator: { position: [r4(tipX + dir * 0.25 * L), r4(boreY), 0], rotation: [0, r4(dir > 0 ? -Math.PI / 2 : Math.PI / 2), 0] },
    barrelTip:          { position: [r4(tipX), r4(boreY), 0], rotation: [0, 0, 0] },
    frontSight: fs ? { position: [r4(P.at(fs.at)), r4(fs.peak), 0] } : null,
    rearSight:  rs ? { position: [r4(P.at(rs.at)), r4(rs.peak), 0] } : null,
    railTop: r4(bodyTop),
    // A wide bump on top is a scope or a carry handle; the sight line of a scoped gun is its tube's centre,
    // not the irons, so it is measured here and the game's ADS lift reads it (see GLB_GUNS' sightY).
    opticAxisY: opticY != null ? opticY : scopes.length ? (() => { const s = scopes.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
      let t = -1e9, b2 = 1e9;
      for (let i = s.start; i <= s.end; i++) if (P.cnt[i]){ if (P.top[i] > t) t = P.top[i]; if (P.bot[i] < b2) b2 = P.bot[i]; }
      return r4(Math.max(bodyTop, (t + Math.max(b2, bodyTop)) / 2)); })() : null,
    scopeRuns: scopes.map(s => ({ from: r4(P.at(s.start)), to: r4(P.at(s.end)), top: r4(s.peak) })),
  };
}

// Everything that is not a gun: the axis it lies along, which end the hand takes, and the direction it
// points when held. The thin end of a long object is its handle — true of an axe, a shovel, a knife, a
// paddle and a torch, which is the whole of what needs a grip here.
function deriveObject(id, parts){
  const bb = bounds(parts);
  const long = bb.size.indexOf(Math.max(...bb.size));
  const up = long === 1 ? 0 : 1;
  const N = 60, P = profile(parts, long, up, N, bb);
  const width = i => (P.cnt[i] ? Math.max(P.top[i] - P.bot[i], P.zmax[i] - P.zmin[i]) : 0);
  let wFront = 0, wBack = 0;
  for (let i = 0; i < N / 4; i++) wBack = Math.max(wBack, width(i));
  for (let i = N - N / 4 | 0; i < N; i++) wFront = Math.max(wFront, width(i));
  const headAtMax = wFront > wBack;                         // the bulky end is the head; the hand takes the other
  const t = headAtMax ? 0.18 : 0.82;                        // 18% up the handle from its butt
  const pos = [0, 0, 0];
  pos[long] = bb.min[long] + t * bb.size[long];
  const other = 3 - long - up;
  pos[up] = (P.top[Math.min(N - 1, Math.floor(t * N))] + P.bot[Math.min(N - 1, Math.floor(t * N))]) / 2;
  pos[other] = 0;
  const dirp = pos.slice(); dirp[long] = headAtMax ? bb.max[long] : bb.min[long];
  return {
    axis: { long: 'xyz'[long], up: 'xyz'[up], headAtMax },
    bbox: { min: bb.min.map(r4), max: bb.max.map(r4), size: bb.size.map(r4) },
    gripPoint:          { position: pos.map(r4), rotation: [0, 0, 0] },
    directionIndicator: { position: dirp.map(r4), rotation: [0, 0, 0] },
  };
}

// Where the geometry lies, and why. Each entry says what the automatic pass found and what is true instead;
// values are in model units, in the model's own frame.
const OVERRIDE = {
  // (populated from the inspect renders — see tools/models/inspect.html)
};

const manifest = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8'));
const out = {};
for (const m of manifest.models){
  const parts = glbParts(path.join(ROOT, m.path));
  const d = m.category === 'guns' ? deriveGun(m.id, parts) : deriveObject(m.id, parts);
  d.modelId = m.id; d.category = m.category;
  if (OVERRIDE[m.id]) { Object.assign(d, OVERRIDE[m.id]); d.overridden = Object.keys(OVERRIDE[m.id]); }
  out[m.id] = d;
}
fs.writeFileSync(path.join(MODELS, 'placement-data.json'), JSON.stringify({
  note: 'Generated by tools/models/derive-placement.mjs from the geometry. Positions are in each model\'s own units and frame (+X muzzle, +Y up for guns). Hand-pinned entries carry "overridden".',
  models: out }, null, 1) + '\n');

const g = manifest.models.filter(m => m.category === 'guns');
console.log('placement-data.json: ' + Object.keys(out).length + ' models, ' + g.length + ' guns');
for (const m of g){ const d = out[m.id];
  console.log('  ' + m.id.padEnd(32), 'muzzle+X=' + d.axis.muzzleAtPlusX,
    'tip', d.barrelTip.position.join(','), '| grip', d.gripPoint.position.join(','),
    '| fs', d.frontSight ? d.frontSight.position.join(',') : '—',
    '| rs', d.rearSight ? d.rearSight.position.join(',') : '—',
    d.scopeRuns.length ? '| scope ' + d.scopeRuns.map(s => s.from + '..' + s.to).join(' ') : ''); }
