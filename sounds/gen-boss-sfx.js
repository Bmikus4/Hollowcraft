// HOLLOWCRAFT boss SFX synthesizer -> 16-bit PCM WAV (ffmpeg then encodes .ogg).
// Fully offline, no copyrighted audio. Synthesizes 5 SERAPH boss-fight sounds.
// Standalone: helpers copied from gen-sfx.js so this file runs on its own.
// Usage: node sounds/gen-boss-sfx.js <OUT_DIR>
const fs=require('fs');
const SR=44100;
const rnd=()=>Math.random()*2-1;
function buf(sec){ return new Float32Array(Math.floor(SR*sec)); }
function lp(x,cut){ const a=1-Math.exp(-2*Math.PI*cut/SR); let y=0; const o=new Float32Array(x.length); for(let i=0;i<x.length;i++){ y+=(x[i]-y)*a; o[i]=y; } return o; }
function hp(x,cut){ const l=lp(x,cut); const o=new Float32Array(x.length); for(let i=0;i<x.length;i++)o[i]=x[i]-l[i]; return o; }
function bp(x,lo,hi){ return hp(lp(x,hi),lo); }
function add(a,b,g){ g=g==null?1:g; const n=Math.max(a.length,b.length),o=new Float32Array(n); for(let i=0;i<n;i++)o[i]=(a[i]||0)+(b[i]||0)*g; return o; }
function env(x,atk,dec){ const o=new Float32Array(x.length); for(let i=0;i<x.length;i++){ const t=i/SR; o[i]=x[i]*(t<atk?t/atk:Math.exp(-(t-atk)/dec)); } return o; }
function noise(sec){ const o=buf(sec); for(let i=0;i<o.length;i++)o[i]=rnd(); return o; }
function sine(sec,f0,f1,vib,vibHz){ const o=buf(sec); let ph=0; for(let i=0;i<o.length;i++){ const t=i/o.length; let f=f0+(f1-f0)*t; if(vib)f*= (1+vib*Math.sin(2*Math.PI*(vibHz||6)*i/SR)); ph+=2*Math.PI*f/SR; o[i]=Math.sin(ph); } return o; }
function saw(sec,f0,f1){ const o=buf(sec); let ph=0; for(let i=0;i<o.length;i++){ const t=i/o.length; const f=f0+(f1-f0)*t; ph+=f/SR; o[i]=2*(ph%1)-1; } return o; }
function ringmod(x,f){ const o=new Float32Array(x.length); for(let i=0;i<x.length;i++)o[i]=x[i]*Math.sin(2*Math.PI*f*i/SR); return o; }
function norm(x,peak){ let m=0; for(const v of x)m=Math.max(m,Math.abs(v)); if(m<1e-6)return x; const g=(peak||0.9)/m; for(let i=0;i<x.length;i++)x[i]*=g; return x; }
// reverberant feedback-delay wash (from music() in gen-sfx.js) — smooths tails into a vast holy space
function wash(s,d1s,d2s,g1,g2){ const out=new Float32Array(s.length), d1=(d1s*SR)|0, d2=(d2s*SR)|0;
  for(let i=0;i<s.length;i++){ let v=s[i]; if(i>=d1)v+=out[i-d1]*g1; if(i>=d2)v+=out[i-d2]*g2; out[i]=v; } return out; }
// mix an oscillator voice at absolute freq into a fresh buffer (helper for clusters)
function voice(sec,f,detune){ const o=buf(sec); let ph=0; const ff=f*(1+detune); for(let i=0;i<o.length;i++){ ph+=2*Math.PI*ff/SR; o[i]=Math.sin(ph); } return o; }

let OUT='.';
function W(name,x,peak){ norm(x,peak); const n=x.length,b=Buffer.alloc(44+n*2);
  b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){ let s=Math.max(-1,Math.min(1,x[i])); b.writeInt16LE((s*32767)|0,44+i*2); }
  fs.writeFileSync(OUT+'/'+name+'.wav',b); }

