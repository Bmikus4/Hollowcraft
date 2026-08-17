// GROUND FOLIAGE, OUT OF THE PACK AND INTO assets/blocks/. Run when the pack changes:
//   node tools/pack-foliage.mjs          -> assets/blocks/<ourname>.png for every mapped row
//   node tools/pack-foliage.mjs --list   -> print the table without writing anything
//
// Ben 08-17: "the hyperrealistic foliage import ... it should just import all foliage from the texture pack i gave
// you", then narrowed the same day: "leaves can stay, i just meant ground foliage". So this is everything GROWING ON
// THE GROUND -- tufts, ferns, bushes, flowers, herbs, mushrooms, saplings, vines, the sunflower -- and no leaf tile is
// touched. It is the third run of the pipeline pack-grass.mjs and pack-52.mjs already established.
//
// THREE MODES, and which one a row takes is a fact about the pack rather than a preference.
//   copy   a byte-for-byte copy of the zip entry. Right for anything the pack ships in colour: flowers, mushrooms,
//          saplings, berries, the sunflower. A copy also cannot lose the alpha, and every one of these is a cutout.
//   tint   Minecraft tints some plants per biome, so the pack ships those as GREY MASTERS -- stamped raw they give a
//          grey meadow, which is exactly why grass itself was skipped from the original 43 (see pack-grass.mjs). A grey
//          one is multiplied so its opaque mean lands on the mean of the painter it replaces, so the pack changes the
//          DETAIL and not the world's palette.
//          WHICH ROWS ARE GREY IS MEASURED, NOT DECLARED. This table first said the fern, the bush and the vine were
//          masters too, and they are not: this pack bakes their colour (fern mean 57,87,13 against short_grass's
//          124,117,124). Tinting an already-green tile to a green target is a second colour decision on top of the
//          pack's own and it wrecked all three -- the fern came out 38,102,8. A row asks for a tint; the chroma of what
//          comes out of the zip decides whether it gets one.
//   stack  two pack tiles composited into one square, top half over bottom half. Our 2-block plants -- meadow_grass_tall
//          and sunflower_wild -- are ONE cross quad stretched over two blocks (tall2), while the pack, like Minecraft,
//          ships them as a separate bottom and top texture. Copying either half alone stretches half a plant over the
//          whole thing; stacking them is the only version of this row that is not wrong.
//
// THE TINT TARGETS ARE THE PAINTERS' OWN MEANS, read off index.html rather than picked by eye: a painter is base + a
// jitter of up to j, so its mean is base + j/2. They are written per row with the base they came from, because when
// Ben next moves the world's green these are the numbers that have to move with it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ZIP = 'D:/Content/Desktop-Assets/ModernArch v3.0.6 [26.2] [128x].zip';
const OUT = path.resolve(process.argv[1], '..', '..', 'assets', 'blocks');
const P = 'assets/minecraft/textures/block/';

