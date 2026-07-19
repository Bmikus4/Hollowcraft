// SERAPHIM FRACTAL — inward raymarch fragment (canon seraphim-canon.md §10)
// Agent D math prototype. GLSL ES 1.00 (THREE.ShaderMaterial default).
// Fullscreen-quad raymarch. Primary DE = KIFS; Mandelbulb toggle; sphere inversion
// (Lipschitz-corrected) so the fractal ENCLOSES reality; orbit traps -> iris + scripture;
// analytic boss SDF twin for morph. Palette locked to canon §1.
precision highp float;

varying vec2 vUv;

// ---- camera / frame ----
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uTanHalfFov;
uniform float uAspect;

// ---- fractal params ----
uniform float uType;      // 0 = KIFS, 1 = Mandelbulb
uniform int   uIter;      // KIFS fold count n (~10..14)
uniform float uS;         // KIFS scale s in [1.8,2.8]
uniform float uB;         // KIFS radius offset b
uniform vec3  uC;         // KIFS fold offset vector c
uniform float uK;         // Mandelbulb power k
uniform int   uBulbIter;  // Mandelbulb iteration count
uniform mat3  uR1;        // rotation R1 (post-fold)
uniform mat3  uR2;        // rotation R2 (post-scale)
uniform float uInvR;      // sphere inversion radius R (shrink -> encloses view)

// ---- orbit trap params ----
uniform float uRho;       // eye-trap target radius rho  (tau_eye = min|‖z‖-rho|)
uniform float uTauMax;    // eye-trap normalizer for polar U
uniform float uIrisWidth; // eye-trap mask width
uniform float uScrWidth;  // scripture (plane) trap mask width
uniform float uIrisStrength;
uniform float uScrStrength;
uniform sampler2D uIris;  // Agent-B iris JPEG (or procedural fallback)

// ---- morph ----
uniform float uMorph;     // m in [0,1]: 0=analytic boss, 1=fractal
uniform float uBossSmink; // smooth-min k

// ---- march / shading ----
uniform int   uMaxSteps;
uniform float uEps;       // hit when DE < uEps * t
uniform float uFar;
uniform float uSigma;     // fog density
uniform float uWrap;      // wrap-lighting w (pseudo-SSS)
uniform float uAoStrength;
uniform float uShadowK;   // soft-shadow cone hardness
uniform float uCoreRadius;
uniform vec3  uLightDir;

// ---- palette (canon §1) ----
uniform vec3  uIvory;
uniform vec3  uRust;
uniform vec3  uEmber;
uniform vec3  uFog;
uniform float uTime;

const int   HARD_MAX  = 128;   // >= any uMaxSteps
const int   FOLD_MAX  = 16;    // >= any uIter / uBulbIter
const float PI2       = 6.28318530718;

struct Trap { float eye; float plane; vec2 zEye; float scr; };

// ---------------------------------------------------------------------------
// Distance estimators. Each fills a Trap (orbit-trap accumulators) so the
// SAME function serves marching, normals, shadows and hit-shading (one source
// of truth); the extra float writes are negligible vs. the fold loop.
// ---------------------------------------------------------------------------

// KIFS: fold z<-|z|; z<-R1 z; z<-s z - c(s-1); z<-R2 z.  DE=(‖z_n‖-b)/s^n.
float deKIFS(vec3 p, out Trap tr) {
  vec3 z = p;
  float s = uS;
  float tauEye = 1e9, tauPlane = 1e9, scr = 0.0;
  vec2 zEye = vec2(0.0);
  int n = 0;
  for (int i = 0; i < FOLD_MAX; i++) {
    if (i >= uIter) break;
    z = abs(z);                 // fold
    z = uR1 * z;                // rotate
    z = s * z - uC * (s - 1.0); // scale about c
    z = uR2 * z;                // rotate
    float r = length(z);
    float de = abs(r - uRho);   // eye trap
    if (de < tauEye) { tauEye = de; zEye = z.xy; }
    float pl = abs(z.y);        // scripture (plane) trap
    if (pl < tauPlane) { tauPlane = pl; scr = float(i); }
    n = i + 1;
  }
  tr = Trap(tauEye, tauPlane, zEye, scr / max(float(n), 1.0));
  return (length(z) - uB) / pow(s, float(n));
}

