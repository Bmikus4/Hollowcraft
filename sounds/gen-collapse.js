// CEILING-TILE COLLAPSE SFX -> 16-bit PCM WAV (ffmpeg then encodes .ogg).
// Standalone so it does NOT regenerate the existing library (gen-sfx.js uses Math.random for every sound).
//   collapse1..3  — a suspended mineral-fibre tile popping out of its T-bar grid and landing on carpet
// WHY it is built this way:
//   * The brief must read LIGHT and HOLLOW, not masonry. Heaviness in a sample comes almost entirely from
//     sub-100Hz energy and long decays, so everything here is deliberately high-passed and short: the
//     "crack" lives at 1.5-8kHz, the impact body sits at 120-400Hz, and NOTHING rings.
//   * Cardboard/fibreboard cracking is a cluster of many micro-fractures, not one event — so the pop is a
//     handful of tiny staggered noise spits inside ~40ms rather than a single transient. The ear reads a
//     dense cluster as "fibrous material tearing".
//   * The tumble is amplitude-modulated band-passed noise: as a flat panel flutters it presents its face and
//     then its edge to the air, so its brightness and level wobble a few times per fall. Modulating a noise
//     bed at ~10-16Hz is the cheapest honest model of that.
//   * Carpet is a low-pass with essentially no rebound. The impact is therefore a fast-decaying low-mid slap
//     with a *rising-then-falling* dust puff behind it (air and fibres being pushed out from under the panel),
//     which is a slow-attack low-passed noise swell — the opposite envelope of the slap, and what makes it
//     sound dusty rather than merely dull.
const fs=require('fs');
const SR=44100;
const rnd=()=>Math.random()*2-1;
function buf(sec){ return new Float32Array(Math.floor(SR*sec)); }
function lp(x,cut){ const a=1-Math.exp(-2*Math.PI*cut/SR); let y=0; const o=new Float32Array(x.length); for(let i=0;i<x.length;i++){ y+=(x[i]-y)*a; o[i]=y; } return o; }
function hp(x,cut){ const l=lp(x,cut); const o=new Float32Array(x.length); for(let i=0;i<x.length;i++)o[i]=x[i]-l[i]; return o; }
function bp(x,lo,hi){ return hp(lp(x,hi),lo); }
function noise(sec){ const o=buf(sec); for(let i=0;i<o.length;i++)o[i]=rnd(); return o; }
function norm(x,peak){ let m=0; for(const v of x)m=Math.max(m,Math.abs(v)); if(m<1e-6)return x; const g=(peak||0.9)/m; for(let i=0;i<x.length;i++)x[i]*=g; return x; }
function W(name,x,peak){ norm(x,peak); const n=x.length,b=Buffer.alloc(44+n*2);
  b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){ const s=Math.max(-1,Math.min(1,x[i])); b.writeInt16LE((s*32767)|0,44+i*2); }
  fs.writeFileSync(OUT+'/'+name+'.wav',b); }

// mix a short band-limited noise burst in at `at` with an exponential decay
function spit(s, at, dur, lo, hi, amp, dk){ const n=(dur*SR)|0, off=(at*SR)|0, z=bp(noise(dur),lo,hi);
  for(let i=0;i<n;i++){ const o=off+i; if(o<0||o>=s.length)continue; const t=i/SR; s[o]+= z[i]*amp*Math.exp(-t/(dur*(dk||0.28))); } }

// a fast-decaying partial — used for the hollow board "bonk", kept very short so it never rings
function ring(s, at, dur, f, amp, dk){ const n=(dur*SR)|0, off=(at*SR)|0;
  for(let i=0;i<n;i++){ const o=off+i; if(o<0||o>=s.length)continue; const t=i/SR;
    s[o]+= Math.sin(2*Math.PI*f*t)*amp*Math.exp(-t/dk)*(t<0.0006?t/0.0006:1); } }

