// The top of a gun, along its own centreline, printed as numbers you can author a sight block from.
//
//   node tools/models/sight-profile.mjs pistol revolver-snub          → those models
//   node tools/models/sight-profile.mjs --all                          → every gun in the pack
//
// WHY THIS EXISTS AND WHY IT IS NOT derive-placement.mjs. That file picks ONE front and ONE rear sight per
// model with a single heuristic, and docs/GUN-MODEL-INDEX.md records the four places it is wrong: on every
// sniper it finds the moulded scope, and on the SMG it puts both markers 0.14 apart on the same rail bump.
// A single answer cannot be argued with. This prints the whole ridge instead — every bump on the centreline,
// with the height of the metal each one stands on — so the number written into GLB_GUNS is chosen per weapon
// by a person looking at the gun's own profile, which is what G3 in the handoff demands.
//
// THE CENTRELINE IS THE POINT. Sights are narrow and sit on the bore line; receivers, gas blocks and stocks
// are wide. Profiling the whole model's top confuses the two — that is how a "front sight" ends up being the
// magazine's top edge. Only geometry within CORE of the model's half-width counts here, so a bump in this
// chart is something a shooter could actually look over.
//
// Output units are the MODEL's own (the same ones printed in docs/GUN-MODEL-INDEX.md and on the contact
// sheets), because GLB_GUNS' sights:{fx,fy,rx,ry} are in model units too. `rise` is not derivable here: it is
// in GAME units and is how far above the metal the sight line sits, which is a matter of what the shooter
// sees.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODELS = path.join(ROOT, 'assets/models');
const CORE = 0.34;   // fraction of the model's half-width that counts as "on the centreline"
const N = 96;        // slices along the barrel

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

// SAMPLE THE TRIANGLES, NOT THE VERTICES. These models are ~1300 triangles: a slice 2 cm wide across a
// pistol's slide contains no vertex at all for most of its length, so a vertex-only profile reads the
// trigger guard as the top of the gun and the ridge comes out full of holes. Each triangle is instead walked
// on a barycentric grid fine enough that no slice it crosses is missed.
function ridge(parts){
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, mny = 1e9, mxy = -1e9;
  for (const p of parts) for (let i = 0; i < p.v.length; i += 3){
    const x = p.v[i], y = p.v[i+1], z = p.v[i+2];
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  const zc = (mnz + mxz) / 2, half = (mxz - mnz) / 2 || 1, span = mxx - mnx || 1;
  const step = span / N / 2;
  const top = new Array(N).fill(null), wide = new Array(N).fill(-1e9);
  const hit = (x, y, z) => {
    const s = Math.min(N - 1, Math.max(0, Math.floor((x - mnx) / span * N)));
    if (y > wide[s]) wide[s] = y;
    if (Math.abs(z - zc) > CORE * half) return;
    if (top[s] == null || y > top[s]) top[s] = y;
  };
  for (const p of parts){
    const v = p.v, idx = p.idx, n = idx ? idx.length : v.length / 3;
    for (let t = 0; t < n; t += 3){
      const a = (idx ? idx[t] : t) * 3, b = (idx ? idx[t+1] : t+1) * 3, c = (idx ? idx[t+2] : t+2) * 3;
      const e = Math.max(Math.abs(v[b] - v[a]), Math.abs(v[c] - v[a]), Math.abs(v[c] - v[b]),
                         Math.abs(v[b+2] - v[a+2]), Math.abs(v[c+2] - v[a+2]));
      const k = Math.min(48, Math.max(1, Math.ceil(e / step)));
      for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++){
        const u = i / k, w = j / k, q = 1 - u - w;
        hit(v[a]*q + v[b]*u + v[c]*w, v[a+1]*q + v[b+1]*u + v[c+1]*w, v[a+2]*q + v[b+2]*u + v[c+2]*w);
      }
    }
  }
  return { mnx, mxx, mny, mxy, mnz, mxz, span, top, wide, slice: span / N };
}

