// HOLLOWCRAFT SFX + music synthesizer -> 16-bit PCM WAV (ffmpeg then encodes .ogg).
// Fully offline, no copyrighted audio. Produces ~50 variant SFX + a background track.
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
let OUT='.';
function W(name,x,peak){ norm(x,peak); const n=x.length,b=Buffer.alloc(44+n*2);
  b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){ let s=Math.max(-1,Math.min(1,x[i])); b.writeInt16LE((s*32767)|0,44+i*2); }
  fs.writeFileSync(OUT+'/'+name+'.wav',b); }

// ---------- SFX generators (v = variant index for slight variation) ----------
const G={
  grass:v=>{ const c=380+v*90; return env(add(lp(noise(0.11),c), hp(noise(0.11),2500),0.15),0.001,0.04); },
  stone:v=>env(bp(noise(0.1),800+v*150,2000+v*300),0.0006,0.028),
  wood: v=>add(env(bp(noise(0.12),240+v*40,600+v*80),0.001,0.045), env(sine(0.12,210-v*20,150-v*15),0.001,0.04),0.4),
  sand: v=>env(hp(noise(0.09),1400+v*400),0.001,0.03),
  water:v=>{ const s=buf(0.4),nz=noise(0.4); let y=0; for(let i=0;i<s.length;i++){ const t=i/SR,cut=(2400+v*300)*Math.exp(-t/0.17)+300,a=1-Math.exp(-2*Math.PI*cut/SR); y+=(nz[i]-y)*a; s[i]=y*Math.exp(-t/0.15); } return s; },
  break_wood:v=>{ let s=env(hp(noise(0.16),1800),0.0005,0.02); const tk=env(sine(0.16,2500-v*300,2100),0.0003,0.04); s=add(s,tk,0.5); s=add(s,env(bp(noise(0.16),300,900),0.001,0.05),0.5); return s; },
  break_stone:v=>add(env(hp(noise(0.14),1500),0.0004,0.02), env(bp(noise(0.14),500,1400),0.001,0.05),0.7),
  break_leaves:v=>{ const s=bp(noise(0.3),2400,6500); for(let i=0;i<s.length;i++){ const t=i/SR; s[i]*=Math.exp(-t/0.16)*(0.5+0.5*Math.sin(t*40+v)); } return s; },
  drip: v=>{ const s=buf(0.5); const pl=env(sine(0.14,1200+v*150,420),0.001,0.05); for(let i=0;i<pl.length;i++)s[i]=pl[i]*0.9; const tail=env(sine(0.5,430,400),0.02,0.18); for(let i=0;i<s.length;i++)s[i]+=tail[i]*0.15; return s; },   // cave "ploink" + faint tail
  wind: v=>{ const s=lp(noise(1.6),420+v*120); for(let i=0;i<s.length;i++){ const t=i/SR; s[i]*=Math.sin(Math.PI*t/1.6)*(0.7+0.3*Math.sin(t*3)); } return s; },
  creak:v=>{ const s=add(sine(0.8,90+v*20,70,0.06,3.5), bp(noise(0.8),200,700),0.25); for(let i=0;i<s.length;i++){ const t=i/SR; s[i]*=Math.min(1,t*4)*Math.exp(-t/0.5)*(0.6+0.4*Math.sin(t*12)); } return s; },   // groaning wood
  branch:v=>{ let s=env(hp(noise(0.28),1200),0.0004,0.03); for(let k=0;k<3;k++){ const off=(0.02+k*0.05+Math.random()*0.02)*SR|0; const tk=env(sine(0.1,2200-k*400,1500),0.0003,0.03); for(let i=0;i<tk.length&&off+i<s.length;i++)s[off+i]+=tk[i]*0.5; } s=add(s,env(bp(noise(0.28),250,700),0.001,0.12),0.6); return s; },
  owl: v=>{ const s=buf(0.9); for(const t0 of [0.05,0.42]){ const h=sine(0.32,380+v*30,360,0.04,7); for(let i=0;i<h.length;i++){ const t=i/SR,e=Math.sin(Math.PI*t/0.32); const o=(t0*SR|0)+i; if(o<s.length)s[o]+=h[i]*e*0.9; } } return s; },   // "hoo-hoo"
  crow:v=>{ const s=buf(0.7); for(const t0 of [0.02,0.28]){ let c=saw(0.22,620+v*40,540); c=bp(c,400,3000); for(let i=0;i<c.length;i++){ const t=i/SR,e=Math.exp(-t/0.09)*(0.5+0.5*Math.sin(t*60)); const o=(t0*SR|0)+i; if(o<s.length)s[o]+=(c[i]+rnd()*0.3)*e*0.8; } } return s; },   // "caw caw"
  bird:v=>{ const s=buf(0.4); for(let k=0;k<3+v;k++){ const off=(k*0.06)*SR|0; const ch=sine(0.05,2600+Math.random()*1200,3400); for(let i=0;i<ch.length&&off+i<s.length;i++)s[off+i]+=ch[i]*Math.exp(-(i/SR)/0.02)*0.6; } return s; },
  sheep:v=>{ let s=saw(0.55,300,270); s=bp(s,300,1800); for(let i=0;i<s.length;i++){ const t=i/SR; s[i]*= (1+0.5*Math.sin(2*Math.PI*22*t)) * Math.min(1,t*8)*Math.exp(-t/0.4); } return s; },   // "baa"
  deer: v=>add(env(sine(0.4,180,140,0.05,9),0.01,0.16), env(bp(noise(0.4),300,1200),0.01,0.12),0.4),
  growl:v=>{ let n=bp(noise(1.0),120,900); let s=add(ringmod(n,60+v*15), n, 0.5); for(let i=0;i<s.length;i++){ const t=i/SR; s[i]*=Math.min(1,t*6)*Math.exp(-t/0.6)*(0.7+0.3*Math.sin(t*30)); } return s; },
  shriek:v=>{ let c=saw(1.3,140,90); let m=sine(1.3,140*1.41,90*1.5); let s=new Float32Array(c.length); for(let i=0;i<c.length;i++){ const t=i/c.length; const f=1+ (Math.sin(i*0.013+v)*0.6); s[i]=(c[i]*Math.max(0,f)+rnd()*0.5); } s=bp(s,200,5000); for(let i=0;i<s.length;i++){ const t=i/SR; s[i]*=Math.min(1,t*30)*Math.exp(-t/0.9); } return s; },
  clicks:v=>{ const s=buf(0.55); let t=0.01; while(t<0.5){ const off=t*SR|0; const tk=env(hp(noise(0.02),1400),0.0002,0.006); for(let i=0;i<tk.length&&off+i<s.length;i++)s[off+i]+=tk[i]; t+=0.02+Math.random()*0.05; } return s; },
  call: v=>{ let s=add(sine(1.4,70,60,0.03,2), bp(noise(1.4),80,400),0.3); for(let i=0;i<s.length;i++){ const t=i/SR; s[i]*=Math.sin(Math.PI*Math.min(1,t/1.4))*(0.6+0.4*Math.sin(t*5)); } return s; },   // low distant moan
  hurt: v=>{ let s=add(env(saw(0.26,300-v*30,150),0.004,0.09), env(bp(noise(0.26),400,1600),0.004,0.07),0.5); for(let i=0;i<s.length;i++)s[i]*=(0.85+0.15*Math.sin(i/SR*90)); return s; },
  thunder:v=>{ const sec=2.6; let s=buf(sec); const crack=env(hp(noise(sec),1000+v*300),0.001,0.12); for(let i=0;i<s.length;i++)s[i]+=crack[i]*0.7; let bn=buf(sec),y=0; for(let i=0;i<bn.length;i++){ y+=rnd()*0.02; y*=0.998; bn[i]=y; } bn=lp(bn,130); for(let i=0;i<s.length;i++){ const t=i/SR; s[i]+=bn[i]*8*((0.6+0.4*Math.sin(t*3))*(0.5+0.5*Math.sin(t*1.3+v)))*Math.exp(-t/1.6); } return s; },
};
const COUNTS={grass:3,stone:3,wood:3,sand:3,water:3,break_wood:2,break_stone:2,break_leaves:2,drip:3,wind:2,creak:2,branch:2,owl:2,crow:2,bird:2,sheep:1,deer:1,growl:2,shriek:2,clicks:2,call:2,hurt:2,thunder:2};

