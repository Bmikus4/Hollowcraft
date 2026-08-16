// ONE LINE PER GUN: where its front and rear sight roots are.
//
// tools/models/sight-profile.mjs prints a gun's whole centreline ridge, which is the right tool when a person is
// choosing a number and arguing with it. Authoring eighteen guns at once needs the other shape: the same
// measurement, reduced to the two roots and the metal they stand on, so a table can be written and then checked
// against the profiles one at a time where it looks wrong.
//
// THE RULE, and it is the same one sight-profile documents. Only geometry within CORE of the model's half-width is
// on the centreline — receivers, gas blocks and stocks are wide, sights are narrow and sit on the bore line, and
// profiling the whole top of a model is how a "front sight" turns out to be the magazine's top edge. The FRONT root
// is the highest such point forward of 55% of the length; the REAR root is the highest behind 45%. Both are printed
// with the height of the metal under them so a reader can see how far a post would have to stand.
//
// Output units are the MODEL's own, which is what GLB_GUNS' sights:{fx,fy,rx,ry} are authored in.
//
// Run: node tools/models/sight-pick.mjs guns/pistol guns/ak ...
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const MODELS = path.join(ROOT, 'assets/models');
const CORE = 0.34;
const N = 140;

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
      out.push({ v, idx: p.indices != null ? acc(p.indices) : null });
    }
    for (const c of n.children || []) walk(c, m); };
  const I = Float64Array.from([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  for (const r of g.scenes[g.scene || 0].nodes) walk(r, I);
  return out;
}

// SAMPLE THE TRIANGLES, NOT THE VERTICES — sight-profile's own note, and it matters more here because the answer is
// a single maximum: a slice with no vertex in it reads as a hole, and a hole next to a post makes the post look like
// a spike standing on nothing.
function ridge(parts){
  let mnx=1e9,mxx=-1e9,mnz=1e9,mxz=-1e9;
  for (const p of parts) for (let i=0;i<p.v.length;i+=3){ const x=p.v[i], z=p.v[i+2];
    if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(z<mnz)mnz=z; if(z>mxz)mxz=z; }
  const cz=(mnz+mxz)/2, half=(mxz-mnz)/2, len=mxx-mnx;
  const top=new Array(N).fill(-1e9);
  const put=(x,y,z)=>{ if(Math.abs(z-cz)>half*CORE) return;
    const s=Math.min(N-1,Math.max(0,Math.floor((x-mnx)/len*N))); if(y>top[s]) top[s]=y; };
  for (const p of parts){
    const idx=p.idx, n=idx?idx.length:p.v.length/3;
    for (let t=0;t<n;t+=3){
      const a=(idx?idx[t]:t)*3, b=(idx?idx[t+1]:t+1)*3, c=(idx?idx[t+2]:t+2)*3;
      const S=6;
      for(let u=0;u<=S;u++) for(let w=0;w+u<=S;w++){
        const fu=u/S, fw=w/S, fv=1-fu-fw;
        put(p.v[a]*fv+p.v[b]*fu+p.v[c]*fw, p.v[a+1]*fv+p.v[b+1]*fu+p.v[c+1]*fw, p.v[a+2]*fv+p.v[b+2]*fu+p.v[c+2]*fw);
      }
    }
  }
  return { top, mnx, mxx, len };
}

for (const id of process.argv.slice(2)){
  const file = path.join(MODELS, id + '.glb');
  if (!fs.existsSync(file)){ console.log(id, 'MISSING'); continue; }
  const { top, mnx, len } = ridge(glbParts(file));
  const at = s => mnx + (s + 0.5) / N * len;
  let fs_ = -1, rs = -1;
  for (let s = 0; s < N; s++){
    if (top[s] < -1e8) continue;
    const f = (at(s) - mnx) / len;
    if (f > 0.55 && (fs_ < 0 || top[s] > top[fs_])) fs_ = s;
    if (f < 0.45 && (rs < 0 || top[s] > top[rs])) rs = s;
  }
  if (fs_ < 0 || rs < 0){ console.log(id, 'no centreline geometry'); continue; }
  const fy = top[fs_], ry = top[rs], hi = Math.max(fy, ry);
  console.log(id.padEnd(34) + ' fx:' + at(fs_).toFixed(3) + ' fy:' + fy.toFixed(3) +
              '  rx:' + at(rs).toFixed(3) + ' ry:' + ry.toFixed(3) +
              '  radius:' + (at(fs_) - at(rs)).toFixed(2) + '  drop:' + (fy - ry).toFixed(3) + '  top:' + hi.toFixed(3));
}
