// HOLLOWCRAFT PERFORMANCE BENCHMARK HARNESS
// ------------------------------------------------------------------
// Usage:
//   node bench/run.mjs                      run all scenarios
//   node bench/run.mjs --scenario solo-roam run one scenario
//   node bench/run.mjs --duration 45 --settle 12 --headed
//
// Scenarios: solo-static | solo-night-wretch | solo-roam | mp-2p
//
// What it does:
//   1. Spawns mp-server.js (static file server + WS co-op relay) on a free port.
//   2. Launches installed Chrome (or Edge) via playwright-core. Verifies REAL
//      GPU acceleration via WEBGL_debug_renderer_info; if the renderer string
//      is SwiftShader/software it relaunches HEADED off-screen.
//   3. Injects an init script: independent rAF frame-delta ring buffer,
//      PerformanceObserver(longtask), 1 Hz JS-heap sampler, WebSocket tap
//      (for co-op role detection), and a pointerLockElement spoof so
//      synthetic keydown movement works without a real pointer lock.
//   4. Runs each scenario (settle, then a fixed measurement window), pulls
//      renderer stats from the game's window.__hc.perf() hook.
//   5. Writes bench/results/<timestamp>-<scenario>.json and
//      bench/results/latest-summary.md, and prints the table to stdout.
// ------------------------------------------------------------------
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = path.join(ROOT, 'bench', 'results');
fs.mkdirSync(RESULTS, { recursive: true });

// ---------------- args ----------------
const argv = process.argv.slice(2);
function argVal(name, def) { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; }
const ONLY = argVal('scenario', null);
const MEASURE_S = Number(argVal('duration', 45));
const SETTLE_S = Number(argVal('settle', 12));
const FORCE_HEADED = argv.includes('--headed');
const ALL = ['solo-static', 'solo-night-wretch', 'solo-roam', 'mp-2p'];
const RUN = ONLY ? [ONLY] : ALL;
for (const s of RUN) if (!ALL.includes(s)) { console.error('unknown scenario: ' + s + ' (valid: ' + ALL.join(', ') + ')'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---------------- static+relay server ----------------
function freePort() {
  return new Promise((res, rej) => {
    const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej);
  });
}
function waitHttp(url, timeoutMs = 15000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    (function poll() {
      const rq = http.get(url, r => { r.resume(); res(); });
      rq.on('error', () => { if (Date.now() - t0 > timeoutMs) rej(new Error('server did not come up: ' + url)); else setTimeout(poll, 250); });
    })();
  });
}

// ---------------- GPU probe ----------------
const GL_PROBE = `(() => {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'NO-WEBGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  } catch (e) { return 'ERR:' + e.message; }
})()`;
const isSoftwareGL = s => /swiftshader|llvmpipe|software|basic render/i.test(s || '') || s === 'NO-WEBGL';

// ---------------- in-page instrumentation (init script) ----------------
const INIT_SCRIPT = `(() => {
  window.__benchInfo = 1;   // tell the game loop to accumulate+snapshot renderer.info per frame
  const B = window.__bench = { frames: [], longtasks: [], heap: [], recording: false };
  let last = performance.now();
  function tick(t) {
    if (B.recording) { B.frames.push(t - last); if (B.frames.length > 40000) B.frames.shift(); }
    last = t; requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (B.recording) B.longtasks.push(+e.duration.toFixed(1)); })
      .observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  setInterval(() => { if (B.recording && performance.memory) B.heap.push(performance.memory.usedJSHeapSize); }, 1000);
  B.start = () => { B.frames.length = 0; B.longtasks.length = 0; B.heap.length = 0; last = performance.now(); B.recording = true; };
  B.stop = () => { B.recording = false; };
  // The game gates movement keys on pointer lock (locked = document.pointerLockElement === canvas).
  // Spoof the getter so a synthetic 'pointerlockchange' event flips the game into locked mode headlessly.
  try {
    Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get() { return document.getElementById('c') || null; } });
  } catch (e) {}
  // Tap WebSocket so the driver can confirm the co-op relay connection and host/guest role.
  const OWS = window.WebSocket;
  window.__benchWS = [];
  window.WebSocket = function (...a) {
    const ws = new OWS(...a);
    window.__benchWS.push(ws);
    ws.addEventListener('message', ev => { try { const m = JSON.parse(ev.data); if (m.t === 'welcome') window.__benchWelcome = m; } catch (e) {} });
    return ws;
  };
  window.WebSocket.prototype = OWS.prototype;
  Object.assign(window.WebSocket, OWS);
})();`;

