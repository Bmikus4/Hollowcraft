// VENDING MACHINE DISPENSE SFX -> 16-bit PCM WAV (ffmpeg then encodes .ogg).
// Standalone so it does NOT regenerate the existing library (gen-sfx.js uses Math.random for every sound).
//   vending  — coin accepted: relay clunk, spiral coil motor turning, product falling into the tray
// WHY it is built this way:
//   * The whole sound is one continuous mechanical EVENT, so it is built as a timeline on a single buffer
//     rather than as separate layers glued together — the motor has to be already running underneath the
//     drop, and the fluorescent buzz has to be running under everything.
//   * The relay clunk is a contactor: a low dull noise burst (90-800Hz) plus a small dying 60-90Hz partial.
//     Deliberately NO high transient — a bright click would read as a switch, not a solenoid pulling in.
//   * The motor is a cheap DC gearmotor: a sawtooth-ish buzz at ~55Hz with its harmonics, plus a slight
//     pitch dip at spin-up (loaded start) and slow flutter from gear lash. Building it from a phase
//     accumulator (rather than a fixed-frequency sine) is what lets the pitch bend.
//   * The spiral coil rattle is the key detail: as the helix rotates, the product scrapes over each coil
//     turn — so it's a train of tiny high-mid ticks locked to the motor's rotation rate, getting slightly
//     louder as the item works forward. Periodic-but-imperfect spacing is what makes it read as a coil
//     rather than as a buzz.
//   * The drop is two events, not one: a plastic bottle/packet knock (mid-band body, ~200-500Hz partial,
//     short) then the sheet-metal tray answering with a thin low ring — plastic-on-metal. The metal ring is
//     allowed to last ~150ms because a tray flap genuinely does ring; nothing else in this file does.
//   * The fluorescent buzz is a 100Hz mains harmonic stack at very low level for the whole duration, so the
//     sound sits inside a lit machine rather than in silence.
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

// a decaying partial
function ring(s, at, dur, f, amp, dk){ const n=(dur*SR)|0, off=(at*SR)|0;
  for(let i=0;i<n;i++){ const o=off+i; if(o<0||o>=s.length)continue; const t=i/SR;
    s[o]+= Math.sin(2*Math.PI*f*t)*amp*Math.exp(-t/dk)*(t<0.0006?t/0.0006:1); } }

const vending=()=>{ const dur=1.62, s=buf(dur);
  const MOT_T0=0.075, MOT_DUR=0.90, MOT_HZ=5.4;      // coil turns ~5.4 rev/s -> the rattle rate
  const DROP=1.02;

  // ---- 1) relay clunk: solenoid pulling in. Low and dull, no bright click. ----
  spit(s, 0.000, 0.040, 90, 800, 0.90, 0.20);
  spit(s, 0.004, 0.014, 800, 3000, 0.16, 0.18);       // faint mechanical contact, kept quiet
  ring(s, 0.001, 0.070, 74, 0.30, 0.022);             // the armature seating
  ring(s, 0.003, 0.040, 168, 0.14, 0.012);

  // ---- 2) the motor: geared DC buzz, dipping at loaded spin-up then holding, with gear flutter ----
  const mn=(MOT_DUR*SR)|0, moff=(MOT_T0*SR)|0; let ph=0;
  for(let i=0;i<mn;i++){ const o=moff+i; if(o>=s.length)break; const t=i/SR, p=t/MOT_DUR;
    const f=55*(0.72+0.28*Math.min(1,t/0.13))*(1+0.012*Math.sin(2*Math.PI*MOT_HZ*t));  // spin-up + lash flutter
    ph+=2*Math.PI*f/SR;
    const env=Math.min(1,t/0.05)*(p>0.88?(1-p)/0.12:1);
    const m=Math.sin(ph)+0.55*Math.sin(ph*2)+0.32*Math.sin(ph*3)+0.16*Math.sin(ph*5)+0.08*Math.sin(ph*8);
    s[o]+= m*0.13*env*(0.88+0.12*Math.sin(2*Math.PI*MOT_HZ*t));
  }
  // brush/bearing hiss riding the motor so it isn't a pure tone
  const mh=bp(noise(MOT_DUR),1200,5600);
  for(let i=0;i<mn;i++){ const o=moff+i; if(o>=s.length)break; const t=i/SR;
    s[o]+= mh[i]*0.045*Math.min(1,t/0.05)*(t>MOT_DUR-0.12?(MOT_DUR-t)/0.12:1); }

  // ---- 3) spiral rattle: the product scraping over each coil turn, locked to the rotation rate ----
  const period=1/MOT_HZ;
  for(let k=0;;k++){
    const at=MOT_T0+0.09+k*period*(0.96+Math.random()*0.08);   // periodic, but not machine-perfect
    if(at>MOT_T0+MOT_DUR-0.06)break;
    const grow=0.55+0.45*(k/6);                                // works forward, gets more insistent
    spit(s, at, 0.020, 1500, 8000, 0.20*Math.min(1.2,grow), 0.22);   // the scrape over the wire
    ring(s, at, 0.026, 2300+Math.random()*900, 0.07*grow, 0.007);    // thin wire ping
    spit(s, at+0.010, 0.014, 300, 1400, 0.09*grow, 0.20);            // the packet body answering
  }

  // ---- 4) the drop: plastic knock, then the sheet-metal tray flap ringing ----
  spit(s, DROP,        0.030, 200, 2600, 0.80, 0.16);     // plastic body hitting the flap
  ring(s, DROP+0.001,  0.060, 240, 0.34, 0.016);
  ring(s, DROP+0.001,  0.040, 430, 0.18, 0.010);
  spit(s, DROP+0.006,  0.050, 90, 420, 0.34, 0.18);       // the low thump through the cabinet
  // the tray: thin metal, allowed to ring — this is the only long resonance in the file
  ring(s, DROP+0.004,  0.30, 620, 0.16, 0.055);
  ring(s, DROP+0.004,  0.26, 1490, 0.10, 0.038);
  ring(s, DROP+0.004,  0.22, 2870, 0.05, 0.026);
  spit(s, DROP+0.004,  0.16, 900, 6000, 0.16, 0.14);      // metallic wash of the flap swinging
  // the flap falling shut again, and the item settling in the tray
  spit(s, DROP+0.15,   0.040, 150, 1800, 0.26, 0.18);
  ring(s, DROP+0.15,   0.10, 540, 0.09, 0.024);
  spit(s, DROP+0.26,   0.030, 260, 2200, 0.11, 0.20);

  // ---- 5) fluorescent buzz under the whole thing: the machine is lit ----
  for(let i=0;i<s.length;i++){ const t=i/SR;
    const b=Math.sin(2*Math.PI*100*t)+0.40*Math.sin(2*Math.PI*200*t)+0.17*Math.sin(2*Math.PI*300*t)+0.07*Math.sin(2*Math.PI*600*t);
    const e=Math.min(1,t/0.05)*(t>dur-0.10?(dur-t)/0.10:1);
    s[i]+= b*0.035*e*(0.92+0.08*Math.sin(2*Math.PI*3.1*t));
  }
  const bh=bp(noise(dur),2800,7400);
  for(let i=0;i<s.length;i++){ const t=i/SR; s[i]+= bh[i]*0.020*Math.min(1,t/0.06)*(t>dur-0.10?(dur-t)/0.10:1); }

  for(let i=0;i<s.length;i++){ const t=i/SR; if(t>dur-0.03) s[i]*=(dur-t)/0.03; }
  return s; };

const OUT=process.argv[2]||'.';
W('vending', vending(), 0.80);
console.log('generated 1 vending WAV in', OUT);
