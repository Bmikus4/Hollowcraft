// tools/gen-atlas.mjs — OPTIONAL bake of the scripture atlas to a PNG for
// inspection. The SHIPPING path is runtime CanvasTexture generation
// (materials/bodyMaterial.js -> makeAtlasTexture); this bake is a dev aid only.
//
// Requires the `canvas` npm module (node has no <canvas>). If it is not
// installed, this script prints a clear note and exits 0 WITHOUT failing — the
// runtime path is unaffected. It calls the SAME pure drawAtlas() the runtime
// uses (materials/atlas.js is deliberately three-free so node can import it).
//
//   node tools/gen-atlas.mjs [size]        (default 2048)
// -----------------------------------------------------------------------------
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SIZE = parseInt(process.argv[2] || '2048', 10);
const OUT_DIR = resolve(REPO, 'assets/seraphim/atlas');
const OUT = resolve(OUT_DIR, 'scripture.png');

async function main() {
  let createCanvas, Path2D;
  try {
    ({ createCanvas, Path2D } = await import('canvas'));
  } catch (e) {
    console.log('[gen-atlas] `canvas` npm module not installed — skipping PNG bake.');
    console.log('[gen-atlas] This is EXPECTED here; the shipping atlas is generated at');
    console.log('[gen-atlas] runtime via THREE.CanvasTexture (makeAtlasTexture). To bake a');
    console.log('[gen-atlas] PNG for inspection: `npm i canvas` then re-run this script.');
    return;
  }

  // atlas.js is three-free on purpose, so this import works in plain node.
  const { drawAtlas } = await import(resolve(REPO, 'src/boss/seraphim/materials/atlas.js'));

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  drawAtlas(ctx, SIZE, Path2D);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, canvas.toBuffer('image/png'));
  console.log(`[gen-atlas] wrote ${OUT} (${SIZE}x${SIZE})`);
}

main().catch((e) => { console.error('[gen-atlas] error:', e); process.exitCode = 1; });