// A BUMP IS WHAT STANDS ABOVE ITS NEIGHBOURS, not what is tallest. The tallest point on a bolt gun is the
// scope and on an AK the rear leaf; both are true and neither is the whole answer. So each slice is scored
// against the median of the metal within a window either side of it, and anything standing clear of that
// local metal by more than TOL is reported with the height of the surface it stands on — which is exactly
// the pair (fx, fy) a sights block wants.
function bumps(R){
  const W = Math.max(3, Math.round(N * 0.09)), out = [];
  const local = i => {
    const s = [];
    for (let k = i - W; k <= i + W; k++) if (k >= 0 && k < N && R.top[k] != null && Math.abs(k - i) > 1) s.push(R.top[k]);
    s.sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  // 0.025 is absolute, in model units, and that is deliberate: the pack is modelled to real proportions
  // (about six units to the metre), so a sight stands the same 0.03-0.15 units clear whether it is on a
  // pistol or on a bolt gun. A threshold scaled to the model's own length would demand a 7-cm sight on a
  // sniper rifle and find one on a pistol at 2 cm.
  for (let i = 0; i < N; i++){
    if (R.top[i] == null) continue;
    const base = local(i); if (base == null) continue;
    const rel = R.top[i] - base;
    if (rel < 0.025) continue;
    out.push({ x: R.mnx + (i + 0.5) * R.slice, y: R.top[i], stands: base, rel });
  }
  // collapse neighbouring slices into one feature, keeping the tallest slice of each run
  const feat = [];
  for (const b of out){
    const last = feat[feat.length - 1];
    if (last && b.x - last.x < R.slice * 2.5){ if (b.y > last.y) feat[feat.length - 1] = b; }
    else feat.push(b);
  }
  return feat;
}

const f = v => (v >= 0 ? ' ' : '') + v.toFixed(3);
// Only the top third of the model is drawn. A sight is a 0.05-unit bump on a gun 1.2 units tall; over the
// full height it is a third of one character row and invisible, which is the whole thing this chart is for.
function draw(R){
  const rows = 14, hi = R.mxy, lo = hi - 0.34 * ((R.mxy - R.mny) || 1), h = (hi - lo) || 1;
  const grid = Array.from({ length: rows }, () => new Array(N).fill(' '));
  const row = y => rows - 1 - Math.min(rows - 1, Math.max(0, Math.floor((y - lo) / h * rows)));
  for (let i = 0; i < N; i++){
    if (R.top[i] == null) continue;
    grid[row(R.top[i])][i] = '#';
    const rw = row(R.wide[i]);
    if (grid[rw][i] === ' ') grid[rw][i] = '.';
  }
  const out = grid.map((g, r) => '  ' + (lo + (rows - 0.5 - r) / rows * h).toFixed(2).padStart(6) + ' |' + g.join(''));
  out.push('         ' + '+' + '-'.repeat(N));
  out.push('          ' + R.mnx.toFixed(2).padEnd(N / 2) + R.mxx.toFixed(2));
  return out.join('\n');
}

const place = JSON.parse(fs.readFileSync(path.join(MODELS, 'placement-data.json'), 'utf8')).models;
let ids = process.argv.slice(2);
if (!ids.length || ids[0] === '--all')
  ids = Object.keys(place).filter(k => k.startsWith('guns/')).map(k => k.slice(5));

for (const raw of ids){
  const id = raw.startsWith('guns/') ? raw : 'guns/' + raw;
  const file = path.join(MODELS, id + '.glb');
  if (!fs.existsSync(file)){ console.log(`\n== ${id} — NOT ON DISK`); continue; }
  const R = ridge(glbParts(file)), P = place[id] || {};
  console.log(`\n=== ${id}`);
  console.log(`  x ${f(R.mnx)} .. ${f(R.mxx)}   y ${f(R.mny)} .. ${f(R.mxy)}   slice ${R.slice.toFixed(3)}`);
  console.log(`  placement: boreY ${P.boreY}  railTop ${P.railTop}  barrelTip x ${P.barrelTip && P.barrelTip.position[0]}` +
              `  grip ${P.gripPoint ? P.gripPoint.position.slice(0, 2).map(f).join(',') : '-'}` +
              `  derivedFront ${P.frontSight ? P.frontSight.position.slice(0, 2).map(f).join(',') : '-'}` +
              `  derivedRear ${P.rearSight ? P.rearSight.position.slice(0, 2).map(f).join(',') : '-'}`);
  console.log('  # = centreline top, . = widest top (a . above a # is metal off the sight line)');
  console.log(draw(R));
  // The chart says WHERE to look; these numbers are what gets typed into the sights block. fy and ry are
  // read straight out of this column: the height of the metal at the x the sight roots into.
  console.log('  centreline top, x -> y (model units):');
  for (let i = 0; i < N; i += 8){
    const cells = [];
    for (let k = i; k < Math.min(N, i + 8); k++)
      cells.push(`${(R.mnx + (k + 0.5) * R.slice).toFixed(2).padStart(6)}:${R.top[k] == null ? '  --  ' : R.top[k].toFixed(3).padStart(6)}`);
    console.log('   ' + cells.join(' '));
  }
  const B = bumps(R);
  console.log('  centreline bumps (x, top y, the metal it stands on, how far it stands clear):');
  for (const b of B) console.log(`    x ${f(b.x)}   y ${f(b.y)}   stands on ${f(b.stands)}   +${b.rel.toFixed(3)}`);
  if (!B.length) console.log('    none — this model has no sight geometry on its centreline');
}