// ours              pack entry (or [bottom,top] for stack)      mode    target / why
const MAP = [
  // ---- the tinted greys: tufts, fern, bush, vine ----
  ['grass_tall',     'short_grass',                     'tint', [60,99,49],  'painter base 52,86,42 + jitter 26'],
  ['grass_meadow',   'tall_grass_bottom',               'tint', [77,134,61], 'painter base 70,120,54 + jitter 28; the pack tall grass is the taller tuft'],
  ['grass_meadow_tall', ['tall_grass_bottom','tall_grass_top'], 'stack', [94,145,65], 'tall2: one quad stretched over two blocks, so the plant has to be stacked into one tile'],
  ['fern',           'cmodels/fern_leaves',             'tint', [50,88,46],  'painter base 44,76,40 + jitter 24'],
  ['bush',           'bush',                            'tint', [47,81,43],  'painter base 40,68,36 + jitter 26'],
  ['vine',           'cmodels/leave_vine1',             'tint', [40,70,36],  'painter strand 32,62,28 + jitter 16; the pack has no plain `vine`, it draws them as custom models'],
  // ---- straight copies: the pack ships these in colour ----
  ['mush_red',       'red_mushroom',                    'copy'],
  ['mush_brown',     'brown_mushroom',                  'copy'],
  ['foxglove',       'rose_bush_top',                   'copy', null, 'no foxglove; the rose bush crown is the pack\'s dense flowering spire'],
  ['anemone',        'oxeye_daisy',                     'copy', null, 'open white flower on a stem'],
  ['bellflower',     'blue_orchid',                     'copy', null, 'the pack\'s blue bell-shaped bloom'],
  ['sage',           'short_dry_grass',                 'copy', null, 'sage is a grey-green herb clump, which is what the dry grass tuft reads as'],
  ['yarrow',         'wildflowers',                     'copy', null, 'flat white umbel cluster'],
  ['bloodroot',      'poppy',                           'copy', null, 'red bloom on a low stem'],
  ['berry',          'cmodels/sweet_berry_bush_stage3',  'tint', [44,71,40], 'painter base 38,60,34 + jitter 22; a berry bush in fruit, which is what this block is'],
  ['sapling',        'oak_sapling',                     'tint', [50,84,34],  'painter base 40,74,34 + jitter 20; Minecraft tints saplings, so the pack ships a dark olive master here too'],
  ['sunflower_stem', 'sunflower_bottom',                'copy'],
  ['sunflower_head', 'sunflower_front',                 'copy'],
  ['sunflower_wild', ['sunflower_bottom','sunflower_front'], 'stack', null, 'tall2, same as the meadow grass'],
  ['tree_flower',    'cmodels/flowering_azalea_plant',  'copy', null, 'blossom on a woody stem'],
  ['pale_bloom',     'pale_hanging_moss',               'copy', null, 'the Pale\'s own growth; the pack ships the pale garden set'],
];

// NOT FOLIAGE AND NOT TOUCHED, said out loud because a silent omission is what produced the last complaint:
//   trellis      a built lattice, not a plant
//   leaves and every leaf_litter variant  Ben, 08-17: "leaves can stay, i just meant ground foliage"
//   the canopy sprigs  they are leaves by another name
const KEEP = ['trellis','leaves','sprigs','grass_leaf1','grass_leaf2','grass_leaf3'];

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

if(process.argv.includes('--list')){
  for(const [ours,pack,mode,target,why] of MAP)
    console.log(mode.padEnd(6), ours.padEnd(20), (Array.isArray(pack)?pack.join('+'):pack).padEnd(34), target?JSON.stringify(target):'', why||'');
  console.log('\nnot touched:', KEEP.join(' '));
  process.exit(0);
}
const zip = zipEntries(ZIP);
fs.mkdirSync(OUT,{recursive:true});
let wrote=0; const absent=[];
for(const [ours,pack,mode,target] of MAP){
  const names = Array.isArray(pack)?pack:[pack];
  const bufs = names.map(nm=>read(zip, P+nm+'.png'));
  if(bufs.some(b=>!b)){ absent.push(ours+' <- '+names.join('+')); continue; }
  const dst = path.join(OUT, ours+'.png');
  if(mode==='copy'){ fs.writeFileSync(dst, bufs[0]); wrote++; console.log('copy  ', ours.padEnd(20), names[0]); continue; }
  let img = mode==='stack' ? stack(pngRead(bufs[0]), pngRead(bufs[1])) : pngRead(bufs[0]);
  const before = meanOf(img);
  // A ROW WITH A TARGET IS TINTED, whatever colour the master arrives in. This was briefly gated on the master being
  // GREY -- on the theory that a coloured one is the pack's own decision and should be left alone -- and the world said
  // otherwise: the fern, the bush, the vine and the sapling came in as dark olive with almost no blue and rendered as
  // black cut-outs on a lit meadow. Minecraft multiplies a biome colour over exactly those four, so the pack's colour is
  // half a texture rather than a finished one, and the row is where that fact belongs.
  if(target) img = tint(img, target);
  pngWrite(dst, img);
  wrote++;
  console.log((target?'tint  ':mode.padEnd(6)), ours.padEnd(20), names.join('+').padEnd(34),
    'mean', JSON.stringify(before), '->', JSON.stringify(meanOf(img)));
}
console.log('\nwrote', wrote, 'of', MAP.length, 'to', OUT);
if(absent.length) console.log('NOT IN THE PACK (nothing written, tile keeps its painter):\n  '+absent.join('\n  '));
console.log('\nadd to _stampWant in index.html:\n  '+MAP.map(r=>"'"+r[0]+"'").join(','));