// Mandelbulb: dr <- k r^(k-1) dr + 1;  DE = 1/2 r ln r / dr.
float deBulb(vec3 p, out Trap tr) {
  vec3 z = p;
  float dr = 1.0;
  float r = 0.0;
  float tauEye = 1e9, tauPlane = 1e9, scr = 0.0;
  vec2 zEye = vec2(0.0);
  int n = 0;
  for (int i = 0; i < FOLD_MAX; i++) {
    if (i >= uBulbIter) break;
    r = length(z);
    if (r > 2.0) { n = i; break; }
    float theta = acos(clamp(z.z / max(r, 1e-6), -1.0, 1.0));
    float phi   = atan(z.y, z.x);
    dr = pow(r, uK - 1.0) * uK * dr + 1.0;
    float zr = pow(r, uK);
    theta *= uK; phi *= uK;
    z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + p;
    float de = abs(length(z) - uRho);
    if (de < tauEye) { tauEye = de; zEye = z.xy; }
    float pl = abs(z.y);
    if (pl < tauPlane) { tauPlane = pl; scr = float(i); }
    n = i + 1;
  }
  tr = Trap(tauEye, tauPlane, zEye, scr / max(float(n), 1.0));
  r = max(length(z), 1e-6);
  return 0.5 * log(r) * r / max(dr, 1e-6);
}

float deFractalRaw(vec3 p, out Trap tr) {
  if (uType < 0.5) return deKIFS(p, tr);
  return deBulb(p, tr);
}

// Sphere inversion (the key trick, canon §10):
//   p' = R²/‖p‖² · p ;  DE_final(p) = DE(p')·‖p‖²/R²·0.5
// The 0.5 is the Lipschitz correction × safety factor — NOT dropped.
float deFractal(vec3 p, out Trap tr) {
  float R2 = uInvR * uInvR;
  float r2 = max(dot(p, p), 1e-6);       // ‖p‖² floor (no div-by-zero / NaN)
  vec3 pp = (R2 / r2) * p;               // p'
  float d = deFractalRaw(pp, tr);
  return d * (r2 / R2) * 0.5;            // Lipschitz × safety
}

// ---- analytic boss SDF twin (~10 primitives, exp smooth-min) --------------
float smin(float a, float b, float k) {
  return -1.0 / k * log(exp(-k * a) + exp(-k * b));   // canon §10 exact form
}
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float mapBoss(vec3 p) {
  float k = uBossSmink;
  // horizontal eye-band
  float d = sdEllipsoid(p, vec3(1.6, 0.40, 0.35));
  // dominant central eye + two flanking eyes
  d = smin(d, length(p) - 0.45, k);
  d = smin(d, length(p - vec3(0.95, 0.0, 0.05)) - 0.18, k);
  d = smin(d, length(p + vec3(0.95, 0.0, -0.05)) - 0.18, k);
  // upper pair — sweeping V
  vec3 pu = p - vec3(0.45, 0.55, -0.10); pu.xy = rot(-0.85) * pu.xy;
  d = smin(d, sdEllipsoid(pu, vec3(1.6, 0.45, 0.15)), k);
  vec3 pu2 = p - vec3(-0.45, 0.55, -0.10); pu2.xy = rot(0.85) * pu2.xy;
  d = smin(d, sdEllipsoid(pu2, vec3(1.6, 0.45, 0.15)), k);
  // mid pair — lateral
  d = smin(d, sdEllipsoid(p - vec3(1.7, 0.0, 0.0), vec3(1.4, 0.40, 0.20)), k);
  d = smin(d, sdEllipsoid(p + vec3(1.7, 0.0, 0.0), vec3(1.4, 0.40, 0.20)), k);
  // lower pair — draped train
  vec3 pl = p - vec3(0.30, -0.75, 0.10); pl.xy = rot(0.35) * pl.xy;
  d = smin(d, sdEllipsoid(pl, vec3(0.50, 1.5, 0.18)), k);
  vec3 pl2 = p + vec3(0.30, 0.75, -0.10); pl2.xy = rot(-0.35) * pl2.xy;
  d = smin(d, sdEllipsoid(pl2, vec3(0.50, 1.5, 0.18)), k);
  return d;
}

// Full field: DE_m = lerp(DE_boss, DE_fractal, m).
float map(vec3 p, out Trap tr) {
  float df = deFractal(p, tr);
  if (uMorph >= 0.999) return df;
  float db = mapBoss(p);
  return mix(db, df, smoothstep(0.0, 1.0, uMorph));
}
float mapDist(vec3 p) { Trap t; return map(p, t); }

