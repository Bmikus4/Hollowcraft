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
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForTimeout(4000);

const shut = await page.evaluate(() => {
  const R = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const hb = document.getElementById('hotbar'), cmp = document.getElementById('compass');
  const cells = [...hb.querySelectorAll('.slot')].filter(d => !d.closest('#offslot'));
  return { hb: R(hb), cmp: cmp ? R(cmp) : null, n: cells.length, cell: R(cells[0]),
           nums: cells.map(c => c.querySelector('.num').textContent).join(''), vh: innerHeight, vw: innerWidth };
});

const open = await page.evaluate(async () => {
  const R = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  __hc.openInv(); await new Promise(r => setTimeout(r, 600));
  const prim = qa('#primaries .islot'), carry = qa('#carrycol .islot');
  const armorCells = qa('#invui [data-src="armor"]');
  const out = { ihot: R(q('#ihot')), cell: R(qa('#ihot .islot')[0]), n: qa('#ihot .islot').length,
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

const fade = await page.evaluate(async () => {
  const hb = document.getElementById('hotbar'); const op = () => +getComputedStyle(hb).opacity;
  __hc.giveItem('stick', 1); await new Promise(r => setTimeout(r, 700)); const awake = op();
  await new Promise(r => setTimeout(r, 5000)); const idle = op();
  __hc.giveItem('stick', 1); await new Promise(r => setTimeout(r, 700));
  return { awake, idle, woke: op() };
});

let pass = 0, fail = 0;
const t = (name, ok, got) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '   ' + got); };
const near = (a, c, tol = 2) => Math.abs(a - c) <= tol;
// --- the bar, inventory shut
t('bar sits in the top third', shut.hb.y < shut.vh / 3, 'top=' + shut.hb.y.toFixed(0));
t('bar clears the compass ribbon', shut.cmp && shut.hb.y >= shut.cmp.b, 'hb=' + shut.hb.y.toFixed(0) + ' cmp.bottom=' + (shut.cmp ? shut.cmp.b.toFixed(0) : '-'));
t('five cells, keyed 3-7', shut.n === 5 && shut.nums === '34567', 'n=' + shut.n + ' nums=' + shut.nums);
// --- the bar, inventory open: same pixels
t('the open bar stands on the shut bar', near(open.ihot.y, shut.hb.y, 3) && near(open.ihot.x, shut.hb.x, 3) && near(open.ihot.w, shut.hb.w, 3),
  'open=' + [open.ihot.x, open.ihot.y, open.ihot.w].map(n => n.toFixed(0)) + ' shut=' + [shut.hb.x, shut.hb.y, shut.hb.w].map(n => n.toFixed(0)));
t('five cells in the inventory too', open.n === 5, 'n=' + open.n);
t('cells are the same size in both', near(open.cell.w, shut.cell.w, 1) && near(open.cell.h, shut.cell.h, 1),
  'open=' + open.cell.w.toFixed(0) + 'x' + open.cell.h.toFixed(0) + ' shut=' + shut.cell.w.toFixed(0) + 'x' + shut.cell.h.toFixed(0));
t('the HUD bar is hidden while the inventory is open', open.hudHidden === 'none', 'display=' + open.hudHidden);
t('and back when it closes', open.hudBack !== 'none' && near(open.hbAfter.y, shut.hb.y, 2), 'display=' + open.hudBack + ' top=' + open.hbAfter.y.toFixed(0));
// --- the gold line and the grid below it
t('the line sits between the bar and the grid', open.rule.y >= open.ihot.b - 1 && open.rule.b <= open.grid.y + 1,
  'ihot.b=' + open.ihot.b.toFixed(0) + ' rule=' + open.rule.y.toFixed(0) + '-' + open.rule.b.toFixed(0) + ' grid=' + open.grid.y.toFixed(0));
t('the line is thin', open.rule.h <= 10 && open.rule.h > 0, 'h=' + open.rule.h.toFixed(1));
t('bar and grid read as one column', Math.abs((open.ihot.x + open.ihot.w / 2) - (open.grid.x + open.grid.w / 2)) < 4,
  'bar mid=' + (open.ihot.x + open.ihot.w / 2).toFixed(0) + ' grid mid=' + (open.grid.x + open.grid.w / 2).toFixed(0));
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
t('no border around the inventory', open.panelBorder === '0px', 'border=' + open.panelBorder);
t('crafting is a button in the top right', open.craftbtn.x > open.vw * 0.7 && open.craftbtn.y < open.vh * 0.2,
  'btn=' + open.craftbtn.x.toFixed(0) + ',' + open.craftbtn.y.toFixed(0));
t('crafting is hidden until pressed', open.popShut === 'none' && open.popOpen !== 'none', 'shut=' + open.popShut + ' open=' + open.popOpen);
t('the X closes it', open.popClosed === 'none', 'display=' + open.popClosed);
// --- the idle fade
t('bar is up when just used', fade.awake > 0.95, 'opacity=' + fade.awake);
t('bar fades after a beat idle', fade.idle < 0.05, 'opacity=' + fade.idle);
t('and comes back on an item change', fade.woke > 0.95, 'opacity=' + fade.woke);
t('no page errors', errs.length === 0, errs.join(' | '));
console.log(pass + '/' + (pass + fail));
await b.close(); server.kill();
process.exit(fail ? 1 : 0);
