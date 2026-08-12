// Ben's 2026-08-12 inventory spec, measured: the five at the top, the grid growing out of them under a gold line, no
// clothing slots anywhere, the body bottom-left, crafting behind a button.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft';
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
// THE REAL START PATH, NOT ?debug=1. updateBars hides the whole HUD while `!_circleDone`, and the debug auto-start
// never runs the loading circle — so under ?debug=1 #hud is visibility:hidden for the session. Geometry still reads
// correctly off a hidden element, which is exactly why it went unnoticed; a click does not.
await page.goto(base + '/index.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.click('#mb-solo');
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.loadState().circleDone===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForTimeout(3000);
const hudVisible = await page.evaluate(() => getComputedStyle(document.getElementById('hud')).visibility);

const shut = await page.evaluate(() => {
  const R = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const hb = document.getElementById('hotbar'), cmp = document.getElementById('compass');
  const cells = [...hb.querySelectorAll('.slot')].filter(d => !d.closest('#offslot'));
  return { hb: R(hb), cmp: cmp ? R(cmp) : null, n: cells.length, cell: R(cells[0]),
           nums: cells.map(c => c.querySelector('.num').textContent).join(''), vh: innerHeight, vw: innerWidth };
});

// THE SIZE THAT CAUGHT IT. --uiz is min(w/1280,h/720) clamped to [1,1.9], so 1280x720 is the ONE viewport where a
// zoomed copy of the bar and the real bar agree. Every geometry claim here is re-checked at 1920x1080, where uiz=1.5.
const atSize = async (w, h) => {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(900);
  return page.evaluate(async () => {
    const R = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const q = s => document.querySelector(s);
    __hc.openInv(); await new Promise(r => setTimeout(r, 600));
    const cell = q('#hotbar > .slot');
    const out = { uiz: getComputedStyle(document.documentElement).getPropertyValue('--uiz').trim(),
      bar: R(q('#hotbar')), cell: R(cell), rule: R(q('#invrule')), grid: R(q('#gridinv')),
      barDisplay: getComputedStyle(q('#hotbar')).display, pe: getComputedStyle(q('#hotbar')).pointerEvents,
      copies: document.querySelectorAll('#ihot').length };
    __hc.eqUI('close'); await new Promise(r => setTimeout(r, 400));
    out.barShut = R(q('#hotbar')); out.cellShut = R(q('#hotbar > .slot'));
    return out; });
};
const at720 = await atSize(1280, 720);
const at1080 = await atSize(1920, 1080);
await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(800);

const open = await page.evaluate(async () => {
  const R = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  __hc.openInv(); await new Promise(r => setTimeout(r, 600));
  const prim = qa('#primaries .islot'), carry = qa('#carrycol .islot');
  const armorCells = qa('#invui [data-src="armor"]');
  const out = { ihot: R(q('#hotbar')), cell: R(q('#hotbar > .slot')), n: qa('#hotbar > .slot').length,
    rule: R(q('#invrule')), grid: R(q('#gridinv')), prim: prim.map(R), primN: prim.length,
    carry: carry.map(R), carryN: carry.length, pv: R(q('#pview')), bands: qa('.pvband').length,
    armorCells: armorCells.length, armorIdx: armorCells.map(d => d.dataset.idx).join(','),
    panelBorder: getComputedStyle(q('#invui>.panel')).borderTopWidth,
    hudHidden: getComputedStyle(q('#hotbar')).display, craftbtn: R(q('#craftbtn')),
    popShut: getComputedStyle(q('#craftpop')).display, vw: innerWidth, vh: innerHeight };
  q('#craftbtn').click(); await new Promise(r => setTimeout(r, 200));
  out.popOpen = getComputedStyle(q('#craftpop')).display;
  q('#craftx').click(); await new Promise(r => setTimeout(r, 200));
  out.popClosed = getComputedStyle(q('#craftpop')).display;
  __hc.eqUI('close'); await new Promise(r => setTimeout(r, 400));
  out.hudBack = getComputedStyle(q('#hotbar')).display; out.hbAfter = R(q('#hotbar'));
  return out;
});

// A REAL CLICK on a HUD cell with the inventory open. pointer-events alone is not enough — the modal dim is z-index 12
// over a z-index 5 HUD — and only a real click through the browser proves the sheet is not swallowing it.
const click = await (async () => {
  const put = await page.evaluate(async () => { __hc.openInv(); await new Promise(r => setTimeout(r, 500));
    __hc.qSet('inv', 4, 'iron_ingot', 3); __hc.qSet('inv', 5, null);
    const b = document.querySelectorAll('#hotbar > .slot')[2].getBoundingClientRect();   // slot index 4 = third of the five
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, before: JSON.stringify(__hc.qGet('inv', 4)) }; });
  await page.mouse.click(put.x, put.y); await page.waitForTimeout(300);
  const after = await page.evaluate(p => { const e = document.elementFromPoint(p.x, p.y);
    return { slot: JSON.stringify(__hc.qGet('inv', 4)),
             hit: e ? (e.id || e.className) + ' in ' + (e.parentElement ? (e.parentElement.id || e.parentElement.className) : '-') : 'none',
             uiZ: getComputedStyle(document.getElementById('ui')).zIndex,
             cls: document.body.className }; }, { x: put.x, y: put.y });
  await page.evaluate(async () => { __hc.eqUI('close'); await new Promise(r => setTimeout(r, 300)); });
  return { ...put, ...after };
})();

