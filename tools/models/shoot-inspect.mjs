// Screenshot tools/models/inspect.html so the derived placement can be looked at.
//   node tools/models/shoot-inspect.mjs [query] [outfile]
//   node tools/models/shoot-inspect.mjs "ids=guns/shotgun,guns/revolver&view=top" shotgun-top.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const OUT = path.join(ROOT, 'bench', 'results');
const q = process.argv[2] || '';
const out = path.join(OUT, process.argv[3] || 'model-placement.png');
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
const waitHttp = (u, t = 20000) => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > t ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
function findBrowser(){ for (const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if (fs.existsSync(p)) return p; throw new Error('no browser'); }
fs.mkdirSync(OUT, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
let browser;
try {
  const base = 'http://127.0.0.1:' + port;
  await waitHttp(base + '/index.html');
  browser = await chromium.launch({ executablePath: findBrowser(), headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1420, height: 1600 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(base + '/tools/models/inspect.html' + (q ? '?' + q : ''), { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 20000 });
  const el = await page.$('#c');
  await el.screenshot({ path: out });
  console.log('wrote', out);
} finally { if (browser) await browser.close(); server.kill(); }
