// SERAPHIM COMPOSITION-FIX VERIFIER
// Serves the repo root on :8099 (python http.server), loads the boss harness in
// headless GPU Chrome, captures TWO camera angles that mimic the user's screenshots,
// and reports window.__diag vs the 13/118,912/4 baseline.
//   node bench/verify-seraph-fix.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = 'src/boss/seraphim/demo';
const PORT = 8099;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function waitHttp(url) { return new Promise((res, rej) => { const t0 = Date.now(); (function poll() { const rq = http.get(url, r => { r.resume(); res(); }); rq.on('error', () => { if (Date.now() - t0 > 15000) rej(new Error('no server')); else setTimeout(poll, 250); }); })(); }); }

// OrbitControls isn't exported by the harness, but its update() is idempotent with
// no user input: it rebuilds the offset from the live camera.position each frame, so
// externally setting camera.position holds. Target stays the harness default (0,1.5,0).
async function setCam(page, pos) {
  await page.evaluate((p) => {
    const b = window.__boss;
    b.params.moveTarget = false;
    b.targetPos.set(200, 200, 200);          // park the laser target ball out of frame
    b.camera.position.set(p[0], p[1], p[2]);
  }, pos);
  await sleep(900);   // let a few eye/gaze/damping frames settle
}

(async () => {
  const server = spawn('python', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  try {
    await waitHttp('http://127.0.0.1:' + PORT + '/' + DEMO + '/boss-harness.html');
    const browser = await chromium.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true,
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--mute-audio'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)); });

    await page.goto('http://127.0.0.1:' + PORT + '/' + DEMO + '/boss-harness.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__diag && window.__boss', { timeout: 60000 });
    await sleep(2500);   // let eye textures load + a couple seconds of animation

    // Angle A — LOW and CLOSE, looking UP at the boss front (the problem shot)
    await setCam(page, [0, -5.5, 13.5]);
    await page.screenshot({ path: path.join(ROOT, DEMO, 'fix-lowangle.png') });

    // Angle B — mid distance, front-on, slightly above (the good shot)
    await setCam(page, [0, 5.0, 30]);
    await page.screenshot({ path: path.join(ROOT, DEMO, 'fix-middist.png') });

    const diag = await page.evaluate('window.__diag');
    console.log(JSON.stringify({ diag, errors: errors.slice(0, 8) }, null, 1));
    await browser.close();
  } finally { try { server.kill(); } catch (e) {} }
})().catch(e => { console.error(e); process.exit(1); });