const fade = await page.evaluate(async () => {
  const R = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const hb = document.getElementById('hotbar'), hl = document.getElementById('hotleft');
  const op = e => +getComputedStyle(e).opacity, sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = { left: R(hl), bar: R(hb), leftCells: hl.querySelectorAll('.slot').length, barCells: hb.querySelectorAll('.slot').length };
  __hc.giveItem('stick', 1); await sleep(700); out.awake = op(hb); out.awakeL = op(hl);
  await sleep(5000); out.idle = op(hb); out.idleL = op(hl);
  // An item change only wakes the group it LANDS in, and invAdd tops up an existing stack anywhere before it fills an
  // empty cell — so this clears a bar slot AND gives an id the player is not already carrying.
  // Write into one of the FIVE and let the next paint notice. giveItem cannot be aimed: invAdd fills the first empty
  // slot from zero, and slots 0-1 are the primaries, so a plain give often lands in the other group entirely.
  __hc.qSet('inv', 5, 'iron_ingot', 1); await sleep(150);
  out.gave = JSON.stringify(__hc.giveItem('stick', 1)); await sleep(700);
  out.woke = op(hb); out.wokeL = op(hl);
  out.slot6 = JSON.stringify(__hc.qGet('inv', 5));
  // Ben's case: both down, then swap primaries only. The five must stay down.
  await sleep(5000);
  out.bothDown = [op(hb), op(hl)];
  __hc.sel(0); await sleep(300); __hc.sel(1); await sleep(600);
  out.afterPrimSwap = { bar: op(hb), left: op(hl) };
  await sleep(5000); __hc.sel(4); await sleep(600);
  out.afterGeneralPick = { bar: op(hb), left: op(hl) };
  out.barAfter = R(hb);
  return out;
});

