// Does the coast-pine program COMPILE? Its own comment records a night lost to exactly this — 'outc' undeclared,
// VALIDATE_STATUS false — and a program that does not link draws nothing at any size, which is precisely what 32
// degrees of invisible treeline looks like. three.js logs shader errors to the console, so capture the console.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const port=await new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port;
await new Promise((res,rej)=>{const t0=Date.now();(function pp(){const rq=http.get(base+'/index.html',r=>{r.resume();res();});rq.on('error',()=>{Date.now()-t0>20000?rej(new Error('down')):setTimeout(pp,250);});})();});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await browser.newPage();
const hits=[];
page.on('console',m=>{ const t=m.text(); if(/shader|program|glsl|compile|VALIDATE|ERROR:/i.test(t)) hits.push(m.type()+': '+t.slice(0,400)); });
page.on('pageerror',e=>hits.push('pageerror: '+String(e.message).slice(0,300)));
await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:240000});
await sleep(6000);
console.log('shader/program console lines:', hits.length);
for(const h of hits.slice(0,12)) console.log('  '+h);
await browser.close(); server.kill();
