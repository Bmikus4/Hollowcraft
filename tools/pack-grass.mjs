// GRASS, OUT OF THE PACK AND INTO assets/blocks/. Run when the pack changes or the world's green does:
//   node tools/pack-grass.mjs            -> assets/blocks/grass_top.png, grass_side.png
//   node tools/pack-grass.mjs 70 118 60  -> the same, tinted to that RGB instead
//
// WHY THIS EXISTS AT ALL. Every other tile in the 43 is a straight copy out of the zip, and grass cannot be, which is
// why it was skipped and why Ben saw an untextured lawn. The pack has no green grass texture: Minecraft tints grass
// per biome at runtime, so the pack ships grass_block_top as a GREYSCALE master (measured mean 111,111,111) and the
// side as bare dirt with the green lip in a separate greyscale alpha overlay. Stamped raw, both give a grey world.
//
// THE TINT IS BAKED HERE rather than done at load. stampTile is a drawImage into the atlas canvas; a runtime tint
// would put a per-pixel pass in the boot path for two tiles, and this way the file on disk is already the thing the
// game draws — what you see in a PNG viewer is what is in the world.
//
// THE TARGET IS THE PAINTER'S OWN MEAN, not a colour picked by eye: paintTile('grass_top') in index.html is
// base (56,92,46) plus a jitter of up to (18,26,16), so the tile it replaces averages (65,105,54). Matching the mean
// is what keeps a stamped world the same colour as an unstamped one — the pack changes the DETAIL, not the palette.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ZIP = 'D:/Content/Desktop-Assets/ModernArch v3.0.6 [26.2] [128x].zip';
const OUT = path.resolve(process.argv[1], '..', '..', 'assets', 'blocks');
const TARGET = process.argv.length >= 5
  ? [ +process.argv[2], +process.argv[3], +process.argv[4] ]
  : [ 65, 105, 54 ];

// ---- the smallest zip reader that can find one stored/deflated entry, so this needs no dependency ----
function zipRead(file, name){
  const b = fs.readFileSync(file);
  const eocd = (()=>{ for(let i=b.length-22;i>=0;i--) if(b.readUInt32LE(i)===0x06054b50) return i; return -1; })();
  if(eocd<0) throw new Error('not a zip');
  let n = b.readUInt16LE(eocd+10), off = b.readUInt32LE(eocd+16);
  for(let k=0;k<n;k++){
    const nameLen=b.readUInt16LE(off+28), extLen=b.readUInt16LE(off+30), cmtLen=b.readUInt16LE(off+32);
    const nm = b.toString('latin1', off+46, off+46+nameLen);
    if(nm===name){
      const lho = b.readUInt32LE(off+42), method = b.readUInt16LE(off+10), csize = b.readUInt32LE(off+20);
      const lNameLen=b.readUInt16LE(lho+26), lExtLen=b.readUInt16LE(lho+28);
      const start = lho+30+lNameLen+lExtLen;
      const raw = b.subarray(start, start+csize);
      return method===0 ? raw : zlib.inflateRawSync(raw);
    }
    off += 46+nameLen+extLen+cmtLen;
  }
  throw new Error('not in zip: '+name);
}

// ---- PNG in and out, RGBA8 only, which is what this pack ships ----
function crc32(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320 & -(c&1)); } return ~c>>>0; }
function chunks(buf){ const out=[]; let p=8; while(p<buf.length){ const len=buf.readUInt32BE(p), type=buf.toString('latin1',p+4,p+8);
  out.push({type, data:buf.subarray(p+8,p+8+len)}); p+=12+len; } return out; }