// ============================================================
// 1) SERAPH_HORN (~2.2s) — colossal dread shofar / ram's-horn blast.
//    Low brassy saw stack (fundamental + fifth + octave), slow swelling
//    attack, a rising pitch bend at the tail (the horn "cries out"),
//    heavy sub-bass under it, faint air-breath noise. Holy but wrong.
// ============================================================
function seraph_horn(){ const sec=2.2; let s=buf(sec);
  // three detuned saw layers forming the horn's brassy timbre, bending up ~a tone over the blast
  const layers=[ [58, 66, 1.0], [58*1.5, 66*1.5, 0.55], [58*2, 66*2, 0.3] ];
  layers.forEach(([f0,f1,amp])=>{ const a=saw(sec,f0,f1), b=saw(sec,f0*1.007,f1*1.007);
    for(let i=0;i<s.length;i++) s[i]+=(a[i]+b[i]*0.8)*amp; });
  // lowpass to keep it brassy-round then a touch of ringmod for the "not of this earth" edge
  s=lp(s,2200); s=add(s, ringmod(s,7.5), 0.18);
  // sub-bass foundation (felt in the chest)
  const sub=sine(sec,29,33); for(let i=0;i<s.length;i++) s[i]+=sub[i]*0.9;
  // breath of air pushed through the horn
  s=add(s, lp(hp(noise(sec),400),1600), 0.12);
  // blast envelope: firm swell in, long sustain, gentle fall
  for(let i=0;i<s.length;i++){ const t=i/SR; const e=Math.min(1,t/0.25)*(t>sec-0.6?Math.max(0,(sec-t)/0.6):1); s[i]*=e; }
  s=wash(s,0.17,0.29,0.30,0.22);
  return s; }

// ============================================================
// 2) SERAPH_CHOIR (~4s) — dissonant massed angelic drone.
//    A close cluster of many detuned "aah" voices spanning a chromatic
//    tone-cluster (holy-but-agonized), ringmod shimmer, sub swell,
//    long reverberant wash. This is the sound of a thousand throats.
// ============================================================
function seraph_choir(){ const sec=4.0; let s=buf(sec);
  // tone cluster (near minor-2nd stacks) — inherently dissonant / uneasy
  const notes=[220, 233.08, 246.94, 277.18, 293.66, 329.63, 349.23];
  notes.forEach((f,ni)=>{ // each note = 3 detuned voices w/ slow chorus + faint octave "formant"
    for(let d=-1;d<=1;d++){ const det=d*0.006; const v=voice(sec,f,det);
      // gentle amplitude shimmer per voice so the mass breathes
      for(let i=0;i<s.length;i++){ const t=i/SR; s[i]+= v[i]*(0.10)*(0.7+0.3*Math.sin(t*(1.5+ni*0.4)+d)); } }
    const oct=voice(sec,f*2,0.004); for(let i=0;i<s.length;i++) s[i]+=oct[i]*0.03; });
  // vowel-ish formant shaping so it reads as voices, not just pads
  s=add(bp(s,300,1400), s, 0.5); s=lp(s,3500);
  // unnatural ringmod shimmer (the choir is not human)
  s=add(s, ringmod(s,5.5), 0.12);
  // sub-bass swell under the whole drone
  for(let i=0;i<s.length;i++){ const t=i/SR; s[i]+= Math.sin(2*Math.PI*36*t)*0.10*(0.5+0.5*Math.sin(t*0.4)); }
  // overall swell in/out envelope
  for(let i=0;i<s.length;i++){ const t=i/SR; s[i]*= Math.min(1,t/0.6)*(t>sec-1.0?Math.max(0,(sec-t)/1.0):1); }
  s=wash(s,0.19,0.31,0.34,0.26); // vast cathedral wash
  return s; }

// ============================================================
// 3) SERAPH_CHARGE (~1.4s) — rising energy whine before the eye-beam.
//    Multiple sines + a saw sweeping UP an octave+, exponential rise,
//    ringmod for electric texture, amplitude ramps to a bright peak,
//    a stutter tremolo that accelerates like something winding up.
// ============================================================
function seraph_charge(){ const sec=1.4; let s=buf(sec);
  // exponential upward frequency ramp
  const o=buf(sec); let ph1=0,ph2=0,ph3=0;
  for(let i=0;i<o.length;i++){ const t=i/o.length;
    const f=180*Math.pow(24,t); // 180Hz -> ~4.3kHz sweep
    ph1+=2*Math.PI*f/SR; ph2+=2*Math.PI*f*1.5/SR; ph3+=2*Math.PI*f*2.005/SR;
    o[i]= Math.sin(ph1) + 0.5*Math.sin(ph2) + 0.35*Math.sin(ph3); }
  s=add(s,o,1);
  // add a saw sweep for grit
  const sw=saw(sec,150,3600); s=add(s,sw,0.4);
  // electric ringmod
  s=add(s, ringmod(s,90), 0.25);
  // accelerating tremolo (winding-up stutter) + exponential amplitude rise to peak
  for(let i=0;i<s.length;i++){ const t=i/SR; const rate=8+40*(t/sec); // trem speeds up
    const trem=0.6+0.4*Math.sin(2*Math.PI*rate*t*(t/sec));
    s[i]*= Math.pow(t/sec,1.6)*trem; }
  // bright hiss riser layered on top
  s=add(s, env(hp(noise(sec),2000),0.001, 4.0), 0.15);
  s=wash(s,0.05,0.09,0.20,0.14);
  return s; }

