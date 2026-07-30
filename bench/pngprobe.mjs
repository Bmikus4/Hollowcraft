// Measure a PNG's actual pixels: horizontal-band averages down a vertical strip.
// No deps — decodes non-interlaced RGBA/RGB PNG with zlib.
// usage: node bench/pngprobe.mjs <file.png> [x0frac] [x1frac]
import fs from 'node:fs';
import zlib from 'node:zlib';

export function decodePNG(buf){
  if(buf.readUInt32BE(0)!==0x89504e47) throw new Error('not png');
  let off=8, w=0,h=0,bd=0,ct=0,inter=0; const idat=[];
  while(off<buf.length){
    const len=buf.readUInt32BE(off), type=buf.toString('ascii',off+4,off+8), data=buf.subarray(off+8,off+8+len);
    if(type==='IHDR'){ w=data.readUInt32BE(0); h=data.readUInt32BE(4); bd=data[8]; ct=data[9]; inter=data[12]; }
    else if(type==='IDAT') idat.push(data);
    else if(type==='IEND') break;
    off += 12+len;
  }
  if(bd!==8) throw new Error('bitdepth '+bd+' unsupported');
  if(inter) throw new Error('interlaced unsupported');
  const ch = ct===6?4: ct===2?3: ct===0?1: ct===4?2: (()=>{throw new Error('colortype '+ct)})();
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w*ch, out = Buffer.alloc(h*stride);
  let p=0;
  for(let y=0;y<h;y++){
    const f=raw[p++]; const line=raw.subarray(p,p+stride); p+=stride;
    const cur=out.subarray(y*stride,(y+1)*stride), prv= y>0?out.subarray((y-1)*stride,y*stride):null;
    for(let i=0;i<stride;i++){
      const a = i>=ch ? cur[i-ch] : 0, b = prv? prv[i] : 0, c = (prv && i>=ch)? prv[i-ch] : 0;
      let v=line[i];
      if(f===1) v+=a; else if(f===2) v+=b; else if(f===3) v+=((a+b)>>1);
      else if(f===4){ const pa=Math.abs(b-c), pb=Math.abs(a-c), pc=Math.abs(a+b-2*c); v += (pa<=pb&&pa<=pc)?a:(pb<=pc?b:c); }
      cur[i]=v&255;
    }
  }
  return { w,h,ch,data:out };
}

export function bands(img, x0f=0.35, x1f=0.65, y0f=0.0, y1f=1.0, step=0.02){
  const {w,h,ch,data}=img, x0=Math.round(w*x0f), x1=Math.round(w*x1f), rows=[];
  for(let f=y0f; f<=y1f+1e-9; f+=step){
    const y=Math.min(h-1,Math.round(h*f)); let r=0,g=0,b=0,n=0;
    for(let x=x0;x<x1;x++){ const i=(y*w+x)*ch; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; }
    rows.push({ yf:+f.toFixed(3), y, rgb:[Math.round(r/n),Math.round(g/n),Math.round(b/n)] });
  }
  return rows;
}

if(process.argv[1] && process.argv[1].endsWith('pngprobe.mjs')){
  const f=process.argv[2], x0=+(process.argv[3]||0.35), x1=+(process.argv[4]||0.65);
  const img=decodePNG(fs.readFileSync(f));
  console.log(f, img.w+'x'+img.h);
  for(const r of bands(img,x0,x1,0.0,0.99,0.02))
    console.log(String(r.yf).padStart(5), String(r.y).padStart(4), '  rgb('+r.rgb.join(',')+')  #'+r.rgb.map(v=>v.toString(16).padStart(2,'0')).join(''));
}