// tetrahedron-gradient normal (4 taps)
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.5773;
  float h = 0.0008 + 0.0004 * length(p);
  return normalize(
      e.xyy * mapDist(p + e.xyy * h) + e.yyx * mapDist(p + e.yyx * h)
    + e.yxy * mapDist(p + e.yxy * h) + e.xxx * mapDist(p + e.xxx * h));
}

// DE-cone soft shadow
float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 20; i++) {
    float h = mapDist(ro + rd * t);
    res = min(res, uShadowK * h / t);
    t += clamp(h, 0.01, 0.30);
    if (res < 0.01 || t > 8.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

void main() {
  // ---- primary ray (inward raymarch) ----
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamFwd
      + ndc.x * uTanHalfFov * uAspect * uCamRight
      + ndc.y * uTanHalfFov * uCamUp);

  // ---- march: p=o+t·d̂, t+=DE, hit at DE<ε·t ----
  float t = 0.05;
  int steps = 0;
  bool hit = false;
  for (int i = 0; i < HARD_MAX; i++) {
    if (i >= uMaxSteps) break;
    steps = i;
    vec3 p = ro + rd * t;
    float d = mapDist(p);
    if (d < uEps * t) { hit = true; break; }
    t += d;
    if (t > uFar) break;
  }

  vec3 col = uFog;   // background = blinding cloud (never black)

  if (hit) {
    vec3 p = ro + rd * t;
    Trap tr;
    map(p, tr);                    // recover orbit traps at the hit
    vec3 N = calcNormal(p);

    // base ivory->rust stain: rust concentrates at the core AND in deep iteration
    // rows (inner feathers), clean ivory at the fractal's outer tips (canon §1).
    float stainCore = 1.0 - smoothstep(0.0, uCoreRadius, length(p));
    float stain = clamp(max(stainCore, tr.scr * 0.9), 0.0, 1.0);
    vec3 albedo = mix(uIvory, uRust, stain);

    // scripture trap -> white striations tinted rust by iteration count
    float scrMask = (1.0 - smoothstep(0.0, uScrWidth, tr.plane)) * uScrStrength;
    vec3 scrCol = mix(vec3(0.98, 0.96, 0.92), uRust, tr.scr);
    albedo = mix(albedo, scrCol, scrMask);

    // eye trap -> iris via polar UVs (tau/tauMax, atan2(z_y,z_x)/2pi)
    float irisMask = (1.0 - smoothstep(0.0, uIrisWidth, tr.eye)) * uIrisStrength;
    vec2 pol = vec2(clamp(tr.eye / uTauMax, 0.0, 1.0),
                    atan(tr.zEye.y, tr.zEye.x) / PI2 + 0.5);
    vec3 irisCol = texture2D(uIris, pol).rgb;
    albedo = mix(albedo, irisCol, irisMask);

    // wrap-lighting pseudo-SSS: NdotL_wrap = (N·L + w)/(1 + w)
    vec3 L = normalize(uLightDir);
    float ndl = dot(N, L);
    float wrap = max((ndl + uWrap) / (1.0 + uWrap), 0.0);
    float sh = softShadow(p + N * (uEps * t + 0.002), L);
    // AO from raymarch iteration count (more steps to reach => more occluded)
    float ao = clamp(1.0 - float(steps) / float(uMaxSteps) * uAoStrength, 0.0, 1.0);

    // hemisphere-ish fill (sky ivory / ground warm), keeps albedo colour readable
    vec3 ambient = mix(uRust * 0.18, uIvory * 0.45, N.y * 0.5 + 0.5);
    col = albedo * (ambient + wrap * sh) * ao;

    // ember/gold glints smoldering in the core (emissive-on-opaque)
    float ember = smoothstep(uCoreRadius * 0.7, 0.0, length(p))
                * (0.55 + 0.45 * sin(uTime * 3.0 + tr.scr * 12.0));
    col += uEmber * ember * 0.9;

    // holy-dread rim from iris glow
    col += irisCol * irisMask * 0.15;

    // exponential white fog toward #f5f1ea
    float fog = 1.0 - exp(-uSigma * t);
    col = mix(col, uFog, fog);
  }

  col = clamp(col, 0.0, 8.0);      // HDR headroom for bloom; guards inf/NaN blowup
  gl_FragColor = vec4(col, 1.0);
}
