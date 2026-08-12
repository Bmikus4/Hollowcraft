// Downscale the texture inside a GLB and write the GLB back out.
//   node tools/models/shrink-glb-texture.mjs <in.glb> <out.glb> [size=512]
//
// WHY THIS EXISTS: every other model in the pack is untextured vertex colour and the whole 118-file pack comes to
// 4.4 MB. Ben's bag.glb alone is 12 MB, and 11.34 MB of that is one PNG atlas for a 1298-triangle model. The pack is
// awaited before the game draws anything (see the preload), so importing it as-is would treble the wait for boot.
// A 512px atlas on a bag that is never more than a few hundred pixels tall on screen is not a visible loss.
//
// The rewrite is a full rebuild of the binary chunk rather than a patch: shrinking one bufferView moves the byte
// offset of every bufferView after it, and a glTF whose offsets are stale is not a damaged texture, it is garbage
// geometry. Everything is re-packed in order with 4-byte alignment, which is what the spec requires.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const [IN, OUT, SIZE = '512'] = process.argv.slice(2);
if (!IN || !OUT){ console.error('usage: shrink-glb-texture.mjs <in.glb> <out.glb> [size]'); process.exit(1); }

const buf = fs.readFileSync(IN);
if (buf.readUInt32LE(0) !== 0x46546C67) throw new Error('not a GLB');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binHeader = 20 + jsonLen;
const binLen = buf.readUInt32LE(binHeader);
const bin = buf.slice(binHeader + 8, binHeader + 8 + binLen);

const views = json.bufferViews.map(v => bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glbtex-'));
let saved = 0;
for (const img of json.images || []){
  if (img.bufferView == null) continue;
  const src = path.join(tmp, 'in'), dst = path.join(tmp, 'out.jpg');
  fs.writeFileSync(src, views[img.bufferView]);
  // Pillow rather than a JS decoder: it is already a dependency of the texture pipeline (tools that built
  // assets/tex) and a hand-rolled PNG decoder is exactly the kind of thing that quietly mangles an alpha channel.
  execFileSync('python', ['-c',
    'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");' +
    'im=im.resize((int(sys.argv[3]),int(sys.argv[3])),Image.LANCZOS);im.save(sys.argv[2],quality=88,optimize=True)',
    src, dst, SIZE]);
  const out = fs.readFileSync(dst);
  saved += views[img.bufferView].length - out.length;
  views[img.bufferView] = out;
  img.mimeType = 'image/jpeg';
}

const pad4 = n => (4 - (n % 4)) % 4;
const chunks = []; let off = 0;
json.bufferViews.forEach((v, i) => {
  v.byteOffset = off; v.byteLength = views[i].length;
  chunks.push(views[i]);
  const p = pad4(views[i].length);
  if (p){ chunks.push(Buffer.alloc(p)); }
  off += views[i].length + p;
});
const newBin = Buffer.concat(chunks);
json.buffers[0].byteLength = newBin.length;
delete json.buffers[0].uri;

let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
if (pad4(jsonBuf.length)) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + newBin.length, 8);
const jHead = Buffer.alloc(8); jHead.writeUInt32LE(jsonBuf.length, 0); jHead.writeUInt32LE(0x4E4F534A, 4);
const bHead = Buffer.alloc(8); bHead.writeUInt32LE(newBin.length, 0); bHead.writeUInt32LE(0x004E4942, 4);
fs.writeFileSync(OUT, Buffer.concat([head, jHead, jsonBuf, bHead, newBin]));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(path.basename(OUT), (fs.statSync(IN).size / 1048576).toFixed(2) + 'MB ->',
  (fs.statSync(OUT).size / 1048576).toFixed(2) + 'MB', '(' + (saved / 1048576).toFixed(2) + 'MB of texture)');
