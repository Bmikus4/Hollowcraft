// EVERY WAY A PLAYER CAN START THE GAME, driven the way a player drives it.
//
// Ben, 08-11: "it never loads, it gets stuck without fading on the main menu image and never loads
// the game." bench/tmp-playpath.mjs covered exactly one entry point (mb-solo) and it passed, so the
// entry point Ben most likely used - mb-continue, because he has a saved world - had never been run
// by anything. Neither had mb-host or mb-creative-btn.
//
// WHAT THIS WATCHES, and why these three fields and not the wall clock. startGame sets _playAt, and
// _playAt is the ONLY arming signal in the boot: the release block in loop() is guarded on it, and so
// is the watchdog that is supposed to rescue a stuck session. If a throw lands between `started=true`
// and the _playAt line - _sigilShow() and requestLock() both sit in that window with no try/catch -
// then nothing sets it and nothing rescues it, which is the shape of a permanent hang. So:
//   armed     - did _playAt get set at all (did startGame reach its own middle)
//   faded     - did #loadblack get the 'go' class (the blackout Ben says never started)
//   loaded    - did the gate release
// A run that is armed:false is a different bug from one that is armed:true and never releases, and
// the wall clock cannot tell them apart.
//
// The save is REAL, not synthesised: phase 0 plays mb-solo, calls saveGame(), and hands that exact
// localStorage payload to the entry points that read one. A hand-written save would test a parser
// against a file no player has.
//
//   node bench/assert-play-entrypoints.mjs                    all four entries, unthrottled
//   node bench/assert-play-entrypoints.mjs --cpu=6            all four, 6x CPU throttle (a slow machine)
//   node bench/assert-play-entrypoints.mjs --entries=mb-continue
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };

const PORT = +(process.env.HC_PORT || 8123), BASE = 'http://127.0.0.1:' + PORT;
const CPU = +arg('cpu', 1);
const BUDGET_MS = +arg('budget', 90000);
const ENTRIES = arg('entries', 'mb-solo,mb-continue,mb-creative-btn,mb-host').split(',').filter(Boolean);
// THE TWO STICKY SETTINGS, which is why they are set through localStorage and not through ?rd=.
// Both are restored from storage at module init on every boot, so a player who once moved the slider
// carries that value into every session forever - and no bench has ever set either. rd is the one
// that matters: the boot default is 6 (169 chunks) and the ceiling the adaptive system climbs to is
// 12 (625 chunks), and the loading gate has to mesh into whatever it finds.
const RD = arg('rd', '');
const QUALITY = arg('quality', '');
const NEEDS_SAVE = new Set(['mb-continue', 'mb-host']);   // the two that call readSave()

function findBrowser() {
  const c = [process.env.HC_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for (const p of c) if (fs.existsSync(p)) return p;
  return undefined;
}
const waitHttp = u => new Promise((res, rej) => { let n = 0; const t = setInterval(() => {
  http.get(u, r => { r.destroy(); clearInterval(t); res(); }).on('error', () => { if (++n > 200) { clearInterval(t); rej(new Error('no server')); } }); }, 500); });

// One page-side probe, used by every phase. Everything it reads is either DOM or __hc: CFG, _playAt
// and friends are module-scope and naming them here throws a ReferenceError a try/catch would eat.
const PROBE = `(()=>{ try{
  const ls = (window.__hc && __hc.loadState) ? __hc.loadState() : {no__hc:true};
  const bk = document.getElementById('loadblack');
  const ld = document.getElementById('load');
  const cs = e => e ? getComputedStyle(e) : null;
  const b = cs(bk), l = cs(ld);
  return { armed: !!ls.playAt, playAt: ls.playAt|0, heldMs: ls.heldMs|0, circleDone: !!ls.circleDone,
           watchdog: !!ls.watchdog, started: !!ls.started, initialReady: !!ls.initialReady,
           faded: !!(bk && bk.className||'').includes('go'),
           blackOp: b ? +(+b.opacity).toFixed(2) : null,
           loadDisp: l ? l.display : 'MISSING',
           err: (document.getElementById('err')||{}).textContent || '' };
}catch(e){ return { probeErr: String(e.message||e) }; } })()`;

async function run(entry, saveJson) {
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true,
    args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + String(e.message || e).slice(0, 200)));
  page.on('console', m => { const t = m.text(); if (/resume failed|ERROR: \d|GL_INVALID|uncaught/i.test(t)) errs.push('CONSOLE ' + t.slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url().replace(BASE, '')); });

  if (saveJson) await page.addInitScript(`try{ localStorage.setItem('hollowcraft_save', ${JSON.stringify(saveJson)}); }catch(e){}`);
  if (RD) await page.addInitScript(`try{ localStorage.setItem('hollowcraft_rd', ${JSON.stringify(RD)}); }catch(e){}`);
  if (QUALITY) await page.addInitScript(`try{ localStorage.setItem('hollowcraft_q', ${JSON.stringify(QUALITY)}); }catch(e){}`);

  // Throttle AFTER the page exists but BEFORE navigation, so parsing and boot pay it too - that is
  // what a slow machine actually experiences, and ee268ba was found this way.
  if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }

  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 180000 });
  await sleep(CPU > 1 ? 9000 : 4000);   // let the menu build

  const present = await page.evaluate(`(()=>{ const e=document.getElementById(${JSON.stringify(entry)});
    return e ? getComputedStyle(e).display : 'MISSING'; })()`);
  if (present === 'MISSING') { await browser.close(); return { entry, skip: 'button MISSING' }; }

  const t0 = Date.now();
  await page.evaluate(`document.getElementById(${JSON.stringify(entry)}).click()`);

  let armedAt = null, fadedAt = null, last = '', s = {};
  while (Date.now() - t0 < BUDGET_MS) {
    await sleep(1000);
    s = await page.evaluate(PROBE);
    if (s.armed && armedAt === null) armedAt = Date.now() - t0;
    if (s.faded && fadedAt === null) fadedAt = Date.now() - t0;
    const line = `armed=${s.armed} faded=${s.faded} blackOp=${s.blackOp} circleDone=${s.circleDone} load=${s.loadDisp}`;
    if (line !== last) { console.log(`    +${((Date.now() - t0) / 1000).toFixed(0)}s  ${line}`); last = line; }
    if (s.circleDone && s.loadDisp === 'none') break;
  }
  const ms = Date.now() - t0;
  await page.screenshot({ path: path.join(ROOT, `bench/results/entry-${entry}-cpu${CPU}-rd${RD || 'def'}.png`) });
  await browser.close();
  return { entry, armedAt, fadedAt, loaded: !!(s.circleDone && s.loadDisp === 'none'), ms,
           watchdog: s.watchdog, err: s.err, errs: [...new Set(errs)].slice(0, 6) };
}

