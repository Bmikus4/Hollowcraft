// Crop a region of a PNG and upscale it (nearest, so nothing is invented) with an optional contrast stretch, then write a PNG.
// Looking at a 1280-wide frame in a viewer that downscales it is how a one-pixel dark line gets argued about instead of seen.
//   node bench/tmp-crop.mjs <in.png> <out.png> x y w h [zoom] [stretch]
//   stretch=1 maps the crop's own min..max luminance to 0..255, which makes a 2-level dip in near-black obvious.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decodePNG } from './pngprobe.mjs';

function crc32(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320&-(c&1)); } return ~c>>>0; }
function chunk(type,data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td=Buffer.concat([Buffer.from(type,'ascii'),data]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len,td,crc]); }
function encodePNG(w,h,rgb){                       // rgb = Buffer of w*h*3
  const raw=Buffer.alloc(h*(1+w*3));
  for(let y=0;y<h;y++){ raw[y*(1+w*3)]=0; rgb.copy(raw, y*(1+w*3)+1, y*w*3, (y+1)*w*3); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=2;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]);
}
const [,,inf,outf,X,Y,W,H,Z,S]=process.argv;
const x=+X, y=+Y, w=+W, h=+H, z=+(Z||4), stretch=+(S||0);
const img=decodePNG(fs.readFileSync(inf)); const {w:iw,ch,data}=img;
let lo=255, hi=0;
if(stretch){ for(let j=0;j<h;j++) for(let i=0;i<w;i++){ const k=((y+j)*iw+(x+i))*ch;
  const L=0.2126*data[k]+0.7152*data[k+1]+0.0722*data[k+2]; if(L<lo)lo=L; if(L>hi)hi=L; } }
const out=Buffer.alloc(w*z*h*z*3);
for(let j=0;j<h*z;j++) for(let i=0;i<w*z;i++){
  const k=((y+Math.floor(j/z))*iw+(x+Math.floor(i/z)))*ch;
  let r=data[k],g=data[k+1],b=data[k+2];
  if(stretch && hi>lo){ const f=255/(hi-lo); r=Math.max(0,Math.min(255,(r-lo)*f)); g=Math.max(0,Math.min(255,(g-lo)*f)); b=Math.max(0,Math.min(255,(b-lo)*f)); }
  const o=(j*w*z+i)*3; out[o]=r; out[o+1]=g; out[o+2]=b;
}
fs.writeFileSync(outf, encodePNG(w*z,h*z,out));
console.log(outf+'  '+(w*z)+'x'+(h*z)+(stretch?('  stretched from luma '+lo.toFixed(1)+'..'+hi.toFixed(1)):''));
