// SERAPHIM SCRIPTURE ATLAS — pure draw routine (Agent C)
// -----------------------------------------------------------------------------
// This module is DELIBERATELY free of any `three` import so it can run in BOTH:
//   - the browser (called by materials/bodyMaterial.js -> makeAtlasTexture)
//   - plain Node (called by tools/gen-atlas.mjs with the `canvas` npm module)
// The runtime CanvasTexture path is the SHIPPING path (matches the game, which
// generates every texture on a <canvas> at runtime); the PNG bake is optional.
//
// Layout contract (seraphim-contracts.md §SCRIPTURE ATLAS LAYOUT):
//   2048² atlas = 2×2 grid of four feather variants. Variant v in {0,1,2,3}
//   occupies cell (col = v & 1, row = v >> 1) -> UV origin (col*0.5,row*0.5),
//   size 0.5×0.5. Each cell = ONE feather, quill-root -> tip along +V, rachis
//   centered on U=0.5, alpha=0 outside the torn silhouette.
//
// NOTE on the V axis: THREE.CanvasTexture defaults to flipY=true, so texture
// v=0 maps to the BOTTOM of the canvas. We therefore draw the quill ROOT at the
// bottom of each cell and the TIP at the top, so v runs root(0)->tip(1) as the
// contract requires. gen-atlas.mjs (node-canvas, no flip) bakes the same pixels
// for visual inspection; the vertical sense is only cosmetic in the PNG.
// -----------------------------------------------------------------------------

// ---- deterministic PRNG (mulberry32) so bake == runtime, per-variant seed ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;

// PALETTE (canon §1) --------------------------------------------------------
const PARCH_HI = [239, 231, 216]; // #efe7d8 clean parchment
const PARCH_LO = [216, 207, 196]; // #d8cfc4 aged parchment
// POLISH 1: deeper, more-saturated blood-crimson ink so scripture READS at mid
// distance (was rgba(126,44,32) = washed #7e2c20). Green/blue pulled down for punch.
const INK = 'rgba(120,32,22,';    // saturated #782016 crimson scripture (canon §1 #7e2c20 family)
const INK_DK = 'rgba(78,20,14,';  // #4e140e near-black ink pooling (heavier contrast)
// POLISH 2: mottle in DEEP crimson #7e2c20, not the orange-red #a34433, so the
// per-feather root staining stops reading orange in the packed core.
const RUST = 'rgba(126,44,32,';   // #7e2c20 deep-crimson mottle (was a34433 orange)
const EDGE = 'rgba(78,22,15,';    // torn-edge shadow (deep crimson)

function rgb(a) { return `rgb(${a[0]|0},${a[1]|0},${a[2]|0})`; }

// Build one feather silhouette path (root at bottom of cell, tip at top).
// Returns {path2dOrNull, leftPts, rightPts, cx, rootY, tipY, maxHalf}
function featherOutline(ctx, ox, oy, cell, rng, Path2D) {
  const m = cell * 0.10;                 // margin
  const cx = ox + cell * 0.5;            // rachis (U=0.5)
  const rootY = oy + cell - m;           // bottom
  const tipY = oy + m + cell * 0.02;     // top
  const H = rootY - tipY;
  const maxHalf = cell * 0.40;
  // width profile w(t): 0 at root, swells ~0.75, tapers to a torn point at tip
  const wprof = (t) => {
    const swell = Math.sin(Math.pow(t, 0.75) * Math.PI) ; // 0..1..0-ish
    const body = Math.pow(t, 0.35) * (1.0 - Math.pow(t, 3.2));
    return maxHalf * (0.35 * swell + 0.9 * body);
  };
  const N = 46;
  const left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = rootY - t * H;
    let hw = wprof(t);
    // torn / ragged barb edge: high-freq jitter, larger toward tip
    const tear = (0.06 + 0.16 * t) * maxHalf;
    const jl = (rng() - 0.3) * tear + Math.sin(t * 34 + rng()) * tear * 0.4;
    const jr = (rng() - 0.3) * tear + Math.sin(t * 31 + rng()) * tear * 0.4;
    left.push([cx - hw + jl, y]);
    right.push([cx + hw - jr, y]);
  }
  const p = Path2D ? new Path2D() : null;
  const moveTo = (x, y) => p ? p.moveTo(x, y) : ctx.moveTo(x, y);
  const lineTo = (x, y) => p ? p.lineTo(x, y) : ctx.lineTo(x, y);
  if (!p) ctx.beginPath();
  moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) lineTo(right[i][0], right[i][1]);
  if (p) p.closePath(); else ctx.closePath();
  return { path: p, left, right, cx, rootY, tipY, H, maxHalf };
}