let pass = 0, fail = 0;
const t = (name, ok, got) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '   ' + got); };
const near = (a, c, tol = 2) => Math.abs(a - c) <= tol;
// --- the bar, inventory shut
t('the HUD is actually visible', hudVisible === 'visible', 'visibility=' + hudVisible);
t('bar sits in the top third', shut.hb.y < shut.vh / 3, 'top=' + shut.hb.y.toFixed(0));
t('the nav ribbon is at the bottom', shut.cmp && shut.cmp.y > shut.vh * 0.8, 'cmp.top=' + (shut.cmp ? shut.cmp.y.toFixed(0) : '-') + ' vh=' + shut.vh);
t('nothing shares the bar row', shut.cmp && shut.cmp.y > shut.hb.b, 'hb.bottom=' + shut.hb.b.toFixed(0) + ' cmp.top=' + (shut.cmp ? shut.cmp.y.toFixed(0) : '-'));
t('five cells in the bar, keyed 3-7', shut.n === 5 && shut.nums === '34567', 'n=' + shut.n + ' nums=' + shut.nums);
t('two primaries left of the bar', fade.leftCells === 3 && fade.left.r <= fade.bar.x - 8,
  'left cells(incl offhand)=' + fade.leftCells + ' left.right=' + fade.left.r.toFixed(0) + ' bar.left=' + fade.bar.x.toFixed(0));
t('the primaries share the bar row', near(fade.left.y, fade.bar.y, 2), 'left.y=' + fade.left.y.toFixed(0) + ' bar.y=' + fade.bar.y.toFixed(0));
t('the five never move', near(fade.barAfter.x, fade.bar.x, 1) && near(fade.barAfter.w, fade.bar.w, 1),
  'before=' + fade.bar.x.toFixed(0) + '/' + fade.bar.w.toFixed(0) + ' after=' + fade.barAfter.x.toFixed(0) + '/' + fade.barAfter.w.toFixed(0));
// --- the bar, inventory open: same pixels
// --- the bar IS the inventory's row, at every window size
for (const [label, m] of [['720p', at720], ['1080p (uiz ' + at1080.uiz + ')', at1080]]) {
  t(label + ': there is only one row of five', m.copies === 0 && m.barDisplay !== 'none', 'copies=' + m.copies + ' display=' + m.barDisplay);
  t(label + ': the bar does not move or resize when the inventory opens',
    near(m.bar.x, m.barShut.x, 0.5) && near(m.bar.w, m.barShut.w, 0.5) && near(m.cell.w, m.cellShut.w, 0.5),
    'open=' + m.bar.x.toFixed(0) + '/' + m.bar.w.toFixed(0) + ' cell=' + m.cell.w.toFixed(1) +
    '  shut=' + m.barShut.x.toFixed(0) + '/' + m.barShut.w.toFixed(0) + ' cell=' + m.cellShut.w.toFixed(1));
  t(label + ': the bar takes clicks while open', m.pe === 'auto', 'pointer-events=' + m.pe);
  t(label + ': the grid is centred on the bar', Math.abs((m.bar.x + m.bar.w / 2) - (m.grid.x + m.grid.w / 2)) <= 0.5,
    'bar mid=' + (m.bar.x + m.bar.w / 2).toFixed(1) + ' grid mid=' + (m.grid.x + m.grid.w / 2).toFixed(1));
  t(label + ': the grid hangs off the bar, not through it', m.rule.y >= m.bar.b - 0.5 && m.grid.y >= m.rule.b - 0.5,
    'bar.b=' + m.bar.b.toFixed(0) + ' rule=' + m.rule.y.toFixed(0) + '-' + m.rule.b.toFixed(0) + ' grid.y=' + m.grid.y.toFixed(0));
  t(label + ': one scale for both — cell and grid cell agree', near(m.cell.w, 50, 0.5) && near(m.grid.w / 8, 44, 0.5),
    'bar cell=' + m.cell.w.toFixed(1) + ' grid cell=' + (m.grid.w / 8).toFixed(1));
}
// --- the gold line and the grid below it
t('the line sits between the bar and the grid', open.rule.y >= open.ihot.b - 1 && open.rule.b <= open.grid.y + 1,
  'ihot.b=' + open.ihot.b.toFixed(0) + ' rule=' + open.rule.y.toFixed(0) + '-' + open.rule.b.toFixed(0) + ' grid=' + open.grid.y.toFixed(0));