// ============================================================
// 4) SERAPH_BEAM (~1.2s) — searing eye-beam / laser discharge.
//    A hard bright attack, dense ringmod-shredded noise + high saw
//    sweeping DOWN, sub-bass "thoom" impact, sizzling crackle tail.
// ============================================================
function seraph_beam(){ const sec=1.2; let s=buf(sec);
  // core beam: bright noise band, ringmodded for a coherent laser scream
  let core=bp(noise(sec),1200,7000);
  core=add(core, ringmod(core,320), 0.6);
  // descending high saw (the beam "cuts")
  const cut=saw(sec,3800,900); s=add(s, bp(cut,700,6000), 0.5);
  s=add(s,core,0.8);
  // metallic ringmod layer for the searing quality
  s=add(s, ringmod(s,610), 0.25);
  // hard fast attack, sustained burn, quick cutoff
  for(let i=0;i<s.length;i++){ const t=i/SR; const e=Math.min(1,t/0.008)*(t>0.85?Math.max(0,(sec-t)/0.35):1); s[i]*=e; }
  // sub-bass impact "thoom" at the front
  const thoom=env(sine(0.6,90,32),0.003,0.22); for(let i=0;i<thoom.length&&i<s.length;i++) s[i]+=thoom[i]*0.9;
  // sizzling crackle tail (embers of the burn)
  const cr=buf(sec); for(let i=0;i<cr.length;i++){ const t=i/SR; if(Math.random()<0.02) cr[i]=rnd()*Math.exp(-t/0.8); }
  s=add(s, hp(cr,3000), 0.4);
  s=wash(s,0.07,0.13,0.22,0.15);
  return s; }

// ============================================================
// 5) SERAPH_TOLL (~3.5s) — vast holy bell toll with tinnitus ring.
//    Inharmonic bell partials struck hard, a piercing high sine
//    "tinnitus" ring that lingers, deep sub hum, huge reverb tail.
//    Rings out like judgment. Suited to boss death.
// ============================================================
function seraph_toll(){ const sec=3.5; let s=buf(sec);
  // inharmonic bell partial ratios (classic struck-bell spectrum)
  const base=110; const partials=[ [1.0,1.0],[2.0,0.6],[2.4,0.5],[3.0,0.35],[4.2,0.28],[5.4,0.2],[6.8,0.15] ];
  partials.forEach(([r,amp],pi)=>{ const f=base*r; const decay=2.6/Math.pow(r,0.5); // higher partials decay faster
    let ph=0; for(let i=0;i<s.length;i++){ const t=i/SR; ph+=2*Math.PI*f*(1+0.0008*Math.sin(t*3))/SR; s[i]+= Math.sin(ph)*amp*Math.exp(-t/decay); } });
  // strike transient (the clapper)
  const strike=env(bp(noise(0.15),600,4000),0.0005,0.05); for(let i=0;i<strike.length&&i<s.length;i++) s[i]+=strike[i]*0.6;
  // deep sub hum under the bell
  for(let i=0;i<s.length;i++){ const t=i/SR; s[i]+= Math.sin(2*Math.PI*41*t)*0.18*Math.exp(-t/2.8); }
  // piercing high "tinnitus" ring — a thin sine that lingers, disorienting
  let ph=0; for(let i=0;i<s.length;i++){ const t=i/SR; ph+=2*Math.PI*4186*(1+0.001*Math.sin(t*0.5))/SR; s[i]+= Math.sin(ph)*0.09*Math.min(1,t/0.4)*Math.exp(-t/3.2); }
  // faint ringmod shimmer for the unnatural, holy edge
  s=add(s, ringmod(s,6.5), 0.10);
  s=wash(s,0.23,0.37,0.36,0.28); // cavernous, judgment-hall tail
  return s; }

// ---------- run ----------
OUT=process.argv[2]||'.';
W('seraph_horn',   seraph_horn(),   0.85);
W('seraph_choir',  seraph_choir(),  0.85);
W('seraph_charge', seraph_charge(), 0.85);
W('seraph_beam',   seraph_beam(),   0.85);
W('seraph_toll',   seraph_toll(),   0.85);
console.log('generated 5 seraph boss sfx into', OUT);
