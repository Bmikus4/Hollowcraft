// Where do two frames differ? A count says "something moved"; a map says WHAT. White = changed, dim = same.
// Written because a clipped diff read 73,000 changed pixels on a vault door and the number could not tell me whether that was a
// z-fighting seam along the leaf's edges or foliage waving at the edge of the crop.
//   node bench/tmp-diffmap.mjs <a.png> <b.png> <out.png> [threshold]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decodePNG } from './pngprobe.mjs';
function crc32(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320&-(c&1)); } return ~c>>>0; }
function chunk(type,data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td=Buffer.concat([Buffer.from(type,'ascii'),data]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len,td,crc]); }
function encodePNG(w,h,rgb){ const raw=Buffer.alloc(h*(1+w*3));
  for(let y=0;y<h;y++){ raw[y*(1+w*3)]=0; rgb.copy(raw, y*(1+w*3)+1, y*w*3, (y+1)*w*3); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=2;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]); }
const [,,fa,fb,fo,th]=process.argv; const T=+(th||30);
const A=decodePNG(fs.readFileSync(fa)), B=decodePNG(fs.readFileSync(fb));
const {w,h,ch,data:da}=A, db=B.data;
const out=Buffer.alloc(w*h*3); let n=0;
for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const k=(y*w+x)*ch, o=(y*w+x)*3;
  const d=Math.abs(da[k]-db[k])+Math.abs(da[k+1]-db[k+1])+Math.abs(da[k+2]-db[k+2]);
  if(d>T){ n++; out[o]=255; out[o+1]=40; out[o+2]=40; }                      // changed: red, so it reads against the grey ghost
  else { const g=Math.round((0.2126*da[k]+0.7152*da[k+1]+0.0722*da[k+2])*0.35); out[o]=out[o+1]=out[o+2]=g; } }
fs.writeFileSync(fo, encodePNG(w,h,out));
console.log(fo+'   '+n+' px changed above '+T);