// ---------------- page helpers ----------------
async function openGame(context, base, query, errors) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 200)));
  await page.goto(base + '/index.html?' + query, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started === true; } catch (e) { return false; } })()`, { timeout: 90000 });
  await page.waitForFunction(`(() => { try { return __hc.probe().chunkHere === true; } catch (e) { return false; } })()`, { timeout: 90000 });
  return page;
}
const lockGame = page => page.evaluate(`document.dispatchEvent(new Event('pointerlockchange'))`);
const skipIntro = page => page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }))`);
async function startMovement(page) {
  await page.evaluate(`(() => {
    const kd = c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
    const ku = c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    clearInterval(window.__bmW); clearInterval(window.__bmY); clearInterval(window.__bmJ);
    kd('KeyW');
    window.__bmW = setInterval(() => kd('KeyW'), 700);                       // re-assert against blur clearing keys
    const t0 = performance.now();
    window.__bmY = setInterval(() => { try { __hc.cam({ yaw: (performance.now() - t0) / 1000 * 0.16, pitch: 0 }); } catch (e) {} }, 250);
    window.__bmJ = setInterval(() => { kd('Space'); setTimeout(() => ku('Space'), 250); }, 2500);   // hop over obstacles
  })()`);
}
async function stopMovement(page) {
  await page.evaluate(`(() => {
    clearInterval(window.__bmW); clearInterval(window.__bmY); clearInterval(window.__bmJ);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  })()`).catch(() => {});
}
const getPos = page => page.evaluate(`(() => { try { const d = __hc.drag(); return { x: d.px, z: d.pz }; } catch (e) { return null; } })()`);
const getSt = page => page.evaluate(`(() => { try { return __hc.st(); } catch (e) { return { err: 'st' }; } })()`);

// ---------------- stats ----------------
function pct(sorted, p) { if (!sorted.length) return 0; return sorted[Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length))]; }
function computeStats(frames, longtasks, heap) {
  const n = frames.length;
  const sorted = frames.slice().sort((a, b) => a - b);
  const sum = frames.reduce((a, b) => a + b, 0);
  const mb = b => +(b / 1048576).toFixed(1);
  return {
    frames: n,
    measuredS: +(sum / 1000).toFixed(1),
    avgFps: n ? +(1000 / (sum / n)).toFixed(1) : 0,
    p50ms: +pct(sorted, 50).toFixed(2),
    p95ms: +pct(sorted, 95).toFixed(2),
    p99ms: +pct(sorted, 99).toFixed(2),
    worstFrameMs: n ? +sorted[n - 1].toFixed(1) : 0,
    framesOver16ms: frames.filter(f => f > 16.7).length,
    framesOver25ms: frames.filter(f => f > 25).length,
    longtaskCount: longtasks.length,
    longtaskWorstMs: longtasks.length ? Math.max(...longtasks) : 0,
    heapStartMB: heap.length ? mb(heap[0]) : null,
    heapEndMB: heap.length ? mb(heap[heap.length - 1]) : null,
    heapSlopeMBperMin: heap.length > 5 ? +(((heap[heap.length - 1] - heap[0]) / 1048576) / (heap.length / 60)).toFixed(2) : null,
  };
}
async function measurePage(page, seconds, sampler) {
  await page.evaluate(`__bench.start()`);
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    await sleep(Math.min(5000, seconds * 1000 - (Date.now() - t0)));
    if (sampler) { try { samples.push(await sampler()); } catch (e) {} }
  }
  const raw = await page.evaluate(`(() => { __bench.stop(); return { frames: __bench.frames, longtasks: __bench.longtasks, heap: __bench.heap }; })()`);
  const perf = await page.evaluate(`__hc.perf()`);
  return { raw, perf, samples };
}
function finishResult(scenario, meta, m, extra) {
  const s = computeStats(m.raw.frames, m.raw.longtasks, m.raw.heap);
  return {
    scenario, when: new Date().toISOString(),
    gpuRenderer: meta.gpuRenderer, headlessMode: meta.headlessMode, browser: meta.browser,
    viewport: '1280x720@1', settleS: SETTLE_S, durationS: MEASURE_S,
    ...s,
    drawCalls: m.perf && m.perf.calls != null ? m.perf.calls : null,
    tris: m.perf && m.perf.tris != null ? m.perf.tris : null,
    geoms: m.perf && m.perf.geoms != null ? m.perf.geoms : null,
    textures: m.perf && m.perf.tex != null ? m.perf.tex : null,
    programs: m.perf && m.perf.progs != null ? m.perf.progs : null,
    ...extra,
  };
}
function saveResult(res, ts) {
  const file = path.join(RESULTS, ts + '-' + res.scenario + '.json');
  fs.writeFileSync(file, JSON.stringify(res, null, 2));
  console.log('  saved ' + path.relative(ROOT, file));
}

