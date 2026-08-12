// Why is the menu button's plate not the slate? Reads the computed ::before and samples the pixels behind the label.
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
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const got = []; page.on('response', r => { if (r.url().includes('tex_slate')) got.push(r.status()); });
await page.goto(base + '/index.html', { waitUntil: 'load' }); await page.waitForTimeout(3500);
console.log(await page.evaluate(() => {
  const btn = document.getElementById('mb-solo');
  const bs = getComputedStyle(btn, '::before'), s = getComputedStyle(btn);
  return { beforeBg: bs.backgroundImage.slice(0, 120), beforeSize: bs.backgroundSize, beforeInset: [bs.top, bs.left, bs.width, bs.height],
           beforeZ: bs.zIndex, beforeContent: bs.content, btnBg: s.backgroundImage.slice(0, 60),
           overflow: s.overflow, btnZ: s.zIndex, clip: bs.clipPath.slice(0, 40) };
}));
console.log('tex_slate responses: ' + JSON.stringify(got));
await b.close(); server.kill();
