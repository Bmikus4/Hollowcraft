// STONE AND SULFUR, SOFTENED (Ben 08-17: "give sulfur and stone a friendlier texture"). Run when the pack changes:
//   node tools/pack-soften.mjs          -> assets/blocks/stone.png, sulfur_ore.png
//   node tools/pack-soften.mjs --list   -> print the table without writing anything
//
// TWO SURFACES THE PLAYER IS NEVER MORE THAN A FEW BLOCKS FROM: stone is every cave wall, cliff and mountain, and the
// sulfur node is what he mines for powder. Both were harsh in different ways and the numbers say how.
//
// HARSHNESS IS HIGH-FREQUENCY ENERGY, and that is the number this tool moves. The mean absolute difference between
// neighbouring texels is what the eye reads as "noisy": a tile can have a wide range and still be pleasant if the
// variation is slow (mottling), and a narrow range and still be harsh if every texel fights its neighbour (a dither).
// Measured on what shipped: our stone IS the pack's stone at hf 7.40, and the sulfur painter is salt and pepper --
// 34% of texels one grey and the rest a yellow with a jitter of 46 on the blue channel, at texel frequency.
//
// STONE TAKES TUFF, WHICH IS THE SOFTEST GREY THE PACK HAS. Swept over its stone-like tiles at 128px, hf: tuff 5.68,
// deepslate 6.27, stone 7.40, andesite 7.43, smooth_stone 7.67, calcite 13.61, diorite 14.70. Deepslate is darker than
// stone should be and is already our `slate`; tuff is neutral (91,92,91) and slow-varying, which is the mottled look
// this is for.
// THEN CONTRAST IS PULLED IN and the MEAN IS PUT BACK. Scaling every texel toward the tile's own mean lowers hf
// proportionally without touching the shape of anything; restoring the mean afterwards is what keeps a cave the
// brightness it was, because stone is most of what a cave is made of and moving it moves the whole world's value.
//
// SULFUR TAKES THE PACK'S OWN sulfur, which is an exact name and needs nothing but a copy: rgb 181,168,95 at hf 7.41
// against a painter that was dithering at every texel. The contrast lever is available to it too and is set to 1 --
// the pack tile is already calm, and softening it further would lose the crystalline read that says "ore".
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ZIP = 'D:/Content/Desktop-Assets/ModernArch v3.0.6 [26.2] [128x].zip';
const OUT = path.resolve(process.argv[1], '..', '..', 'assets', 'blocks');
const P = 'assets/minecraft/textures/block/';

// ours          pack entry   contrast  keep the mean at   why
const MAP = [
  ['stone',      'tuff',      0.80,     107.5,  'the softest grey in the pack; 107.5 is the mean the world already has'],
  ['sulfur_ore', 'sulfur',    1.00,     null,   'the pack ships a block called sulfur; the painter it replaces was a dither'],
];

function zipEntries(file){
  const b = fs.readFileSync(file);
  let eocd=-1; for(let i=b.length-22;i>=0;i--) if(b.readUInt32LE(i)===0x06054b50){ eocd=i; break; }
  if(eocd<0) throw new Error('not a zip');
  const n=b.readUInt16LE(eocd+10); let off=b.readUInt32LE(eocd+16);
  const map=new Map();
  for(let k=0;k<n;k++){
    const nameLen=b.readUInt16LE(off+28), extLen=b.readUInt16LE(off+30), cmtLen=b.readUInt16LE(off+32);
    map.set(b.toString('latin1', off+46, off+46+nameLen), {lho:b.readUInt32LE(off+42), method:b.readUInt16LE(off+10), csize:b.readUInt32LE(off+20)});
    off += 46+nameLen+extLen+cmtLen;
  }
  return {b, map};
}
function read({b,map}, name){
  const e=map.get(name); if(!e) return null;
  const lNameLen=b.readUInt16LE(e.lho+26), lExtLen=b.readUInt16LE(e.lho+28);
  const start=e.lho+30+lNameLen+lExtLen, raw=b.subarray(start, start+e.csize);
  return e.method===0 ? raw : zlib.inflateRawSync(raw);
}

