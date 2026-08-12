// DOES THE DEPLOYED BUILD START? The local dev server serves the WORKING TREE, which carries both live
// sessions' uncommitted edits, so "it loads here" says nothing about the build Ben opens in a browser.
// This drives the real play path against a URL - production by default.
//
//   node bench/tmp-prod-boot.mjs
//   node bench/tmp-prod-boot.mjs https://hollowcraft-git-main-bmikus4s-projects.vercel.app
import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = process.argv[2] || 'https://hollowcraft.vercel.app/';
function findBrowser() { for (const p of [process.env.HC_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean)) if (fs.existsSync(p)) return p; }

(async () => {
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true,
    args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [], bad = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + String(e.message || e).slice(0, 300)));
  page.on('console', m => { const t = m.text(); if (/error|uncaught|GL_INVALID|ERROR: \d/i.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });

  console.log('  ' + URL_);
  await page.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await sleep(6000);

  const menu = await page.evaluate(`(()=>{ const o={hc:!!window.__hc};
    for(const id of ['mb-solo','mb-continue','boot','err']){ const e=document.getElementById(id);
      o[id]= e? (getComputedStyle(e).display+'|'+((e.textContent||'').trim().slice(0,60))) : 'MISSING'; }
    return o; })()`);
  console.log('  menu:', JSON.stringify(menu));

  if (menu['mb-solo'] && menu['mb-solo'] !== 'MISSING') {
    await page.evaluate(`document.getElementById('mb-solo').click()`);
    for (let i = 0; i < 45; i++) {
      await sleep(2000);
      const s = await page.evaluate(`(()=>{ try{ const ls=(window.__hc&&__hc.loadState)?__hc.loadState():{no__hc:true};
        const l=document.getElementById('load'); const cs=l?getComputedStyle(l):null;
        return { armed:!!ls.playAt, mesh9:ls.mesh9||'?', circleDone:!!ls.circleDone, wd:!!ls.watchdog,
                 load:cs?(cs.display+'/op'+(+cs.opacity).toFixed(2)):'MISSING',
                 err:(document.getElementById('err')||{}).textContent||'' }; }catch(e){ return {probeErr:String(e.message||e)}; } })()`);
      console.log(`  +${(i + 1) * 2}s ${JSON.stringify(s)}`);
      if (s.circleDone && /op0/.test(s.load || '')) { console.log('  -> LOADED'); break; }
      if (s.probeErr || s.no__hc) break;
    }
  }
  await page.screenshot({ path: path.join(ROOT, 'bench/results/prod-boot.png') });
  if (errs.length) { console.log('  ERRORS:'); [...new Set(errs)].slice(0, 8).forEach(e => console.log('    ' + e)); }
  if (bad.length) { console.log('  HTTP>=400:'); [...new Set(bad)].slice(0, 12).forEach(e => console.log('    ' + e)); }
  if (!errs.length && !bad.length) console.log('  no page errors, no failed requests');
  await browser.close();
})();