function pngRead(buf){
  const cs=chunks(buf), ihdr=cs.find(c=>c.type==='IHDR');
  const w=ihdr.data.readUInt32BE(0), h=ihdr.data.readUInt32BE(4), depth=ihdr.data[8], ctype=ihdr.data[9];
  if(depth!==8 || (ctype!==6 && ctype!==2)) throw new Error('unsupported PNG: depth '+depth+' colour '+ctype);
  const ch = ctype===6?4:3;
  const raw = zlib.inflateSync(Buffer.concat(cs.filter(c=>c.type==='IDAT').map(c=>c.data)));
  const px = Buffer.alloc(w*h*4, 255);
  const stride = w*ch;
  let prev = Buffer.alloc(stride);
  for(let y=0;y<h;y++){
    const f = raw[y*(stride+1)];
    const line = Buffer.from(raw.subarray(y*(stride+1)+1, y*(stride+1)+1+stride));
    // The five PNG filters, in the spec's own terms. Undoing them is the whole of "reading a PNG".
    for(let i=0;i<stride;i++){
      const a = i>=ch ? line[i-ch] : 0, bb = prev[i], c = i>=ch ? prev[i-ch] : 0;
      if(f===1) line[i]=(line[i]+a)&255;
      else if(f===2) line[i]=(line[i]+bb)&255;
      else if(f===3) line[i]=(line[i]+((a+bb)>>1))&255;
      else if(f===4){ const p=a+bb-c, pa=Math.abs(p-a), pb=Math.abs(p-bb), pc=Math.abs(p-c);
        line[i]=(line[i]+(pa<=pb&&pa<=pc?a:pb<=pc?bb:c))&255; }
    }
    for(let x=0;x<w;x++){
      px[(y*w+x)*4  ]=line[x*ch];
      px[(y*w+x)*4+1]=line[x*ch+1];
      px[(y*w+x)*4+2]=line[x*ch+2];
      px[(y*w+x)*4+3]=ch===4?line[x*ch+3]:255;
    }
    prev=line;
  }
  return {w,h,px};
}
function pngWrite(file,{w,h,px}){
  const raw=Buffer.alloc(h*(w*4+1));
  for(let y=0;y<h;y++){ raw[y*(w*4+1)]=0; px.copy(raw, y*(w*4+1)+1, y*w*4, (y+1)*w*4); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6;
  const chunk=(type,data)=>{ const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
    const td=Buffer.concat([Buffer.from(type,'latin1'),data]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(td),0);
    return Buffer.concat([len,td,crc]); };
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr), chunk('IDAT', zlib.deflateSync(raw,{level:9})), chunk('IEND',Buffer.alloc(0))]));
}

// Multiply a greyscale master so its OPAQUE mean lands on `target`. Per channel off the luma, so the pack's own
// light and shade survive and only the hue is ours.
function tint(img, target){
  const {w,h,px}=img; let sum=0, n=0;
  for(let i=0;i<w*h;i++){ if(px[i*4+3]>8){ sum+=(px[i*4]+px[i*4+1]+px[i*4+2])/3; n++; } }
  const mean=sum/Math.max(n,1), k=target.map(t=>t/mean);
  const out=Buffer.from(px);
  for(let i=0;i<w*h;i++){
    const l=(px[i*4]+px[i*4+1]+px[i*4+2])/3;
    out[i*4  ]=Math.min(255, Math.round(l*k[0]));
    out[i*4+1]=Math.min(255, Math.round(l*k[1]));
    out[i*4+2]=Math.min(255, Math.round(l*k[2]));
  }
  return {w,h,px:out,mean};
}
function over(base, top){   // straight source-over: the overlay's alpha is the lip's shape
  const {w,h}=base, px=Buffer.from(base.px);
  for(let i=0;i<w*h;i++){ const a=top.px[i*4+3]/255; if(a<=0.003) continue;
    for(let c=0;c<3;c++) px[i*4+c]=Math.round(top.px[i*4+c]*a + px[i*4+c]*(1-a)); }
  return {w,h,px};
}
const meanOf=({w,h,px})=>{ const t=[0,0,0]; for(let i=0;i<w*h;i++){ t[0]+=px[i*4]; t[1]+=px[i*4+1]; t[2]+=px[i*4+2]; }
  return t.map(v=>Math.round(v/(w*h))); };

const B='assets/minecraft/textures/block/';
const top = pngRead(zipRead(ZIP, B+'grass_block_top.png'));
const side= pngRead(zipRead(ZIP, B+'grass_block_side.png'));
const ov  = pngRead(zipRead(ZIP, B+'grass_block_side_overlay.png'));
console.log('masters   top mean', meanOf(top), ' side mean', meanOf(side), ' overlay mean', meanOf(ov));

const topT = tint(top, TARGET);
const sideT = over(side, tint(ov, TARGET));
fs.mkdirSync(OUT,{recursive:true});
pngWrite(path.join(OUT,'grass_top.png'), topT);
pngWrite(path.join(OUT,'grass_side.png'), sideT);
console.log('target    ', TARGET);
console.log('grass_top  mean', meanOf(topT), '  ->', path.join(OUT,'grass_top.png'));
console.log('grass_side mean', meanOf(sideT), '  ->', path.join(OUT,'grass_side.png'));
