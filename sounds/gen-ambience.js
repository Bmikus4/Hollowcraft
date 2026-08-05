// HOLLOWCRAFT AMBIENCE (#71) — owls, birds and dusk insects, synthesized offline to 16-bit PCM WAV.
// ffmpeg then encodes .ogg, exactly as gen-sfx.js / gen-boss-sfx.js / gen-fluor.js do.
//
// WHY SYNTHESIS AND NOT RECORDINGS. The item says "assets must be CC0 or otherwise clear to ship", and the cheapest
// way to be certain of that is to own every sample outright. Nothing here is sampled from anything: an owl is two
// vibrato sines through a formant filter, a bird is a fast frequency sweep, a cricket is a pulse train ring-modulated
// with a 4 kHz carrier. That is also why the variants can be extended later by editing numbers instead of by finding a
// site with an acceptable licence.
//
//   node sounds/gen-ambience.js            (writes the WAVs beside this file)
//   then, for each: ffmpeg -y -i X.wav -c:a libvorbis -q:a 4 X.ogg
// The wrapper at the bottom prints the exact ffmpeg lines it wants run.
const fs=require('fs');
const SR=44100;
const rnd=()=>Math.random()*2-1;
function buf(sec){ return new Float32Array(Math.floor(SR*sec)); }
function lp(x,cut){ const a=1-Math.exp(-2*Math.PI*cut/SR); let y=0; const o=new Float32Array(x.length); for(let i=0;i<x.length;i++){ y+=(x[i]-y)*a; o[i]=y; } return o; }
function hp(x,cut){ const l=lp(x,cut); const o=new Float32Array(x.length); for(let i=0;i<x.length;i++)o[i]=x[i]-l[i]; return o; }
function bp(x,lo,hi){ return hp(lp(x,hi),lo); }
function add(a,b,g){ g=(g==null)?1:g; const n=Math.max(a.length,b.length),o=new Float32Array(n); for(let i=0;i<n;i++)o[i]=(a[i]||0)+(b[i]||0)*g; return o; }
function noise(sec){ const o=buf(sec); for(let i=0;i<o.length;i++)o[i]=rnd(); return o; }
function norm(x,peak){ let m=0; for(const v of x)m=Math.max(m,Math.abs(v)); if(m<1e-6)return x; const g=(peak||0.9)/m; for(let i=0;i<x.length;i++)x[i]*=g; return x; }
// one voice: a sine with a frequency envelope and optional vibrato, windowed by attack/decay
function voice(sec,f0,f1,{vib=0,vibHz=6,atk=0.02,dec=0.25,curve=1}={}){
  const o=buf(sec); let ph=0;
  for(let i=0;i<o.length;i++){ const t=i/o.length, tt=Math.pow(t,curve);
    let f=f0+(f1-f0)*tt; if(vib) f*=1+vib*Math.sin(2*Math.PI*vibHz*i/SR);
    ph+=2*Math.PI*f/SR;
    const s=i/SR, e=(s<atk)? s/atk : Math.exp(-(s-atk)/dec);
    o[i]=Math.sin(ph)*e; }
  return o; }
// A HOLLOW WOODEN RESONANCE is what makes a hoot an owl rather than a flute: one narrow band around the fundamental's
// second formant, plus a breath of noise under it.
function owlBody(sec,f,{vib=0.012,atk=0.06,dec=0.30}={}){
  let s=voice(sec,f,f*0.92,{vib,vibHz:5.5,atk,dec});
  s=add(s, voice(sec,f*2,f*1.84,{vib,vibHz:5.5,atk,dec:dec*0.7}), 0.22);   // the second formant, quieter
  s=add(s, bp(noise(sec), f*0.7, f*3.2), 0.05);                            // breath
  return s; }
function silence(sec){ return buf(sec); }
function cat(...xs){ let n=0; for(const x of xs)n+=x.length; const o=new Float32Array(n); let k=0; for(const x of xs){ o.set(x,k); k+=x.length; } return o; }