(async () => {
  await waitHttp(BASE + '/index.html');
  fs.mkdirSync(path.join(ROOT, 'bench/results'), { recursive: true });
  console.log(`  entry points: ${ENTRIES.join(', ')}   cpu throttle: ${CPU}x   rd: ${RD || 'default(6)'}   quality: ${QUALITY || 'default'}   budget: ${BUDGET_MS / 1000}s`);

  // ---- phase 0: mint a real save, but only if something in this run needs one.
  let saveJson = null;
  const seedPath = path.join(ROOT, 'bench/results/save-seed.json');
  if (ENTRIES.some(e => NEEDS_SAVE.has(e))) {
    if (fs.existsSync(seedPath)) { saveJson = fs.readFileSync(seedPath, 'utf8'); console.log('  save: reusing bench/results/save-seed.json'); }
    else {
      console.log('  save: minting one by playing mb-solo and calling saveGame()...');
      const browser = await chromium.launch({ executablePath: findBrowser(), headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
      await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 180000 });
      await sleep(4000);
      await page.evaluate(`document.getElementById('mb-solo').click()`);
      for (let i = 0; i < 60; i++) { await sleep(1000); const s = await page.evaluate(PROBE); if (s.circleDone && s.loadDisp === 'none') break; }
      saveJson = await page.evaluate(`(()=>{ try{ if(typeof __hc!=='undefined' && __hc.save) __hc.save(); }catch(e){}
        try{ return localStorage.getItem('hollowcraft_save'); }catch(e){ return null; } })()`);
      await browser.close();
      if (saveJson) { fs.writeFileSync(seedPath, saveJson); console.log(`  save: minted, ${(saveJson.length / 1024).toFixed(1)} KB`); }
      else console.log('  save: COULD NOT MINT - the save-reading entries below run with no save (they will bounce back to the menu)');
    }
  }

  // ---- one entry point at a time. Parallel runs contend for the GPU and produce false reds.
  const rows = [];
  for (const e of ENTRIES) { console.log(`\n  == ${e}`); rows.push(await run(e, NEEDS_SAVE.has(e) ? saveJson : null)); }

  console.log(`\n  entry            armed@   faded@   loaded    total   notes`);
  for (const r of rows) {
    if (r.skip) { console.log(`  ${r.entry.padEnd(16)} ${r.skip}`); continue; }
    const n = [r.watchdog ? 'WATCHDOG' : '', r.err ? 'err:' + r.err.slice(0, 40) : '', ...(r.errs || [])].filter(Boolean).join(' | ');
    console.log(`  ${r.entry.padEnd(16)} ${String(r.armedAt ?? 'NEVER').padStart(6)}  ${String(r.fadedAt ?? 'NEVER').padStart(6)}  ${String(r.loaded).padEnd(7)} ${String(r.ms).padStart(6)}   ${n}`);
  }
  const bad = rows.filter(r => !r.skip && !r.loaded);
  console.log(bad.length ? `\n  FAIL ${bad.length}/${rows.length}: ${bad.map(r => r.entry).join(', ')}` : `\n  PASS ${rows.length}/${rows.length}`);
})();
