// SERAPHIM FINISH VERIFIER (lid-merge repair + 8-wing budget + prewarm hitch)
//   node bench/verify-seraph-finish.mjs
// - boss-harness.html loads with ZERO page errors (lid crash fixed)
// - __diag idle AND firing (draw calls ≤15, tris ≤150k, 4 material roles)
// - two screenshots: wings-final-low.png (low/close up-angle) + wings-final-mid.png
// - load-hitch: cold (no prewarm) vs warm (prewarm) first-summon ms
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = 'src/boss/seraphim/demo';
const PORT = 8099;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
function waitHttp(url) { return new Promise((res, rej) => { const t0 = Date.now(); (function poll() { const rq = http.get(url, r => { r.resume(); res(); }); rq.on('error', () => { if (Date.now() - t0 > 15000) rej(new Error('no server')); else setTimeout(poll, 250); }); })(); }); }

async function setCam(page, pos, target) {
  await page.evaluate(({ p, t }) => {
    const b = window.__boss;
    b.params.moveTarget = false;
    b.targetPos.set(200, 200, 200);
    b.camera.position.set(p[0], p[1], p[2]);
    if (t) b.camera.lookAt(t[0], t[1], t[2]);
  }, { p: pos, t: target });
  await sleep(900);
}

(async () => {
  const server = spawn('python', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  const report = {};
  try {
    await waitHttp('http://127.0.0.1:' + PORT + '/' + DEMO + '/boss-harness.html');
    const browser = await chromium.launch({
      executablePath: CHROME, headless: true,
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--mute-audio'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)); });

    // ---- boss harness: load + zero-error + idle/firing diag + screenshots ----
    await page.goto('http://127.0.0.1:' + PORT + '/' + DEMO + '/boss-harness.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__diag && window.__boss', { timeout: 60000 });
    await sleep(2600);

    report.diagIdle = await page.evaluate('window.__boss.computeDiag()');

    // trigger sustained fire → beam + embers become visible (firing draw calls)
    await page.evaluate(() => { window.__boss.model.setState('attack'); window.__boss.model.startLaserCharge(); window.__boss.model.fireLaser(() => window.__boss.targetPos); });
    await sleep(1400);
    report.diagFiring = await page.evaluate('window.__boss.computeDiag()');
    await page.evaluate(() => { window.__boss.model.stopLaser(); window.__boss.model.setState('idle'); });
    await sleep(600);

    // Angle A — LOW and CLOSE, looking UP at the boss (the "8 wings + open V" read)
    await setCam(page, [0, -6.5, 12.5], [0, 3, 0]);
    await page.screenshot({ path: path.join(ROOT, DEMO, 'wings-final-low.png') });
    // Angle B — mid distance, front-on, slightly above
    await setCam(page, [0, 4.0, 30], [0, 1.5, 0]);
    await page.screenshot({ path: path.join(ROOT, DEMO, 'wings-final-mid.png') });

    report.pageErrors = errors.slice(0, 10);

    // ---- prewarm profile (separate page, fresh renderers per scenario) ----
    const pp = await ctx.newPage();
    const ppErr = [];
    pp.on('pageerror', e => ppErr.push(String(e.message || e).slice(0, 200)));
    await pp.goto('http://127.0.0.1:' + PORT + '/bench/prewarm-profile.html', { waitUntil: 'load', timeout: 60000 });
    await pp.waitForFunction('window.__profileReady', { timeout: 60000 });
    // COLD (no prewarm): summon frame pays build + first-render shader compile.
    // run twice; 2nd is the steady number (1st includes JS/JIT warmup).
    const cold1 = await pp.evaluate('window.profileCold()'); await sleep(400);
    const cold2 = await pp.evaluate('window.profileCold()'); await sleep(400);
    // WARM: prewarm at idle, WAIT (mimic the gap to summon so async compile settles),
    // then time only the summon frame.
    await pp.evaluate('window.warmPrep()'); await sleep(1200);
    const warm1 = await pp.evaluate('window.warmSummon()'); await sleep(400);
    await pp.evaluate('window.warmPrep()'); await sleep(1200);
    const warm2 = await pp.evaluate('window.warmSummon()');
    report.profile = { cold_run1: cold1, cold_run2: cold2, warm_run1: warm1, warm_run2: warm2, profileErrors: ppErr };

    console.log(JSON.stringify(report, null, 1));
    await browser.close();
  } finally { try { server.kill(); } catch (e) {} }
})().catch(e => { console.error(e); process.exit(1); });
