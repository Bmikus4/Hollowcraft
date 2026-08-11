// MUZZLE FLASHES: THE RIGHT CALIBRE, FOUR OF THEM, AND NEVER THE SAME ONE TWICE.
//
// Ben, 08-11: "give guns their respective muzzle flashes, assets loaded here ... rotate each iteration a bit to
// create a total of 4 possible muzzle flashes. each caliber is loaded, if a guns caliber doesnt match, then it
// should use the nearest accurate one ... much more volatile, brighter, sharper", and then: "the same muzzle
// flash should never happen twice".
//
// "Never twice" is the one claim here that cannot be checked by looking: it is a property of a sequence. This
// fires each gun a few hundred times through the same code path the trigger uses and records the pick, so a
// repeat shows up as a number rather than as a feeling. It also checks that the four picks are actually four
// DIFFERENT sprites-or-rolls, because a bag of four identical flashes would pass a naive repeat test.
//
//   node bench/assert-muzzle-flash.mjs
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
const ok = (n, c, d) => { console.log((c ? '  PASS ' : '  FAIL ') + n + (d != null ? '   ' + d : '')); if (!c) fail++; };
try {
  const base = 'http://127.0.0.1:' + port;
  await waitHttp(base + '/index.html');
  browser = await chromium.launch({ executablePath: findBrowser(), headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
  await page.waitForFunction('window.__hc && window.__hc.muzzle', null, { timeout: 90000 });
  const R = await page.evaluate(() => window.__hc.muzzle(400));
  console.log(JSON.stringify(R.guns, null, 1));
  ok('the sheet decoded', R.sheet && R.sheet.w === 1254, JSON.stringify(R.sheet));
  for (const g of R.guns){
    ok(g.id + ' fires its own calibre', g.cal === g.want, g.cal + ' (wanted ' + g.want + ')');
    ok(g.id + ' has four distinct flashes', g.distinct === 4, 'distinct=' + g.distinct + ' of ' + g.n + ' shots');
    ok(g.id + ' never repeats back to back', g.repeats === 0, 'repeats=' + g.repeats);
    ok(g.id + ' varies in size and heat', g.scaleSpread > 0.25 && g.hotSpread > 0.5, 'scale±' + g.scaleSpread + ' hot±' + g.hotSpread);
    ok(g.id + ' burns above white', g.hotMin > 1.4, 'min brightness ' + g.hotMin);
  }
  ok('every calibre on the sheet is reachable', R.cells === 6, R.cells + ' calibres');
  ok('a calibre the sheet lacks falls back to the nearest', R.near['357'] === '45acp' && R.near['12ga'] === '50bmg', JSON.stringify(R.near));
  ok('tiles are unmipped (sharp)', R.sharp, String(R.sharp));
} finally { if (browser) await browser.close(); server.kill(); }
console.log(fail ? '\n' + fail + ' FAILED' : '\nall pass');
process.exit(fail ? 1 : 0);