t('the line is thin', open.rule.h <= 10 && open.rule.h > 0, 'h=' + open.rule.h.toFixed(1));
t('the grid is exactly under the bar', Math.abs((open.ihot.x + open.ihot.w / 2) - (open.grid.x + open.grid.w / 2)) <= 0.5,
  'bar mid=' + (open.ihot.x + open.ihot.w / 2).toFixed(1) + ' grid mid=' + (open.grid.x + open.grid.w / 2).toFixed(1));
// --- no clothing slots
t('no clothing slots anywhere', open.armorCells === 2, 'armor cells=' + open.armorCells + ' idx=' + open.armorIdx);
t('the two spec slots are the ones left', open.armorIdx === '4,5', 'idx=' + open.armorIdx);
t('four body bands take clothing off instead', open.bands === 4, 'bands=' + open.bands);
// --- the body cluster
t('the body is bottom left', open.pv.x < open.vw / 3 && open.pv.b > open.vh / 2, 'pv=' + open.pv.x.toFixed(0) + ',' + open.pv.b.toFixed(0));
t('two primaries, stacked', open.primN === 2 && near(open.prim[0].x, open.prim[1].x, 1) && open.prim[1].y > open.prim[0].b - 1,
  'x=' + open.prim.map(p => p.x.toFixed(0)) + ' y=' + open.prim.map(p => p.y.toFixed(0)));
t('primaries are horizontal rectangles', open.prim[0].w > open.prim[0].h * 1.6, open.prim[0].w.toFixed(0) + 'x' + open.prim[0].h.toFixed(0));
t('primaries sit below the model', open.prim[0].y >= open.pv.b - 2, 'prim.y=' + open.prim[0].y.toFixed(0) + ' pv.b=' + open.pv.b.toFixed(0));
t('spec slots are directly right of them', open.carryN === 2 && open.carry[0].x >= open.prim[0].r - 2,
  'carry.x=' + open.carry.map(c => c.x.toFixed(0)) + ' prim.right=' + open.prim[0].r.toFixed(0));
// --- crafting + the border
t('a real click on a bar cell picks the stack up', click.before !== 'null' && click.slot === 'null',
  'before=' + click.before + ' after=' + click.slot + ' at=' + click.x.toFixed(0) + ',' + click.y.toFixed(0) +
  ' hit=' + click.hit + ' uiZ=' + click.uiZ + ' body=' + click.cls);
t('no border around the inventory', open.panelBorder === '0px', 'border=' + open.panelBorder);
t('crafting is a button in the top right', open.craftbtn.x > open.vw * 0.7 && open.craftbtn.y < open.vh * 0.2,
  'btn=' + open.craftbtn.x.toFixed(0) + ',' + open.craftbtn.y.toFixed(0));
t('crafting is hidden until pressed', open.popShut === 'none' && open.popOpen !== 'none', 'shut=' + open.popShut + ' open=' + open.popOpen);
t('the X closes it', open.popClosed === 'none', 'display=' + open.popClosed);
// --- the idle fade
t('bar is up when just used', fade.awake > 0.95, 'opacity=' + fade.awake);
t('bar fades after a beat idle', fade.idle < 0.05, 'opacity=' + fade.idle);
t('and comes back when an item lands in it', fade.woke > 0.95,
  'opacity=' + fade.woke + ' slot6=' + fade.slot6);
t('both groups go down on their own', fade.bothDown[0] < 0.05 && fade.bothDown[1] < 0.05, 'bar/left=' + fade.bothDown);
t('swapping primaries does NOT raise the five', fade.afterPrimSwap.bar < 0.05 && fade.afterPrimSwap.left > 0.95,
  'bar=' + fade.afterPrimSwap.bar + ' left=' + fade.afterPrimSwap.left);
t('selecting a general slot raises the five', fade.afterGeneralPick.bar > 0.95, 'bar=' + fade.afterGeneralPick.bar);
t('no page errors', errs.length === 0, errs.join(' | '));
console.log(pass + '/' + (pass + fail));
await b.close(); server.kill();
process.exit(fail ? 1 : 0);
