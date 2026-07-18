// COGNITION V3 SMOKE — headless verification of the reworked entity mind.
// Injects a fake OpenRouter key and stubs fetch() for openrouter.ai, so the whole
// Gemini/Opus pipeline runs for real inside the game and every payload can be inspected.
// Asserts: delta harness on every Gemini report, registry/delta sections in the system
// prompt, journal accrual, boot orchestrate, trigger-driven reports, reunion nudge,
// HUD live-thought render, zero page errors.
//
//   node bench/smoke-cognition.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function freePort() { return new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); }); }
function waitHttp(url, t = 15000) { return new Promise((res, rej) => { const t0 = Date.now(); (function poll() { const rq = http.get(url, r => { r.resume(); res(); }); rq.on('error', () => Date.now() - t0 > t ? rej(new Error('server down')) : setTimeout(poll, 250)); })(); }); }
function findBrowser() {
  for (const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'])
    if (fs.existsSync(p)) return p;
  throw new Error('no Chrome/Edge found');
}

// Fake-key + AI stub. The stub answers the two schema names the game uses:
// 'interpret' (Gemini) and 'plan' (Opus 4.6 orchestrator).
const INIT = `(() => {
  try { localStorage.setItem('hollowcraft_or_key', 'sk-or-smoke-test'); } catch (e) {}
  window.__aiCalls = [];
  const OF = window.fetch;
  window.fetch = function (url, opts) {
    if (String(url).includes('openrouter.ai')) {
      let req = {}; try { req = JSON.parse(opts.body); } catch (e) {}
      const name = req.response_format && req.response_format.json_schema && req.response_format.json_schema.name;
      let user = req.messages && req.messages[1] && req.messages[1].content;
      if (Array.isArray(user)) user = (user.find(c => c.type === 'text') || {}).text;
      let payload = null; try { payload = JSON.parse(user); } catch (e) {}
      window.__aiCalls.push({ name, sys: (req.messages && req.messages[0] && req.messages[0].content || '').slice(0, 200000), payload, t: performance.now() });
      let out;
      if (name === 'interpret') {
        out = { understanding: 'smoke understanding', player_x: 10, player_z: 10, player_distance: 20, player_confidence: 0.5, player_basis: 'last_seen',
          rec_intent: 'stalk', rec_dest_x: 10, rec_dest_z: 10, rec_dest_label: 'the smoke test pines', rec_why: 'smoke', critical_change: false,
          reasoning: 'SMOKE-THOUGHT ' + window.__aiCalls.length + ': the warm thing drifts and I drift after it.' };
      } else {
        out = { thought: 'SMOKE-PLAN: rest in the dark, then take the night.',
          plan: [ { intent: 'rest', phase: 'day', dest_x: 0, dest_z: 0, dest_label: 'the lair', wait_s: 30, note: 'smoke' },
                  { intent: 'stalk', phase: 'night', dest_x: 20, dest_z: 20, dest_label: 'the treeline', wait_s: 0, note: 'smoke' } ],
          mode_bias: { EXPLORE: 1, REST_DIGEST: 1, STUDY: 1, HUNT_PREY: 1, HUNT_PLAYER: 1, STARVING: 1, TERRORIZE: 1, AMBUSH: 1, FLEE_RETREAT: 1 },
          memory_summary: 'smoke memory', reasoning: 'smoke plan reasoning' };
      }
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return OF.apply(this, arguments);
  };
})();`;

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : '')); };