const G={
  // TAWNY OWL, the classic two-part call: a short hoo, a pause, then a long quavering hooooo. The pause is the half of
  // it people recognise, and it is why this is one file rather than two cues.
  owl3: ()=> cat(owlBody(0.34,404,{vib:0.010,dec:0.22}), silence(0.30), owlBody(0.72,382,{vib:0.020,vibHz:6.5,atk:0.08,dec:0.42})),
  // BARN OWL: not a hoot at all — a harsh drawn-out screech. Noise-led, band-swept, so it reads as a different bird.
  owl4: ()=>{ const sec=0.85, nz=noise(sec), o=buf(sec); let y1=0,y2=0;
    for(let i=0;i<o.length;i++){ const t=i/SR, f=1500-700*(t/sec);
      const a=1-Math.exp(-2*Math.PI*f/SR); y1+=(nz[i]-y1)*a; y2+=(y1-y2)*a;
      const e=(t<0.04)? t/0.04 : Math.exp(-(t-0.04)/0.55);
      o[i]=(y1-y2)*e*3.2 + Math.sin(2*Math.PI*(720-200*(t/sec))*t)*0.10*e; }
    return o; },
  // DAY BIRDS. Four that do not sound like each other: a rising two-note, a fast down-trill, a three-chirp phrase, and
  // a distant single call with air around it.
  bird3: ()=> cat(voice(0.06,2400,3300,{atk:0.004,dec:0.03}), silence(0.05), voice(0.07,2900,3900,{atk:0.004,dec:0.035})),
  bird4: ()=>{ let s=buf(0.42); for(let k=0;k<7;k++){ const v=voice(0.05,4200-k*220,3400-k*200,{atk:0.003,dec:0.02});
      const off=Math.floor(k*0.052*SR); for(let i=0;i<v.length && off+i<s.length;i++) s[off+i]+=v[i]*0.8; } return s; },
  bird5: ()=> cat(voice(0.05,3100,2600,{atk:0.003,dec:0.025}), silence(0.04), voice(0.05,3400,2900,{atk:0.003,dec:0.025}),
                  silence(0.04), voice(0.08,2800,3600,{atk:0.004,dec:0.04})),
  bird6: ()=>{ // distant: quieter, softer attack, and a tail of room noise so it sits further back in the mix
    const s=add(voice(0.10,2100,2600,{atk:0.02,dec:0.06}), bp(noise(0.30),1200,4000), 0.03);
    return norm(s,0.45); },
  // DUSK INSECTS — a cricket bed, not a one-shot: a pulse train ring-modulated with a 4 kHz carrier, three densities so
  // the scheduler can thicken the evening as the light goes.
  insect1: ()=> crickets(2.6, 3.2, 4100, 1),
  insect2: ()=> crickets(2.6, 5.0, 4400, 2),
  insect3: ()=> crickets(2.6, 7.5, 3800, 3),
};
function crickets(sec, rate, carrier, seed){
  const o=buf(sec), per=SR/rate;
  for(let k=0;k*per<o.length;k++){
    const off=Math.floor(k*per + (Math.random()-0.5)*per*0.12);
    const chirpN=3+((seed+k)%2);                                  // a cricket chirp is a few pulses, not one
    for(let c=0;c<chirpN;c++){
      const co=off+Math.floor(c*0.012*SR);
      for(let i=0;i<Math.floor(0.008*SR);i++){ const j=co+i; if(j<0||j>=o.length) continue;
        const t=i/(0.008*SR), e=Math.sin(Math.PI*t);
        o[j]+=Math.sin(2*Math.PI*carrier*(i/SR))*e*0.5; } } }
  // a touch of air so it is a field at night and not a test tone
  return add(o, bp(noise(sec), 800, 6000), 0.04);
}

let OUT=__dirname;
function W(name,x,peak){ norm(x,peak==null?0.85:peak); const n=x.length,b=Buffer.alloc(44+n*2);
  b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){ const s=Math.max(-1,Math.min(1,x[i])); b.writeInt16LE((s*32767)|0,44+i*2); }
  fs.writeFileSync(OUT+'/'+name+'.wav',b); console.log('wrote '+name+'.wav  '+(n/SR).toFixed(2)+'s'); }

const PEAK={ owl3:0.80, owl4:0.72, bird3:0.75, bird4:0.70, bird5:0.75, bird6:0.42, insect1:0.34, insect2:0.40, insect3:0.46 };
for(const k in G) W(k, G[k](), PEAK[k]);
console.log('\nnow encode:');
for(const k in G) console.log('  ffmpeg -y -loglevel error -i '+k+'.wav -c:a libvorbis -q:a 4 '+k+'.ogg');
