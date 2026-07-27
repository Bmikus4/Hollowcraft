// PULL-CORD LIGHT SWITCH SFX -> 16-bit PCM WAV (ffmpeg then encodes .ogg).
// Standalone so it does NOT regenerate the existing library (gen-sfx.js uses Math.random for every sound).
//   cord1..2  — a hanging pull-cord being yanked: cord friction, the switch detent CLICK, then the cord swinging
// WHY it is built this way:
//   * The friction of a braided cord through a housing is broadband noise with a rising then falling
//     brightness — so it's a band-passed noise burst whose top cutoff sweeps up and back down, NOT a tone.
//   * A snap-action detent is almost pure transient: a single very short high-passed spike carries the
//     "crisp", and a couple of tiny fast-decaying partials (a metallic ring at ~4-6kHz) tell the ear the
//     mechanism is metal rather than plastic. Any audible decay tail here would read as "big room", so the
//     ring dies in ~20ms.
//   * The swing afterwards is the cord tapping the shade — two or three near-silent low-mid taps, spaced
//     irregularly and each quieter than the last, which is what sells "domestic, close, dry".
//   * No reverb / delay anywhere on purpose: this is a sound heard from arm's length.
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

// a decaying partial (used for the tiny metallic ring of the detent)
function ring(s, at, dur, f, amp, dk){ const n=(dur*SR)|0, off=(at*SR)|0;
  for(let i=0;i<n;i++){ const o=off+i; if(o<0||o>=s.length)continue; const t=i/SR;
    s[o]+= Math.sin(2*Math.PI*f*t)*amp*Math.exp(-t/dk)*(t<0.0004?t/0.0004:1); } }

// CORD PULL: friction sweep -> detent click + metal ring -> faint swing taps
const cord=v=>{ const dur=0.26, s=buf(dur);
  // 1) cord friction: noise whose brightness rises with the pull then falls as it stops
  const fdur=0.075, fn=(fdur*SR)|0, nz=noise(fdur);
  let y1=0,y2=0;
  for(let i=0;i<fn;i++){ const t=i/SR, p=t/fdur;
    const cut=700+3400*Math.sin(Math.PI*p);                                      // sweep up and back down
    const a=1-Math.exp(-2*Math.PI*cut/SR);
    y1+=(nz[i]-y1)*a;                                                            // low-pass at the swept cutoff
    const b=1-Math.exp(-2*Math.PI*420/SR); y2+=(y1-y2)*b;                        // remove the rumble
    const e=Math.sin(Math.PI*p);                                                 // no click at either end
    s[i]+= (y1-y2)*0.55*e*(0.85+0.15*Math.sin(t*(220+v*70)));                    // slight strand-by-strand grain
  }
  // 2) the detent: sharp broadband transient, then a very short metallic ring
  const tc=0.082+v*0.006;
  spit(s, tc,        0.0035, 3000, 15000, 1.00, 0.22);                            // the crisp snap itself
  spit(s, tc+0.0012, 0.010,  700,  4200,  0.34, 0.20);                            // body of the plastic housing
  ring(s, tc+0.0008, 0.022, 4300+v*520, 0.20, 0.006);                             // metal contact ring
  ring(s, tc+0.0008, 0.018, 6100+v*430, 0.11, 0.0045);
  ring(s, tc+0.0020, 0.030,  980+v*90,  0.13, 0.010);                             // dull thud of the mechanism seating
  // 3) the cord swinging back and tapping the shade — quiet, irregular, decaying
  let t0=tc+0.045;
  for(let k=0;k<2+((v+1)%2);k++){
    const amp=0.085*Math.pow(0.55,k);
    spit(s, t0, 0.014, 350, 2600, amp, 0.20);
    ring(s, t0, 0.020, 620+k*180+v*40, amp*0.5, 0.008);
    t0 += 0.048+0.018*k+v*0.004;
  }
  // whole thing gets a soft tail fade so nothing clips off abruptly
  for(let i=0;i<s.length;i++){ const t=i/SR; if(t>dur-0.02) s[i]*=(dur-t)/0.02; }
  return s; };

const OUT=process.argv[2]||'.';
for(let v=1;v<=2;v++) W('cord'+v, cord(v-1), 0.80);
console.log('generated 2 cord WAVs in', OUT);