(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'mp-server.js')], { cwd: ROOT, env: { ...process.env, MP_PORT: String(port), MP_DISC: String(port + 1) }, stdio: 'ignore' });
  const errors = [];
  let browser;
  try {
    await waitHttp('http://127.0.0.1:' + port + '/index.html');
    browser = await chromium.launch({ executablePath: findBrowser(), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 300)));
    await page.goto('http://127.0.0.1:' + port + '/index.html?debug=1&t=630', { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started === true; } catch (e) { return false; } })()`, { timeout: 90000 });
    console.log('game started (night). summoning...');
    await page.evaluate(`(() => { __hc.summon(); __hc.put(12, 12); __hc.look(); })()`);

    await sleep(26000);   // >2 heartbeats + boot council + natural triggers (spotted etc.)

    // manual trigger — a gunshot report must go out near-instantly (re-summon first: it may have
    // despawned/blinked away during the free-run window, which is legitimate behavior)
    await page.evaluate(`(() => { __hc.summon(); __hc.put(12, 12); })()`);
    await page.evaluate(`__hc.stim('gunshot', { x: 5, z: 5, weapon: 'rifle' })`);
    await sleep(2500);

    const calls = await page.evaluate(`window.__aiCalls.map(c => ({ name: c.name, event: c.payload && c.payload.reports ? c.payload.reports[0].event : (c.payload && c.payload.trigger), delta: c.payload && c.payload.reports ? c.payload.reports[0].delta : null, hasJournal: !!(c.payload && c.payload.day_journal), sysHasRegistry: c.sys.includes('CONTEXT REGISTRY'), sysHasDelta: c.sys.includes('DELTA PROTOCOL'), sysHasOrch: c.sys.includes('ORCHESTRATOR') }))`);
    const mind = await page.evaluate(`__hc.mind()`);
    const interp = calls.filter(c => c.name === 'interpret');
    const plans = calls.filter(c => c.name === 'plan');

    check('gemini interpret calls flowing', interp.length >= 2, interp.length + ' calls');
    check('boot orchestrate happened', plans.some(c => c.event === 'boot'), JSON.stringify(plans.map(p => p.event)));
    check('orchestrator payload carries day_journal', plans.every(c => c.hasJournal));
    check('every gemini report delta-annotated', interp.every(c => c.delta && typeof c.delta.seq === 'number'));
    check('delta seq strictly increases', interp.every((c, i) => i === 0 || c.delta.seq > interp[i - 1].delta.seq));
    check('later deltas carry unchanged_n (persistence tracking)', interp.slice(1).some(c => (c.delta.unchanged_n || 0) > 20), JSON.stringify(interp.slice(-1).map(c => c.delta && c.delta.unchanged_n)));
    check('gemini system prompt carries context registry', interp.every(c => c.sysHasRegistry));
    check('gemini system prompt carries delta protocol', interp.every(c => c.sysHasDelta));
    check('opus system prompt is the orchestrator', plans.every(c => c.sysHasOrch));
    check('gunshot trigger produced an instant report', interp.some(c => c.event === 'gunshot'), JSON.stringify(interp.map(c => c.event)));
    check('trigger events beyond heartbeat observed', interp.some(c => c.event && c.event !== 'general'), JSON.stringify([...new Set(interp.map(c => c.event))]));
    check('journal accrues gemini thoughts', mind.journal >= 1, 'journal=' + mind.journal);
    check('stub plan applied with phases', Array.isArray(mind.plan) && mind.plan.length === 2 && mind.plan.every(s => s.p), JSON.stringify(mind.plan));
    check('live thought captured', !!mind.thought && mind.thought.includes('SMOKE-THOUGHT'), String(mind.thought).slice(0, 60));

    const hud = await page.evaluate(`(() => { const d = [...document.querySelectorAll('div')].map(x => x.textContent || '').find(t => t.includes('The Wretch is')); return d ? d.slice(0, 400) : null; })()`);
    check('mind HUD renders top-left panel', !!hud, hud ? hud.slice(0, 80) : 'not found');
    check('HUD shows the live gemini thought', !!hud && hud.includes('SMOKE-THOUGHT'));

    // reunion nudge: pull the wretch far away, look AWAY (a held stare counts as mutual awareness and
    // rightly resets the clock), force the clocks cold, expect a 'reunion' plan call
    await page.evaluate(`(() => { __hc.put(220, 220); __hc.cam({ yaw: 2.5, pitch: 0 }); })()`);
    await sleep(1000);   // let the senses cool before freezing the clocks (a lingering seen-frame would re-stamp mutual awareness)
    await page.evaluate(`__hc.nudge()`);
    await sleep(4000);
    const calls2 = await page.evaluate(`window.__aiCalls.filter(c => c.name === 'plan').map(c => c.payload && c.payload.trigger)`);
    const mind2 = await page.evaluate(`__hc.mind()`);
    check('reunion nudge wakes the orchestrator', calls2.includes('reunion'), JSON.stringify(calls2) + ' lastMutual=' + mind2.lastMutual + ' willLog=' + JSON.stringify(mind2.willLog));

    check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');
    await ctx.close();
  } catch (e) {
    check('smoke run completed', false, String(e.message || e));
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
    try { server.kill(); } catch (e) {}
  }
  const fails = results.filter(r => !r.ok);
  console.log('\n' + (fails.length ? 'FAILED: ' + fails.length + '/' + results.length : 'ALL ' + results.length + ' CHECKS PASS'));
  process.exit(fails.length ? 1 : 0);
})();
