// WHERE IS THE BOLT HANDLE? The reload animation has a limb that lifts and pulls a bolt (`if(M&&M.bolt)`), and it
// has never moved anything, because no code carves a bolt out of the one-piece rifle mesh and the placement pass has
// no landmark for one. This finds it the way tools/gun-cylinder.py found the revolver's drum: off the mesh.
//
// A BOLT HANDLE IS THE THING THAT STICKS OUT SIDEWAYS. A rifle is a long, narrow object whose width barely varies —
// except at the handle, which is a knob on a stalk projecting from one side of the receiver, and (on these models)
// the only geometry that does so behind the ejection port. So: slice along the barrel, and in each slice measure how
// far the widest vertex reaches from the centreline. The handle is the run of slices where that reach jumps.
//
// Output is the MODEL's own units, the same ones GLB_GUNS is authored in.
//
// Run: node tools/models/bolt-handle.mjs guns/sniper-rifle [more ids...]
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const MODELS = path.join(ROOT, 'assets/models');
const N = 120;

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
      out.push({ mat: p.material != null ? (g.materials[p.material].name || 'mat' + p.material) : 'mat', v });
    }
    for (const c of n.children || []) walk(c, m); };
  const I = Float64Array.from([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  for (const r of g.scenes[g.scene || 0].nodes) walk(r, I);
  return out;
}

function report(id){
  const file = path.join(MODELS, id + '.glb');
  if (!fs.existsSync(file)) { console.log(id, 'MISSING'); return; }
  const parts = glbParts(file);
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
  for (const p of parts) for (let i = 0; i < p.v.length; i += 3){
    const x = p.v[i], z = p.v[i+2];
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  const cz = (mnz + mxz) / 2, len = mxx - mnx;
  // Per slice: the furthest reach either side of the centreline, and the y of whatever reached furthest.
  const R = new Array(N).fill(0).map(() => ({ pos: 0, neg: 0, py: 0, ny: 0 }));
  for (const p of parts) for (let i = 0; i < p.v.length; i += 3){
    const x = p.v[i], y = p.v[i+1], dz = p.v[i+2] - cz;
    const s = Math.min(N - 1, Math.max(0, Math.floor((x - mnx) / len * N)));
    if (dz > R[s].pos) { R[s].pos = dz; R[s].py = y; }
    if (dz < R[s].neg) { R[s].neg = dz; R[s].ny = y; }
  }
  const width = R.map(r => Math.max(r.pos, -r.neg));
  // EMPTY SLICES ARE NOT NARROW ONES. These models are ~1300 triangles, so a slice can contain no VERTEX at all and
  // still be solid metal; counting those zeros made the median zero and every bulge "Infinity x median".
  const sorted = width.filter(w => w > 0).slice().sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  console.log('\n' + id + '   x ' + mnx.toFixed(3) + '..' + mxx.toFixed(3) + '   half-width median ' + med.toFixed(3));
  // A run of slices reaching more than 1.35x the median, in the rear 60% of the gun: that is a handle, a charging
  // handle or a bolt knob. Everything is printed rather than one answer, for the same reason sight-profile prints
  // the whole ridge — the number that goes into GLB_GUNS is chosen by a person looking at the gun.
  let run = null;
  for (let s = 0; s < N; s++){
    const x = mnx + (s + 0.5) / N * len, wide = width[s] > med * 1.35 && (x - mnx) < len * 0.62;
    if (wide && !run) run = { x0: x, x1: x, w: width[s], y0: R[s].pos > -R[s].neg ? R[s].py : R[s].ny, side: R[s].pos > -R[s].neg ? '+z' : '-z' };
    else if (wide) { run.x1 = x; run.w = Math.max(run.w, width[s]); }
    else if (run) { if (run.x1 - run.x0 > len * 0.01) console.log('  bulge  x ' + run.x0.toFixed(3) + '..' + run.x1.toFixed(3) +
        '  reach ' + run.w.toFixed(3) + '  (' + (run.w / med).toFixed(2) + 'x median)  y~' + run.y0.toFixed(3) + '  side ' + run.side); run = null; }
  }
  if (run) console.log('  bulge  x ' + run.x0.toFixed(3) + '..' + run.x1.toFixed(3) + '  reach ' + run.w.toFixed(3) + '  y~' + run.y0.toFixed(3) + '  side ' + run.side);
}

const ids = process.argv.slice(2);
if (!ids.length) { console.log('usage: node tools/models/bolt-handle.mjs guns/sniper-rifle'); process.exit(1); }
for (const id of ids) report(id);
