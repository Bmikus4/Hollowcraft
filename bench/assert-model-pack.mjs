// THE MODEL PACK IS IN THE GAME, AND THE THINGS THAT HANG OFF A GUN ARE STILL THERE.
//
// A replaced gun is not "a new mesh"; it is a contract the rest of index.html reads back — gripAt for the arm
// solve, dotY for the ADS lift, a flash sprite at the bore, pump for the reload, adsZ for the length of pull.
// This measures that contract per gun variant, and it measures the thing a screenshot cannot: that the model
// is the PACK's and not the procedural fallback (userData.glb is stamped by src/models/glb.js).
//
//   node bench/assert-model-pack.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
const waitHttp = (u, t = 20000) => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > t ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
function findBrowser(){ for (const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if (fs.existsSync(p)) return p; throw new Error('no browser'); }

const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
let browser, fail = 0;
const ok = (name, cond, detail) => { console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail != null ? '   ' + detail : '')); if (!cond) fail++; };
try {
  const base = 'http://127.0.0.1:' + port;
  await waitHttp(base + '/index.html');
  browser = await chromium.launch({ executablePath: findBrowser(), headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  // favicon.ico is the one 404 this page has always had (there is no favicon file) and it is not this bench's business.
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(r.status() + ' ' + r.url()); });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|status of 404/.test(m.text())) errs.push(m.text()); });
  await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
  await page.waitForFunction('window.__hc && window.__hc.modelPack', null, { timeout: 60000 });
  const R = await page.evaluate(() => window.__hc.modelPack());
  console.log(JSON.stringify(R.guns, null, 1));
  console.log(JSON.stringify(R.items, null, 1));

  ok('every wired GLB parsed', R.missing.length === 0, R.missing.join(',') || '17 loaded');
  ok('placement data loaded', R.placed > 100, R.placed + ' models');
  for (const g of R.guns){
    ok(g.id + ' is the pack model', g.glb, g.glb || 'PROCEDURAL FALLBACK');
    ok(g.id + ' declares a grip', !!g.gripAt, JSON.stringify(g.gripAt));
    ok(g.id + ' declares a sight line', g.dotY != null && g.dotY > 0 && g.dotY < 0.5, String(g.dotY));
    ok(g.id + ' has a flash at the bore', g.flash && Math.abs(g.flashX) < 0.02 && g.flashZ < -0.2, 'z=' + g.flashZ);
    ok(g.id + ' bore points -z', g.boreZ < -0.5, String(g.boreZ));
  }
  const irons = R.guns.filter(g => g.irons);
  ok('irons have a real sight radius', irons.every(g => g.sightSpan > 0.15), irons.map(g => g.id + ':' + g.sightSpan).join(' '));
  ok('irons put both sights on one line', irons.every(g => Math.abs(g.sightDy) < 1e-6), irons.map(g => g.sightDy).join(' '));
  const sg = R.guns.find(g => g.id === 'shotgun');
  ok('the 12 gauge keeps a racking forend', sg && sg.pump, sg && String(sg.pump));
  ok('the 12 gauge keeps its length of pull', sg && sg.adsZ === -0.46, sg && String(sg.adsZ));
  const bolt = R.guns.find(g => g.id === 'hunting_rifle');
  ok('the scoped rifle keeps a PiP lens', bolt && bolt.scopeLens, bolt && String(bolt.scopeLens));
  const boltDot = R.guns.find(g => g.id === 'hunting_rifle_dot');
  ok('a red dot hides the scope (XOR)', boltDot && boltDot.scopeHidden, boltDot && String(boltDot.scopeHidden));
  ok('tools come from the pack', R.tools.every(t => t.glb), R.tools.map(t => t.id + ':' + (t.glb || 'PROC')).join(' '));
  ok('tool tiers differ in colour', new Set(R.tools.filter(t => t.kind === 'axe').map(t => t.cols)).size === 4, R.tools.filter(t => t.kind === 'axe').map(t => t.tier + ':' + t.cols).join(' '));
  ok('the two apples are one mesh, two paints', R.items.apple && R.items.green_apple && R.items.apple.tris === R.items.green_apple.tris && R.items.apple.cols !== R.items.green_apple.cols,
     R.items.apple && (R.items.apple.cols + ' vs ' + R.items.green_apple.cols));
  ok('both pack tiers exist', R.packs.backpack === 27 && R.packs.alice_pack === 54, JSON.stringify(R.packs));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally { if (browser) await browser.close(); server.kill(); }
console.log(fail ? '\n' + fail + ' FAILED' : '\nall pass');
process.exit(fail ? 1 : 0);