// ---------- background soundtrack: slow dread drone + vinyl crackle + sparse detuned notes ----------
// CLEAN eerie ambient — smooth detuned minor-chord pads + sub swell + sparse glassy bells + soft air.
// No vinyl crackle, no tape hiss, no lo-fi band-limiting. A produced, washy dread score.
function music(sec){ const s=buf(sec);
  // a sustained pad "note" = 3 slightly-detuned voices (chorus) + a faint octave shimmer, soft attack/release
  const addNote=(f,t0,dur,amp,atk,rel)=>{ const start=(t0*SR)|0, len=(dur*SR)|0;
    for(let i=0;i<len;i++){ const idx=start+i; if(idx<0||idx>=s.length)continue; const t=i/SR;
      const e = t<atk ? t/atk : (t>dur-rel ? Math.max(0,(dur-t)/rel) : 1);
      let v = Math.sin(2*Math.PI*f*t) + Math.sin(2*Math.PI*f*1.004*t)*0.7 + Math.sin(2*Math.PI*f*0.994*t)*0.7 + Math.sin(2*Math.PI*f*2*t)*0.1;
      s[idx]+= v*amp*e*0.15; } };
  // slow minor-chord progression (low), each chord overlaps the next for a seamless crossfade
  const chords=[[55,65.41,82.41],[43.65,55,65.41],[36.71,43.65,55],[41.20,49.00,61.74]];   // Am · F · Dm · E, low
  const step=sec/chords.length;
  chords.forEach((ch,ci)=>{ const t0=ci*step; ch.forEach(f=>addNote(f, t0-1.5, step+3, 0.9, 3.0, 3.5)); });
  // slow sub-bass swell (felt, not heard)
  for(let i=0;i<s.length;i++){ const t=i/SR; s[i]+= Math.sin(2*Math.PI*41*t)*0.05*(0.5+0.5*Math.sin(t*0.07)); }
  // sparse eerie glass bells — high, long decay, faint vibrato, every ~9–17s
  const bells=[440,523.25,659.25,392.00]; let t=9;
  while(t<sec-6){ const f=bells[(Math.random()*bells.length)|0]; addNote(f, t, 5.5, 0.09, 0.03, 5.0); t+=9+Math.random()*8; }
  // soft air pad — heavily low-passed noise, slow swell, NO pops
  let air=lp(lp(noise(sec),240),240); for(let i=0;i<s.length;i++){ const tt=i/SR; s[i]+= air[i]*0.6*(0.4+0.35*Math.sin(tt*0.045)); }
  // gentle ambient wash (feedback delay) — smooths it into a produced, reverberant bed
  const out=new Float32Array(s.length), d1=(0.19*SR)|0, d2=(0.31*SR)|0;
  for(let i=0;i<s.length;i++){ let v=s[i]; if(i>=d1)v+=out[i-d1]*0.33; if(i>=d2)v+=out[i-d2]*0.24; out[i]=v; }
  return out; }

// ---------- run ----------  (arg3 'music' = regenerate only the soundtrack)
OUT=process.argv[2]||'.';
if(process.argv[3]!=='music'){ for(const base in COUNTS){ const n=COUNTS[base]; for(let v=1;v<=n;v++){ const name=n===1?base:base+v; W(name, G[base](v-1)); } } }
W('music', music(120), 0.8);
console.log('generated', process.argv[3]==='music'?'music only':(Object.entries(COUNTS).reduce((a,[,n])=>a+n,0)+' sfx variants + music'));