// ---- PNG in and out, RGBA8, the same pair pack-grass.mjs uses ----
function crc32(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320 & -(c&1)); } return ~c>>>0; }
function pngRead(buf){
  let p=8, w=0,h=0,bd=0,ct=0; const idat=[];
  while(p<buf.length){ const len=buf.readUInt32BE(p), type=buf.toString('latin1',p+4,p+8), data=buf.subarray(p+8,p+8+len);
    if(type==='IHDR'){ w=data.readUInt32BE(0); h=data.readUInt32BE(4); bd=data[8]; ct=data[9]; }
    else if(type==='IDAT') idat.push(data);
    p += 12+len; }
  if(bd!==8 || (ct!==6 && ct!==2)) throw new Error('need 8-bit RGB/RGBA, got bd '+bd+' ct '+ct);
  const ch = ct===6?4:3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w*h*4); const stride=w*ch;
  const prev=new Uint8Array(stride), line=new Uint8Array(stride);
  let q=0;
  for(let y=0;y<h;y++){
    const f=raw[q++]; raw.copy(line,0,q,q+stride); q+=stride;
    for(let i=0;i<stride;i++){
      const a=i>=ch?line[i-ch]:0, b2=prev[i], c=i>=ch?prev[i-ch]:0; let v=line[i];
      if(f===1) v+=a; else if(f===2) v+=b2; else if(f===3) v+=(a+b2)>>1;
      else if(f===4){ const pp=a+b2-c, pa=Math.abs(pp-a), pb=Math.abs(pp-b2), pc=Math.abs(pp-c);
        v += (pa<=pb&&pa<=pc)?a:(pb<=pc?b2:c); }
      line[i]=v&255; }
    for(let x=0;x<w;x++){ const s=x*ch, d=(y*w+x)*4;
      px[d]=line[s]; px[d+1]=line[s+1]; px[d+2]=line[s+2]; px[d+3]= ch===4?line[s+3]:255; }
    prev.set(line);
  }
  return {w,h,px};
}
function pngWrite(file,{w,h,px}){
  const stride=w*4, raw=Buffer.alloc((stride+1)*h);
  for(let y=0;y<h;y++){ raw[y*(stride+1)]=0; Buffer.from(px.buffer, px.byteOffset+y*stride, stride).copy(raw, y*(stride+1)+1); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6;
  const chunk=(type,data)=>{ const b=Buffer.alloc(8+data.length+4); b.writeUInt32BE(data.length,0); b.write(type,4,'latin1');
    data.copy(b,8); b.writeUInt32BE(crc32(b.subarray(4,8+data.length)),8+data.length); return b; };
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]));
}
// Multiply a grey master so its OPAQUE mean lands on `target`, per channel off the luma so the pack's own light and
// shade survive. Transparent texels are left alone: a cutout's colour outside the plant is meaningless and scaling it
// only risks a coloured fringe where the atlas filter reaches past the edge.
// PER CHANNEL, not off the luma, and that is the difference between a plant and a silhouette. pack-grass.mjs divides by
// the luma because its master is GREY, where per-channel and luma are the same number. These are not grey: this pack
// bakes a dark olive into the fern, the bush, the vine and the sapling and leaves Minecraft to multiply a biome colour
// over it, so their blue channel is nearly empty -- fern 57,87,13. Scaling all three by one luma factor cannot put blue
// back, and a plant with no blue in it reads as a black cut-out against a lit world, which is exactly how they first
// went in. Matching each channel's own mean to the painter's lands the tile on our palette whatever the pack baked in.
function tint(img, target){
  const sum=[0,0,0]; let n=0;
  for(let i=0;i<img.w*img.h;i++){ if(img.px[i*4+3]<8) continue; sum[0]+=img.px[i*4]; sum[1]+=img.px[i*4+1]; sum[2]+=img.px[i*4+2]; n++; }
  const mean=sum.map(v=>v/Math.max(n,1));
  // AN OFFSET, NOT A MULTIPLY, and the fern is why. A ratio on a channel that is nearly empty amplifies what little is
  // there: the pack's fern has mean blue 13, the painter's is 45, so a multiply is x3.5 applied to noise -- and the
  // texels that DID hold blue tripled with it. In the world that read as a fern with one blue frond. An offset moves
  // the mean by exactly the same amount and leaves every channel's contrast alone, which is what "keep the pack's
  // detail, keep our palette" actually means.
  const d=target.map((t,c)=>t-mean[c]);
  const out=new Uint8Array(img.px.length);
  for(let i=0;i<img.w*img.h;i++){ const a=img.px[i*4+3]; out[i*4+3]=a;
    for(let c=0;c<3;c++) out[i*4+c] = a<8 ? img.px[i*4+c] : Math.max(0,Math.min(255, Math.round(img.px[i*4+c]+d[c]))); }
  return {w:img.w,h:img.h,px:out,mean:mean.map(Math.round)};
}
// Two square tiles into one square: the top half is `top` squashed to half height, the bottom half is `bottom`. Nearest
// neighbour, because the pack is 128px and the atlas cell is smaller than that anyway -- a filtered downscale here would
// soften a cutout's edge twice.
function stack(bottom, top){
  const w=Math.min(bottom.w, top.w), h=Math.min(bottom.h, top.h);
  const px=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const src = y < h/2 ? top : bottom;
    const sy = Math.min(src.h-1, Math.round((y < h/2 ? y*2 : (y-h/2)*2) * (src.h/h)));
    const sx = Math.min(src.w-1, Math.round(x*(src.w/w)));
    const s=(sy*src.w+sx)*4, d=(y*w+x)*4;
    px[d]=src.px[s]; px[d+1]=src.px[s+1]; px[d+2]=src.px[s+2]; px[d+3]=src.px[s+3];
  }
  return {w,h,px};
}
const meanOf=({w,h,px})=>{ const t=[0,0,0]; let n=0;
  for(let i=0;i<w*h;i++){ if(px[i*4+3]<8) continue; t[0]+=px[i*4]; t[1]+=px[i*4+1]; t[2]+=px[i*4+2]; n++; }
  return t.map(v=>Math.round(v/Math.max(n,1))); };


