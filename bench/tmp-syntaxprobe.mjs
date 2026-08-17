// WHERE IS THE SYNTAX ERROR? A pageerror of "Invalid or unexpected token" carries no location through the rig's
// one-line print. This loads the page raw and prints every console/error record with its stack.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const port=await new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port;
await new Promise((res,rej)=>{const t0=Date.now();(function p(){const rq=http.get(base+'/index.html',r=>{r.resume();res();});rq.on('error',()=>{Date.now()-t0>20000?rej(new Error('down')):setTimeout(p,250);});})();});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await browser.newPage();
page.on('pageerror',e=>console.log('PAGEERROR:',e.stack||e.message));
page.on('console',m=>{ if(m.type()==='error') console.log('CONSOLE:', m.text(), JSON.stringify(m.location())); });
page.on('requestfailed',r=>console.log('REQFAIL:', r.url(), r.failure()&&r.failure().errorText));
await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
await sleep(8000);
console.log('started:', await page.evaluate(`(()=>{try{return __hc.st().started}catch(e){return 'no __hc: '+e.message}})()`));
await browser.close(); server.kill();
