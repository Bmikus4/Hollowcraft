// FLUORESCENT TUBE SFX -> 16-bit PCM WAV (ffmpeg then encodes .ogg).
// Standalone so it does NOT regenerate the existing library (gen-sfx.js uses Math.random for every sound).
//   fluor1..3     — a tube STRIKING: starter click, a scatter of arc crackle, then the 100Hz buzz catching and settling
//   fluorout1..2  — a tube DROPPING OUT: the buzz collapsing in pitch and amplitude behind a dull contactor thunk
// Same synthesis vocabulary as gen-sfx.js so it sits in the same sonic world as the rest of the game.
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

// a single arc crackle: a very short band-limited noise spit
function spit(s, at, dur, lo, hi, amp){ const n=(dur*SR)|0, off=(at*SR)|0, z=bp(noise(dur),lo,hi);
  for(let i=0;i<n;i++){ const o=off+i; if(o<0||o>=s.length)continue; const t=i/SR; s[o]+= z[i]*amp*Math.exp(-t/(dur*0.28)); } }

// STRIKE: starter click -> stuttering arc -> the mains buzz catching, wobbling, then holding
const strike=v=>{ const dur=0.62, s=buf(dur);
  spit(s, 0.000, 0.012, 1800, 9000, 1.00);                                        // the starter contact click
  const nSpits=5+((Math.random()*4)|0);
  for(let k=0;k<nSpits;k++) spit(s, 0.012+Math.random()*0.20, 0.006+Math.random()*0.014, 900+Math.random()*2500, 6000+Math.random()*5000, 0.30+Math.random()*0.45);
  // the buzz: 100Hz + harmonics, gated ON in bursts while the arc is unstable, then steady
  const f0=98+v*3;
  for(let i=0;i<s.length;i++){ const t=i/SR;
    const settle=Math.min(1,Math.max(0,(t-0.05)/0.30));                           // 0 while striking, 1 once it holds
    const gate = settle>0.92 ? 1 : (Math.sin(2*Math.PI*(9+v*4)*t)>-0.25?1:0);      // stutter early, solid late
    const env  = Math.min(1,t/0.02) * (t>dur-0.10 ? (dur-t)/0.10 : 1);
    const b = Math.sin(2*Math.PI*f0*t) + 0.42*Math.sin(2*Math.PI*f0*2*t) + 0.18*Math.sin(2*Math.PI*f0*3*t) + 0.07*Math.sin(2*Math.PI*f0*6*t);
    s[i] += b*0.26*env*gate*(0.45+0.55*settle); }
  // tube hiss riding on top, swelling in as it settles
  const hs=bp(noise(dur),2600,7200);
  for(let i=0;i<s.length;i++){ const t=i/SR; s[i]+= hs[i]*0.055*Math.min(1,Math.max(0,(t-0.04)/0.25)); }
  return s; };

// DROPOUT: a dull contactor thunk with the buzz sagging in pitch and dying
const dropout=v=>{ const dur=0.34, s=buf(dur);
  spit(s, 0.000, 0.030, 90, 900, 0.85);                                            // the thunk (low, dull — a relay, not a click)
  spit(s, 0.004, 0.010, 1500, 5200, 0.28);                                         // a faint tick riding it
  let ph=0;
  for(let i=0;i<s.length;i++){ const t=i/SR;
    const f=(96+v*4)*(1-0.42*Math.min(1,t/0.16));                                  // the buzz sags as the arc loses the gas
    ph+=2*Math.PI*f/SR;
    const env=Math.exp(-t/0.075)*(t<0.004?t/0.004:1);
    s[i] += (Math.sin(ph)+0.36*Math.sin(ph*2))*0.30*env; }
  const hs=bp(noise(dur),2400,6800);
  for(let i=0;i<s.length;i++){ const t=i/SR; s[i]+= hs[i]*0.05*Math.exp(-t/0.05); }
  return s; };

const OUT=process.argv[2]||'.';
for(let v=1;v<=3;v++) W('fluor'+v, strike(v-1), 0.85);
for(let v=1;v<=2;v++) W('fluorout'+v, dropout(v-1), 0.72);
console.log('generated 3 fluor + 2 fluorout WAVs in', OUT);