// Pull every texel toward the tile's own luma mean by `k`, then put the mean back where `keep` says. Both are done on
// the RGB channels equally so the hue is untouched: this is a contrast change, not a colour one.
function soften(img, k, keep){
  let s=0, n=0;
  for(let i=0;i<img.w*img.h;i++){ if(img.px[i*4+3]<8) continue; s+=0.2126*img.px[i*4]+0.7152*img.px[i*4+1]+0.0722*img.px[i*4+2]; n++; }
  const mean=s/Math.max(n,1), shift=(keep==null?mean:keep)-mean*k;
  const out=new Uint8Array(img.px.length);
  for(let i=0;i<img.w*img.h;i++){ const a=img.px[i*4+3]; out[i*4+3]=a;
    for(let c=0;c<3;c++) out[i*4+c] = a<8 ? img.px[i*4+c] : Math.max(0,Math.min(255, Math.round(img.px[i*4+c]*k + shift))); }
  return {w:img.w,h:img.h,px:out};
}
// The two numbers this tool exists to move: the spread of the tile, and how much of it is at texel frequency.
function rough(img){
  const L=new Float64Array(img.w*img.h); let s=0;
  for(let i=0;i<L.length;i++){ const l=0.2126*img.px[i*4]+0.7152*img.px[i*4+1]+0.0722*img.px[i*4+2]; L[i]=l; s+=l; }
  const mean=s/L.length; let v=0; for(const l of L) v+=(l-mean)*(l-mean);
  let hf=0, nn=0;
  for(let y=0;y<img.h;y++) for(let x=0;x<img.w;x++){ const i=y*img.w+x;
    if(x+1<img.w){ hf+=Math.abs(L[i]-L[i+1]); nn++; }
    if(y+1<img.h){ hf+=Math.abs(L[i]-L[i+img.w]); nn++; } }
  return { mean:+mean.toFixed(1), sd:+Math.sqrt(v/L.length).toFixed(2), hf:+(hf/nn).toFixed(2) };
}

if(process.argv.includes('--list')){
  for(const [ours,pack,k,keep,why] of MAP) console.log(ours.padEnd(12), pack.padEnd(12), 'contrast '+k, 'mean '+(keep==null?'as-is':keep), ' ', why);
  process.exit(0);
}
const zip = zipEntries(ZIP);
fs.mkdirSync(OUT,{recursive:true});
for(const [ours,pack,k,keep] of MAP){
  const buf = read(zip, P+pack+'.png');
  if(!buf){ console.log('NOT IN THE PACK:', ours, '<-', pack); continue; }
  const img = pngRead(buf);
  const before = rough(img);
  const out = (k===1 && keep==null) ? img : soften(img, k, keep);
  pngWrite(path.join(OUT, ours+'.png'), out);
  console.log(ours.padEnd(12), '<-', pack.padEnd(12), JSON.stringify(before), '->', JSON.stringify(rough(out)));
}
