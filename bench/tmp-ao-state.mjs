import { spawn } from 'node:child_process';
import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft'; const PORT=8134;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const srv=spawn(process.execPath,[ROOT+'/server.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),NO_OPEN:'1'},stdio:'ignore'});
await new Promise((res,rej)=>{const t0=Date.now();(function p(){const r=http.get(`http://127.0.0.1:${PORT}/index.html`,x=>{x.resume();res()});r.on('error',()=>Date.now()-t0>20000?rej(new Error('down')):setTimeout(p,250))})()});
const exe=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
const b=await chromium.launch({executablePath:exe,headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
const pg=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
await pg.goto(`http://127.0.0.1:${PORT}/index.html?perf=1&debug=1`,{waitUntil:'load',timeout:120000});
await pg.waitForFunction('!!window.__hc',null,{timeout:60000});
await pg.waitForFunction(`(()=>{try{return __hc.st().started===true}catch(e){return false}})()`,null,{timeout:180000}).catch(()=>console.log('(never reached started=true)'));
await sleep(3000);

console.log('__hc.ssao() read  :', JSON.stringify(await pg.evaluate('__hc.ssao()')));



console.log('ssao keys      :', JSON.stringify(await pg.evaluate('Object.keys(__hc).filter(k=>/ssao|ao|post|bloom|grade|godray/i.test(k))')));
console.log('ssao off->on   :', JSON.stringify(await pg.evaluate('[__hc.ssao(false), __hc.ssao(true)]')));
await b.close(); srv.kill();
