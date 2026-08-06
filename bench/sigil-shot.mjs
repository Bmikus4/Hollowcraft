// THE LOADING SIGIL, ON ITS OWN. It is pure canvas 2D, so it does not need the game to be judged - and it CANNOT be
// judged from a normal boot, because the world generation that the circle covers blocks the main thread, so no frame
// paints while it is up and no screenshot of it can be taken in situ. This lifts _sigilLoader straight out of
// index.html into a bare page and shoots it at three ages, which is how the rework was actually looked at.
// Regenerate the page first: the python one-liner in the commit for this file, or just re-extract the function.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const B=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const b=await chromium.launch({executablePath:B,headless:true,args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:900,height:900}})).newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
const dir='C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f4f96685-e47e-4a62-8074-2dde18ff2e7a/scratchpad/';
await p.goto('file:///'+dir+'sigil.html');
for(const t of [1500,5000,12000]){ await new Promise(r=>setTimeout(r,t===1500?1500:t===5000?3500:7000));
  await p.screenshot({path:dir+'sigil-'+t+'.png'}); console.log('shot at ~'+t+'ms'); }
await b.close();
