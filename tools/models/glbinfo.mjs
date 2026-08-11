// Parse GLB containers straight off disk: JSON chunk only, no three.js. Reports what each model
// actually contains (nodes, meshes, primitives, materials, textures, images) plus a bbox derived
// from accessor min/max through the node transform chain.
import fs from 'fs';
import path from 'path';

export function readGlb(file){
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb: '+file);
  let off = 12, json = null, bin = null;
  while (off < b.length){
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off+4);
    const data = b.subarray(off+8, off+8+len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0;
    off += (4 - (off % 4)) % 4;
  }
  return { json, bin, bytes: b.length };
}

function mul(a, b){ // 4x4 column-major
  const o = new Array(16);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++){
    let s=0; for (let k=0;k<4;k++) s += a[k*4+r]*b[c*4+k];
    o[c*4+r]=s;
  }
  return o;
}
const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function nodeMatrix(n){
  if (n.matrix) return n.matrix.slice();
  const t = n.translation||[0,0,0], r = n.rotation||[0,0,0,1], s = n.scale||[1,1,1];
  const [x,y,z,w]=r, x2=x+x,y2=y+y,z2=z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return [ (1-(yy+zz))*s[0], (xy+wz)*s[0], (xz-wy)*s[0], 0,
           (xy-wz)*s[1], (1-(xx+zz))*s[1], (yz+wx)*s[1], 0,
           (xz+wy)*s[2], (yz-wx)*s[2], (1-(xx+yy))*s[2], 0,
           t[0], t[1], t[2], 1 ];
}
function xform(m,p){ return [ m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
                              m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
                              m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14] ]; }

export function summarize(file){
  const { json:g, bytes } = readGlb(file);
  const min=[1e9,1e9,1e9], max=[-1e9,-1e9,-1e9];
  const prims=[]; let tris=0;
  const walk=(idx, parent)=>{
    const n=g.nodes[idx], m=mul(parent, nodeMatrix(n));
    if (n.mesh!=null){
      for (const p of g.meshes[n.mesh].primitives||[]){
        const acc=g.accessors[p.attributes.POSITION];
        if (p.indices!=null) tris += g.accessors[p.indices].count/3; else tris += acc.count/3;
        prims.push({ mesh:g.meshes[n.mesh].name, mat:p.material!=null?(g.materials[p.material].name||('mat'+p.material)):null,
                     matIdx:p.material, node:n.name, attrs:Object.keys(p.attributes) });
        // eight corners of the local aabb through the world matrix
        for (let c=0;c<8;c++){
          const q=[ c&1?acc.max[0]:acc.min[0], c&2?acc.max[1]:acc.min[1], c&4?acc.max[2]:acc.min[2] ];
          const w=xform(m,q);
          for (let k=0;k<3;k++){ if(w[k]<min[k])min[k]=w[k]; if(w[k]>max[k])max[k]=w[k]; }
        }
      }
    }
    for (const c of n.children||[]) walk(c, m);
  };
  const scene=g.scenes[g.scene||0];
  for (const r of scene.nodes) walk(r, I);
  const mats=(g.materials||[]).map(m=>({ name:m.name,
      color:m.pbrMetallicRoughness&&m.pbrMetallicRoughness.baseColorFactor,
      tex:!!(m.pbrMetallicRoughness&&m.pbrMetallicRoughness.baseColorTexture),
      metallic:m.pbrMetallicRoughness&&m.pbrMetallicRoughness.metallicFactor,
      rough:m.pbrMetallicRoughness&&m.pbrMetallicRoughness.roughnessFactor }));
  return { file:path.basename(file), bytes, nodes:(g.nodes||[]).length, meshes:(g.meshes||[]).length,
           prims:prims.length, tris:Math.round(tris), materials:mats, images:(g.images||[]).length,
           textures:(g.textures||[]).length, animations:(g.animations||[]).length,
           bbox:{ min:min.map(v=>+v.toFixed(4)), max:max.map(v=>+v.toFixed(4)),
                  size:[0,1,2].map(k=>+(max[k]-min[k]).toFixed(4)) },
           primList:prims };
}

if (process.argv[2]){
  const dir=process.argv[2];
  const files=fs.readdirSync(dir).filter(f=>/\.glb$/i.test(f)).map(f=>path.join(dir,f));
  const out=files.map(f=>{ try{ return summarize(f); }catch(e){ return {file:path.basename(f), err:String(e)}; } });
  if (process.argv[3]==='--json') console.log(JSON.stringify(out,null,1));
  else for (const s of out){
    if (s.err){ console.log(s.file.padEnd(38), 'ERR', s.err); continue; }
    console.log(s.file.padEnd(38), 'tri'+String(s.tris).padStart(6), 'prim'+String(s.prims).padStart(3),
      'img'+s.images, 'anim'+s.animations, 'size', s.bbox.size.join('/'),
      '| mats:', s.materials.map(m=>(m.name||'?')+(m.tex?'[T]':'')+(m.color?'#'+m.color.slice(0,3).map(c=>Math.round(c*255).toString(16).padStart(2,'0')).join(''):'')).join(' '));
  }
}