// faux-handwriting cursive line of scripture between x0..x1 at baseline y.
// POLISH 1: bigger glyphs + heavier, higher-contrast strokes so the text survives
// mip-down and reads as dense handwriting (not fine grain) when a feather is only
// a few % of screen. Still cursive/organic — LOUDER, not blocky.
function scriptureLine(ctx, x0, x1, y, rng, scale) {
  let x = x0;
  const glyphW = 14 * scale;                            // was 9 — larger glyphs
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  while (x < x1) {
    const w = glyphW * (0.7 + rng() * 0.9);
    const strokes = 2 + (rng() * 3 | 0);
    const op = 0.6 + rng() * 0.4;                        // was 0.35..0.85 -> 0.6..1.0 (bold, opaque ink)
    const dark = rng() < 0.4;                            // more near-black glyphs for punch
    ctx.strokeStyle = (dark ? INK_DK : INK) + op.toFixed(3) + ')';
    ctx.lineWidth = (2.8 + rng() * 2.4) * scale;         // was 1.4..3.0 -> 2.8..5.2 (heavier line weight)
    ctx.beginPath();
    const yb = y + (rng() - 0.5) * 3 * scale;           // baseline jitter
    let px = x, py = yb + (rng() - 0.5) * 2 * scale;
    ctx.moveTo(px, py);
    for (let s = 0; s < strokes; s++) {
      const nx = px + (w / strokes) * (0.6 + rng() * 0.8);
      const asc = (rng() - 0.5) * 6.5 * scale;           // ascender/descender (kept in-lane vs bigger glyphs)
      const cy = yb - Math.abs(asc);
      ctx.quadraticCurveTo((px + nx) / 2, cy, nx, yb + asc * 0.3);
      px = nx;
    }
    ctx.stroke();
    x += w + glyphW * (0.12 + rng() * 0.28);            // slightly tighter spacing -> denser text
  }
}