// COLLAPSE: fibreboard crack cluster -> flat-panel flutter -> carpet slap + dust puff
const collapse=v=>{ const dur=0.92, s=buf(dur);
  // 1) popping out of the T-bar frame: a cluster of micro-fractures + a light metallic grid tick
  spit(s, 0.000, 0.006, 2200, 11000, 0.85, 0.20);                                  // the initial split
  for(let k=0;k<5+v;k++)
    spit(s, 0.004+Math.random()*0.038, 0.004+Math.random()*0.008,
         1400+Math.random()*2200, 6000+Math.random()*4000, 0.16+Math.random()*0.26, 0.22);
  ring(s, 0.002, 0.026, 1750+v*220, 0.16, 0.008);                                  // hollow board resonance
  ring(s, 0.006, 0.014, 3900+v*300, 0.07, 0.004);                                  // T-bar tick (thin, quick)

  // 2) the tumble: a flat panel fluttering — band-passed noise wobbling as it turns edge-on / face-on
  const t0=0.055, tdur=0.34+v*0.05, tn=(tdur*SR)|0, off0=(t0*SR)|0;
  const fl=bp(noise(tdur), 500, 5200), wob=11+v*2.5;
  for(let i=0;i<tn;i++){ const o=off0+i; if(o>=s.length)break; const t=i/SR, p=t/tdur;
    const flap=Math.pow(0.5+0.5*Math.sin(2*Math.PI*wob*t+v),1.8);                  // face/edge alternation
    s[o]+= fl[i]*0.30*flap*(0.35+0.65*p);                                          // gathers as it falls
  }
  // a few discrete edge-slaps during the fall (the panel clipping the grid on its way down)
  for(let k=0;k<2+(v%2);k++){
    const at=t0+0.07+k*(0.10+Math.random()*0.05);
    spit(s, at, 0.016, 380, 3000, 0.22, 0.18);
    ring(s, at, 0.018, 900+Math.random()*500, 0.08, 0.006);
  }

  // 3) impact on carpet: a dull, dead slap — low-mid body, no rebound, nothing below ~90Hz
  const ti=t0+tdur+0.02;
  spit(s, ti,        0.055, 120, 460, 0.95, 0.16);                                 // the body of the slap
  spit(s, ti,        0.010, 900, 4200, 0.30, 0.16);                                // the surface contact "pat"
  ring(s, ti+0.001,  0.055, 148+v*16, 0.34, 0.018);                                // hollow panel thud (dies fast)
  ring(s, ti+0.001,  0.030, 262+v*22, 0.16, 0.010);
  // a second tiny settle-tap: the panel dropping flat after landing on one corner
  spit(s, ti+0.062+v*0.008, 0.030, 130, 900, 0.24, 0.16);

  // 4) the dust puff: slow-attack low-passed air behind the impact — this is what makes it "dusty"
  const pdur=Math.max(0.05, dur-ti-0.01), pn=(pdur*SR)|0, poff=(ti*SR)|0;
  const pf=lp(lp(noise(pdur),300),300);
  for(let i=0;i<pn;i++){ const o=poff+i; if(o>=s.length)break; const t=i/SR;
    const e=Math.min(1,t/0.035)*Math.exp(-Math.max(0,t-0.035)/0.13);
    s[o]+= pf[i]*2.2*e;                                                            // heavily filtered, so needs gain
  }
  // faint settling grit after everything (fibres and ceiling dust landing)
  for(let k=0;k<3;k++) spit(s, ti+0.12+Math.random()*0.35, 0.02, 2600, 9000, 0.045, 0.25);

  for(let i=0;i<s.length;i++){ const t=i/SR; if(t>dur-0.04) s[i]*=(dur-t)/0.04; }
  return s; };

const OUT=process.argv[2]||'.';
for(let v=1;v<=3;v++) W('collapse'+v, collapse(v-1), 0.82);
console.log('generated 3 collapse WAVs in', OUT);