// ---------------- browser launch with GPU verification ----------------
const COMMON_ARGS = [
  '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  '--mute-audio', '--autoplay-policy=no-user-gesture-required',
];
function findBrowser() {
  const cands = [
    ['chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
    ['chrome', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],
    ['msedge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
    ['msedge', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'],
  ];
  for (const [name, p] of cands) if (fs.existsSync(p)) return { name, path: p };
  throw new Error('no Chrome/Edge executable found');
}
async function launchVerified() {
  const exe = findBrowser();
  async function tryMode(headless) {
    const args = headless ? COMMON_ARGS : COMMON_ARGS.concat(['--window-position=-32000,-32000', '--window-size=1300,780']);
    const browser = await chromium.launch({ executablePath: exe.path, headless, args });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await page.goto('about:blank');
    const renderer = await page.evaluate(GL_PROBE);
    await ctx.close();
    return { browser, renderer };
  }
  if (!FORCE_HEADED) {
    const h = await tryMode(true);
    if (!isSoftwareGL(h.renderer)) return { browser: h.browser, meta: { gpuRenderer: h.renderer, headlessMode: 'headless-new', browser: exe.name } };
    console.log('headless GPU is software (' + h.renderer + ') — relaunching headed off-screen');
    await h.browser.close();
  }
  const v = await tryMode(false);
  if (isSoftwareGL(v.renderer)) console.warn('WARNING: headed mode is ALSO software-rendered: ' + v.renderer);
  return { browser: v.browser, meta: { gpuRenderer: v.renderer, headlessMode: 'headed-offscreen', browser: exe.name } };
}

// ---------------- scenarios ----------------
const T_DAY = 252, T_NIGHT = 630;   // worldTime pins (DAY_LEN=840): morning / deep night — fixed for repeatability
async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(INIT_SCRIPT);
  return ctx;
}

async function scnSoloStatic(browser, base, meta) {
  const errors = [];
  const ctx = await newCtx(browser);
  const page = await openGame(ctx, base, 'debug=1&t=' + T_DAY, errors);
  await page.evaluate(`__hc.cam({ yaw: 0, pitch: 0 })`);
  await sleep(SETTLE_S * 1000);
  const gpu = await page.evaluate(GL_PROBE);
  const m = await measurePage(page, MEASURE_S);
  const res = finishResult('solo-static', { ...meta, gpuRenderer: gpu }, m, { pageErrors: errors.slice(0, 5) });
  await ctx.close();
  return [res];
}

async function scnSoloNightWretch(browser, base, meta) {
  const errors = [];
  const ctx = await newCtx(browser);
  const page = await openGame(ctx, base, 'debug=1&t=' + T_NIGHT, errors);
  await page.evaluate(`(() => { __hc.summon(); __hc.put(8, 8); __hc.look(); })()`);
  await sleep(SETTLE_S * 1000);
  await page.evaluate(`__hc.look()`);
  const gpu = await page.evaluate(GL_PROBE);
  const states = [];
  const m = await measurePage(page, MEASURE_S, async () => { const s = await getSt(page); states.push(s.ws + (s.grabbed ? '/GRABBED' : '')); return s; });
  const grab = m.samples.some(s => s && s.grabbed);
  const res = finishResult('solo-night-wretch', { ...meta, gpuRenderer: gpu }, m,
    { wretchStates: states, grabOccurred: grab, pageErrors: errors.slice(0, 5) });
  await ctx.close();
  return [res];
}

async function scnSoloRoam(browser, base, meta) {
  const errors = [];
  const ctx = await newCtx(browser);
  const page = await openGame(ctx, base, 'debug=1&t=' + T_DAY, errors);
  await lockGame(page);
  await startMovement(page);
  await sleep(SETTLE_S * 1000);
  const gpu = await page.evaluate(GL_PROBE);
  const p0 = await getPos(page);
  const m = await measurePage(page, MEASURE_S);
  const p1 = await getPos(page);
  await stopMovement(page);
  const dist = p0 && p1 ? +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1) : null;
  const res = finishResult('solo-roam', { ...meta, gpuRenderer: gpu }, m,
    { blocksTravelled: dist, movementValid: dist != null && dist > 20, pageErrors: errors.slice(0, 5) });
  await ctx.close();
  return [res];
}

async function scnMp2p(browser, base, meta) {
  const errA = [], errB = [];
  const ctxA = await newCtx(browser), ctxB = await newCtx(browser);
  // First page to reach the relay is designated HOST by mp-server.js; client-side 'join' mode
  // with no room code connects same-origin, so both pages use ?join.
  const q = 'join&debug=1&t=' + T_DAY;
  const pageA = await openGame(ctxA, base, q, errA);
  await pageA.waitForFunction(`(window.__benchWS || []).some(w => w.readyState === 1)`, { timeout: 30000 });
  for (let i = 0; i < 6; i++) { await skipIntro(pageA); await sleep(400); }   // fast-forward the wake cinematic startGame() triggers
  const pageB = await openGame(ctxB, base, q, errB);
  await pageB.waitForFunction(`(window.__benchWS || []).some(w => w.readyState === 1)`, { timeout: 30000 });
  for (let i = 0; i < 6; i++) { await skipIntro(pageB); await sleep(400); }
  const roleA = await pageA.evaluate(`window.__benchWelcome ? (window.__benchWelcome.host ? 'host' : 'guest') : 'unknown'`);
  const roleB = await pageB.evaluate(`window.__benchWelcome ? (window.__benchWelcome.host ? 'host' : 'guest') : 'unknown'`);
  console.log('  co-op roles: A=' + roleA + ' B=' + roleB);
  for (const p of [pageA, pageB]) { await lockGame(p); await startMovement(p); }
  await sleep(SETTLE_S * 1000);
  const gpuA = await pageA.evaluate(GL_PROBE), gpuB = await pageB.evaluate(GL_PROBE);
  const [mA, mB] = await Promise.all([measurePage(pageA, MEASURE_S), measurePage(pageB, MEASURE_S)]);
  const posA = await getPos(pageA), posB = await getPos(pageB);
  await stopMovement(pageA); await stopMovement(pageB);
  const resA = finishResult('mp-2p-' + (roleA === 'guest' ? 'guest' : 'host'), { ...meta, gpuRenderer: gpuA }, mA,
    { role: roleA, peerPos: posB, pageErrors: errA.slice(0, 5) });
  const resB = finishResult('mp-2p-' + (roleB === 'host' ? 'host' : 'guest'), { ...meta, gpuRenderer: gpuB }, mB,
    { role: roleB, peerPos: posA, pageErrors: errB.slice(0, 5) });
  await ctxA.close(); await ctxB.close();
  return [resA, resB];
}

// ---------------- summary ----------------
const COLS = [
  ['scenario', r => r.scenario], ['avgFps', r => r.avgFps], ['p50ms', r => r.p50ms], ['p95ms', r => r.p95ms],
  ['p99ms', r => r.p99ms], ['worst', r => r.worstFrameMs], ['>16.7ms', r => r.framesOver16ms], ['>25ms', r => r.framesOver25ms],
  ['longtasks', r => r.longtaskCount], ['ltWorst', r => r.longtaskWorstMs], ['heap MB', r => r.heapStartMB + '->' + r.heapEndMB],
  ['draws', r => r.drawCalls], ['tris', r => r.tris != null ? Math.round(r.tris / 1000) + 'k' : '?'], ['geoms', r => r.geoms],
];
function summaryTable(results) {
  const rows = [COLS.map(c => c[0])].concat(results.map(r => COLS.map(c => String(c[1](r)))));
  const w = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
  return rows.map((r, ri) => r.map((c, i) => c.padEnd(w[i])).join('  ') + (ri === 0 ? '\n' + w.map(x => '-'.repeat(x)).join('  ') : '')).join('\n');
}
function summaryMd(results, meta) {
  const head = '| ' + COLS.map(c => c[0]).join(' | ') + ' |';
  const sep = '|' + COLS.map(() => '---').join('|') + '|';
  const body = results.map(r => '| ' + COLS.map(c => String(c[1](r))).join(' | ') + ' |').join('\n');
  return '# Hollowcraft bench — ' + new Date().toISOString() + '\n\n'
    + 'GPU: `' + meta.gpuRenderer + '`  \nMode: ' + meta.headlessMode + ' (' + meta.browser + ')  \n'
    + 'Viewport 1280x720 dpr1, settle ' + SETTLE_S + 's, measure ' + MEASURE_S + 's per scenario.\n\n'
    + head + '\n' + sep + '\n' + body + '\n';
}

// ---------------- main ----------------
(async () => {
  const ts = stamp();
  const port = await freePort();
  console.log('starting mp-server on :' + port);
  const server = spawn(process.execPath, [path.join(ROOT, 'mp-server.js')], {
    cwd: ROOT, env: { ...process.env, MP_PORT: String(port), MP_DISC: String(port + 1) }, stdio: 'ignore',
  });
  const base = 'http://127.0.0.1:' + port;
  try {
    await waitHttp(base + '/index.html');
    const { browser, meta } = await launchVerified();
    console.log('browser: ' + meta.browser + ' | mode: ' + meta.headlessMode + ' | GPU: ' + meta.gpuRenderer);
    const results = [];
    const runners = { 'solo-static': scnSoloStatic, 'solo-night-wretch': scnSoloNightWretch, 'solo-roam': scnSoloRoam, 'mp-2p': scnMp2p };
    for (const name of RUN) {
      console.log('\n=== ' + name + ' (settle ' + SETTLE_S + 's + measure ' + MEASURE_S + 's) ===');
      try {
        const out = await runners[name](browser, base, meta);
        for (const r of out) { results.push(r); saveResult(r, ts); }
      } catch (e) {
        console.error('  SCENARIO FAILED: ' + (e.message || e));
        const r = { scenario: name, error: String(e.message || e), when: new Date().toISOString(), ...meta };
        results.push(r); saveResult(r, ts);
      }
    }
    await browser.close();
    const ok = results.filter(r => !r.error);
    if (ok.length) {
      const md = summaryMd(ok, meta);
      fs.writeFileSync(path.join(RESULTS, 'latest-summary.md'), md);
      console.log('\n' + summaryTable(ok));
      console.log('\nGPU: ' + meta.gpuRenderer + '  |  mode: ' + meta.headlessMode);
      console.log('summary: bench/results/latest-summary.md');
    }
    const failed = results.filter(r => r.error);
    if (failed.length) console.log('failed scenarios: ' + failed.map(r => r.scenario).join(', '));
  } finally {
    try { server.kill(); } catch (e) {}
  }
})().catch(e => { console.error(e); process.exit(1); });