// Draw ONE variant into its cell.
function drawCell(ctx, ox, oy, cell, seed, Path2D) {
  const rng = mulberry32(seed);
  const scale = cell / 1024;
  ctx.save();
  const outline = featherOutline(ctx, ox, oy, cell, rng, Path2D);

  // clip to the feather silhouette (everything else stays alpha=0)
  if (outline.path) ctx.clip(outline.path); else ctx.clip();

  // --- 1. parchment base (subtle vertical gradient + grain) ---
  const g = ctx.createLinearGradient(0, oy + cell, 0, oy);
  g.addColorStop(0, rgb(PARCH_LO));
  g.addColorStop(0.5, rgb(PARCH_HI));
  g.addColorStop(1, rgb([lerp(PARCH_HI[0], 255, .2), lerp(PARCH_HI[1], 255, .2), lerp(PARCH_HI[2], 255, .2)]));
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, cell, cell);

  // parchment grain / fiber — POLISH 1: fewer, fainter flecks so grain no longer
  // competes with / masks the scripture at distance.
  for (let i = 0; i < 110; i++) {
    const x = ox + rng() * cell, y = oy + rng() * cell;
    ctx.fillStyle = `rgba(120,100,80,${(0.012 + rng() * 0.03).toFixed(3)})`;
    ctx.fillRect(x, y, (0.5 + rng() * 2) * scale, (0.5 + rng() * 2) * scale);
  }

  // --- 2. deep-crimson blood mottling blotches (concentrated near rachis/root) ---
  // POLISH 1+2: fewer, lower-opacity DEEP-crimson blots (RUST now = #7e2c20). Enough
  // to read as dried-blood staining at the root without washing over the text or the
  // ivory, and no longer contributing an orange cast.
  const blots = 16;
  for (let i = 0; i < blots; i++) {
    const t = rng();
    const bx = outline.cx + (rng() - 0.5) * outline.maxHalf * 1.6 * (0.4 + t);
    const by = oy + cell - (0.15 + rng() * 0.7) * outline.H;
    const r = (18 + rng() * 70) * scale;
    const rg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    const op = 0.04 + rng() * 0.12;
    rg.addColorStop(0, RUST + op.toFixed(3) + ')');
    rg.addColorStop(1, RUST + '0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  }

  // --- 3. rachis (central quill) + barb shading ---
  ctx.strokeStyle = 'rgba(150,120,95,0.55)';
  ctx.lineWidth = 7 * scale;
  ctx.beginPath();
  ctx.moveTo(outline.cx, outline.rootY);
  ctx.lineTo(outline.cx, outline.tipY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,252,246,0.5)'; // quill highlight
  ctx.lineWidth = 2.4 * scale;
  ctx.beginPath();
  ctx.moveTo(outline.cx - 2 * scale, outline.rootY);
  ctx.lineTo(outline.cx - 2 * scale, outline.tipY);
  ctx.stroke();
  // barbs: faint diagonal lines rachis -> edge, angled toward tip
  ctx.lineWidth = 1.1 * scale;
  const nb = 90;
  for (let i = 0; i < nb; i++) {
    const t = i / nb;
    const y = outline.rootY - t * outline.H;
    const hw = outline.maxHalf * (0.3 * Math.sin(Math.pow(t, .75) * Math.PI) + 0.9 * Math.pow(t, .35) * (1 - Math.pow(t, 3.2)));
    const dy = -hw * 0.32; // slope toward tip (up)
    // POLISH 1: fainter barb hatching so it reads as feather structure, not text-masking grain
    ctx.strokeStyle = `rgba(120,96,74,${(0.03 + rng() * 0.05).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(outline.cx, y);
    ctx.lineTo(outline.cx - hw, y + dy);
    ctx.moveTo(outline.cx, y);
    ctx.lineTo(outline.cx + hw, y + dy);
    ctx.stroke();
  }

  // --- 4. DENSE red handwritten scripture (the signature feature) ---
  // POLISH 1: tighter rows (was 24) -> denser block of text that reads as scripture.
  const lineH = 21 * scale;
  const nLines = Math.floor(outline.H / lineH);
  for (let i = 0; i < nLines; i++) {
    const y = outline.rootY - (i + 0.5) * lineH;
    // width available at this height (rough, keeps text inside silhouette)
    const t = (outline.rootY - y) / outline.H;
    const hw = outline.maxHalf * (0.3 * Math.sin(Math.pow(t, .75) * Math.PI) + 0.9 * Math.pow(t, .35) * (1 - Math.pow(t, 3.2)));
    const pad = 8 * scale;
    scriptureLine(ctx, outline.cx - hw + pad, outline.cx + hw - pad, y, rng, scale);
  }

  // --- 5. torn-edge darkening bites (erosion for a ragged parchment feel) ---
  ctx.globalCompositeOperation = 'destination-out';
  const edgePts = outline.left.concat(outline.right);
  for (let i = 0; i < 130; i++) {
    const pt = edgePts[(rng() * edgePts.length) | 0];
    const r = (2 + rng() * 9) * scale;
    ctx.globalAlpha = 0.3 + rng() * 0.5;
    ctx.beginPath(); ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // torn-edge shadow line (rust) inside the silhouette
  if (outline.path) {
    ctx.strokeStyle = EDGE + '0.35)';
    ctx.lineWidth = 5 * scale;
    ctx.stroke(outline.path);
  }

  ctx.restore();
}

// PUBLIC: pure draw of the whole 2×2 atlas. `ctx` = a 2D context (browser or
// node-canvas), `size` = square px (2048). `Path2DCtor` optional (browser has
// global Path2D; node-canvas exposes one on the module). Falls back to direct
// path building on ctx if no Path2D is supplied.
export function drawAtlas(ctx, size = 2048, Path2DCtor) {
  const P = Path2DCtor || (typeof Path2D !== 'undefined' ? Path2D : null);
  const cell = size / 2;
  ctx.clearRect(0, 0, size, size);
  for (let v = 0; v < 4; v++) {
    const col = v & 1, row = v >> 1;
    drawCell(ctx, col * cell, row * cell, cell, 1013 + v * 9187, P);
  }
}

export const ATLAS_VARIANTS = 4;
