// one-off: watch boot state at a given ?t= value, capturing page errors
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = process.argv[2] || '630';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:'8123', MP_DISC:'8124'}, stdio:'ignore' });
  await sleep(1500);
  const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  const page = await (await browser.newContext()).newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String((e.stack||e.message||e)).slice(0,600)));
  await page.goto('http://127.0.0.1:8123/index.html?debug=1&t='+T,{waitUntil:'load',timeout:60000});
  for(let i=1;i<=12;i++){ await sleep(3000);
    const st = await page.evaluate(`(()=>{ try{ return {hc:!!window.__hc, started:window.__hc?__hc.st().started:null, chunk:window.__hc?__hc.probe().chunkHere:null}; }catch(e){ return {err:String(e).slice(0,150)}; } })()`);
    console.log((i*3)+'s:', JSON.stringify(st));
    if(st.started===true && st.chunk===true) break; }
  console.log('pageErrors:', JSON.stringify(errs.slice(0,5)));
  await browser.close(); server.kill();
})();
