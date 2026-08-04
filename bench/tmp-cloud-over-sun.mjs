// WHY THE SUN IS ALMOST NEVER BEHIND THICK CLOUD.
// The sky's coverage chain is pure arithmetic, so it can be answered offline instead of by screenshots:
// this is a float32 port of skyMat's h13/n3/fbmC and the coverage lines, sampled AT the sun direction
// over a full sweep of bearings and elevations. Verify the port against the GPU with __hc.cloudAt().
const f = Math.fround;
const fract = x => f(x - Math.floor(x));

function h13(x, y, z) {
  let px = fract(f(x * 0.3183099 + 0.1)), py = fract(f(y * 0.3183099 + 0.1)), pz = fract(f(z * 0.3183099 + 0.1));
  px = f(px * 17.0); py = f(py * 17.0); pz = f(pz * 17.0);
  return fract(f(f(f(px * py) * pz) * f(f(px + py) + pz)));
}
const mix = (a, b, t) => f(a + f(f(b - a) * t));
function n3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = f(x - ix), fy = f(y - iy), fz = f(z - iz);
  fx = f(f(fx * fx) * f(3.0 - f(2.0 * fx))); fy = f(f(fy * fy) * f(3.0 - f(2.0 * fy))); fz = f(f(fz * fz) * f(3.0 - f(2.0 * fz)));
  const c = (dx, dy, dz) => h13(ix + dx, iy + dy, iz + dz);
  return mix(
    mix(mix(c(0,0,0), c(1,0,0), fx), mix(c(0,1,0), c(1,1,0), fx), fy),
    mix(mix(c(0,0,1), c(1,0,1), fx), mix(c(0,1,1), c(1,1,1), fx), fy), fz);
}
function fbmC(x, y, z) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 5; i++) { v = f(v + f(a * n3(x, y, z))); x = f(x * 2.02); y = f(y * 2.02); z = f(z * 2.02); a = f(a * 0.5); }
  return v;
}
function fbm2(x, y, z) {
  let v = 0, a = 0.6;
  for (let i = 0; i < 2; i++) { v = f(v + f(a * n3(x, y, z))); x = f(x * 2.31); y = f(y * 2.31); z = f(z * 2.31); a = f(a * 0.5); }
  return v;
}
const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// The shader's coverage chain, verbatim, for one direction.
export function cloudAt(dir, uTime, uCloud) {
  if (dir[1] <= 0.02) return { d: 0, raw: 0, cirrus: 0, cloud: 0 };
  const k = f(dir[1] * 0.9 + 0.1);
  const cpx = f(dir[0] / k), cpz = f(dir[2] / k);
  const uvx = f(f(cpx * 0.55) + f(uTime * 0.006)), uvy = f(f(cpz * 0.55) + f(uTime * 0.002));
  const raw = fbmC(f(uvx * 1.3), f(uvy * 1.3), f(uTime * 0.02));
  let d = smoothstep(0.38, 0.62, raw) * smoothstep(0.02, 0.25, dir[1]) * uCloud;
  let cloud = d * 0.92, c2 = 0;
  if (dir[1] > 0.10) {
    const hx = f(f(cpx * 0.22) + f(uTime * 0.019)), hy = f(f(cpz * 0.22) + f(uTime * 0.004));
    c2 = smoothstep(0.46, 0.86, fbm2(f(hx * 0.55), f(hy * 2.6), f(uTime * 0.011))) * smoothstep(0.10, 0.42, dir[1]) * uCloud * 0.55;
    cloud = Math.min(1, cloud + c2 * (1 - cloud));
  }
  return { d, raw, cirrus: c2, cloud };
}
export const dimmer = cloud => Math.pow(Math.max(0, 1 - cloud), 1.8);

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const covers = [0.6, 1.0, 1.6];
  const times = Array.from({ length: 40 }, (_, i) => 30 + i * 47.3);   // real seconds; the field scrolls on uTime
  const elevs = [0.05, 0.15, 0.3, 0.5, 0.7];                          // sun elevation (dir.y)
  const bearings = Array.from({ length: 24 }, (_, i) => i * Math.PI / 12);
  console.log('cover  elev   n     raw:med  p95    d:med  p95   cloud:med  p95   %cloud>.8  %cloud>.5  dim:med  dim:min');
  for (const uCloud of covers) {
    for (const ey of elevs) {
      const h = Math.sqrt(1 - ey * ey);
      const rows = [];
      for (const t of times) for (const b of bearings) {
        const dir = [Math.cos(b) * h, ey, Math.sin(b) * h];
        rows.push(cloudAt(dir, t, uCloud));
      }
      const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
      const raw = rows.map(r => r.raw), dd = rows.map(r => r.d), cl = rows.map(r => r.cloud);
      const dim = cl.map(dimmer);
      const pct = (a, th) => (100 * a.filter(v => v > th).length / a.length);
      console.log(
        `${uCloud.toFixed(2)}  ${ey.toFixed(2)}  ${rows.length}  ` +
        `${q(raw,.5).toFixed(3)}  ${q(raw,.95).toFixed(3)}  ` +
        `${q(dd,.5).toFixed(3)}  ${q(dd,.95).toFixed(3)}  ` +
        `${q(cl,.5).toFixed(3)}    ${q(cl,.95).toFixed(3)}  ` +
        `${pct(cl,.8).toFixed(1)}%      ${pct(cl,.5).toFixed(1)}%      ` +
        `${q(dim,.5).toFixed(3)}   ${Math.min(...dim).toFixed(3)}`);
    }
  }
}
