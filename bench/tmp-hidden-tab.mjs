// DOES A BACKGROUNDED TAB STRAND THE BOOT? The one condition that matches Ben's words exactly.
//
// "it gets stuck WITHOUT FADING on the main menu image and never loads". Three things in the boot are
// driven by requestAnimationFrame, and a hidden tab throttles rAF to roughly one call a second or
// stops it outright:
//   - the fade itself: _sigilShow adds 'go' to #loadblack inside rAF(rAF(...))
//   - the gate:      the release block lives in loop()
//   - the watchdog:  ALSO lives in loop(), so it cannot rescue what it is not running to see
// So a player who clicks play and alt-tabs away while the wood forms - which is exactly what someone
// does when a load is slow - has no fade, no release, and no rescue. That is a permanent hang, and it
// unsticks itself the moment the tab is looked at again, which is why it never reproduces on demand.
//
// Backgrounding is done by opening a SECOND page and bringing it to front, which is a real tab switch
// rather than a synthesised visibilitychange event: dispatching the event by hand does not actually
// throttle rAF, so it would prove nothing.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = +(process.env.HC_PORT || 8123), BASE = 'http://127.0.0.1:' + PORT;
function findBrowser() { const c = [process.env.HC_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for (const p of c) if (fs.existsSync(p)) return p; return undefined; }
const waitHttp = u => new Promise((res, rej) => { let n = 0; const t = setInterval(() => {
  http.get(u, r => { r.destroy(); clearInterval(t); res(); }).on('error', () => { if (++n > 200) { clearInterval(t); rej(new Error('no server')); } }); }, 500); });

const PROBE = `(()=>{ try{
  const ls=(window.__hc&&__hc.loadState)?__hc.loadState():{no__hc:true};
  const bk=document.getElementById('loadblack'), ld=document.getElementById('load');
  return { armed:!!ls.playAt, heldMs:ls.heldMs|0, circleDone:!!ls.circleDone, watchdog:!!ls.watchdog,
           faded:!!((bk&&bk.className)||'').includes('go'),
           blackOp: bk? +(+getComputedStyle(bk).opacity).toFixed(2):null,
           loadDisp: ld? getComputedStyle(ld).display:'MISSING',
           vis: document.visibilityState, rafTicks: window.__rafTicks|0 };
}catch(e){ return {err:String(e.message||e)}; } })()`;

// HIDE_AT: 0 = hide BEFORE the click (the pathological case), 1500 = hide just after, null = never hide.
const HIDE_AT = process.argv.includes('--control') ? null : +( (process.argv.find(a=>a.startsWith('--hide='))||'--hide=0').split('=')[1] );

(async () => {
  await waitHttp(BASE + '/index.html');
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true,
    args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  // An independent rAF counter, so "is rAF running" is a number and not an inference from the symptoms.
  await page.addInitScript(`window.__rafTicks=0; (function t(){ window.__rafTicks++; requestAnimationFrame(t); })();`);
  page.on('pageerror', e => console.log('  PAGEERROR:', String(e.message || e).slice(0, 200)));
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 180000 });
  await sleep(4000);
  console.log(`  mode: ${HIDE_AT === null ? 'CONTROL (tab stays in front)' : 'hide the tab ' + HIDE_AT + 'ms after the click'}`);

  const t0 = Date.now();
  await page.evaluate(`document.getElementById('mb-solo').click()`);
  let other = null;
  if (HIDE_AT !== null) {
    if (HIDE_AT > 0) await sleep(HIDE_AT);
    other = await ctx.newPage();
    await other.goto('about:blank');
    await other.bringToFront();          // a real tab switch: the game page is now hidden
    console.log(`  +${((Date.now() - t0) / 1000).toFixed(1)}s  tab backgrounded`);
  }

  let last = '';
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    const s = await page.evaluate(PROBE);
    const line = `vis=${s.vis} raf=${s.rafTicks} armed=${s.armed} faded=${s.faded} blackOp=${s.blackOp} circleDone=${s.circleDone} wd=${s.watchdog} load=${s.loadDisp}`;
    if (line !== last) { console.log(`  +${((Date.now() - t0) / 1000).toFixed(0)}s  ${line}`); last = line; }
    if (s.circleDone && s.loadDisp === 'none') { console.log('  -> LOADED'); break; }
  }

  // Then look at it again. If the boot resumes here, the tab being hidden IS the fault and nothing else is.
  if (other) {
    console.log('  bringing the game tab back to the front...');
    await page.bringToFront();
    for (let i = 0; i < 20; i++) {
      await sleep(2000);
      const s = await page.evaluate(PROBE);
      console.log(`  +${((Date.now() - t0) / 1000).toFixed(0)}s  vis=${s.vis} raf=${s.rafTicks} faded=${s.faded} circleDone=${s.circleDone} wd=${s.watchdog} load=${s.loadDisp}`);
      if (s.circleDone && s.loadDisp === 'none') { console.log('  -> LOADED ONLY AFTER THE TAB CAME BACK'); break; }
    }
  }
  await page.screenshot({ path: path.join(ROOT, 'bench/results/hidden-tab.png') });
  await browser.close();
})();
