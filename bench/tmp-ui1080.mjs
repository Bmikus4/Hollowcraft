// A/B for the 1080p asset pass: the same menu button and the same pause card, once with the 1x art the CSS used to
// point at and once with the 4x bake, shot at 1920x1080. Writes four crops for compare-1080.py to score.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:\\Code\\Minecraft', OUT = path.join(ROOT, 'bench', 'results');
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
try {
  const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
  const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
  const page = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  const missing = [];
  page.on('response', r => { if (r.url().includes('/assets/ui/') && r.status() >= 400) missing.push(r.url().split('/').pop() + ' ' + r.status()); });
  await page.goto(base + '/index.html', { waitUntil: 'load' }); await sleep(3500);

  await page.screenshot({ path: path.join(OUT, 'ui1080-menu.png'), clip: { x: 560, y: 180, width: 800, height: 620 } });
  const btn = await page.$('#mb-solo');
  const shoot = async (name) => { await sleep(400); await btn.screenshot({ path: path.join(OUT, name) }); };
  await shoot('ui1080-btn-4x.png');
  // Put the OLD art back on this one button, slice and all, and shoot the same pixels.
  await page.evaluate(() => { const b = document.getElementById('mb-solo');
    b.style.borderImageSource = "url('assets/ui/hcell.png')"; b.style.borderImageSlice = '16'; });
  await shoot('ui1080-btn-1x.png');
  await page.evaluate(() => { const b = document.getElementById('mb-solo'); b.style.borderImageSource = ''; b.style.borderImageSlice = ''; });

  // The pause card: open it in game, since #pause only exists once a session is running.
  await page.click('#mb-solo');
  for (let i = 0; i < 120; i++) { if (await page.evaluate(() => window.__hc && __hc.loadState().circleDone)) break; await sleep(500); }
  await sleep(2500);
  await page.evaluate(() => { const p = document.getElementById('pause'); p.style.display = 'flex'; });
  await sleep(600);
  const card = await page.$('#pause > .gcard');   // NOT '#pause > div': the first div is the objectives ledger beside the card
  await card.screenshot({ path: path.join(OUT, 'ui1080-card-4x.png') });
  await page.evaluate(() => { const c = document.querySelector('#pause > .gcard');
    c.style.borderImageSource = "url('assets/ui/frame_main.png')"; c.style.borderImageSlice = '46'; });
  await page.screenshot({ path: path.join(OUT, 'ui1080-pause.png'), clip: { x: 430, y: 120, width: 1060, height: 840 } });
  await sleep(400);
  await card.screenshot({ path: path.join(OUT, 'ui1080-card-1x.png') });

  console.log('crops written; missing assets: ' + (missing.length ? missing.join(', ') : 'none'));
  if (missing.length) process.exitCode = 1;
  await br.close();
} finally { try { server.kill(); } catch (e) {} }
