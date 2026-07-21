// Dead-code finder: list top-level function/const/let/var names DEFINED in index.html that are
// referenced NOWHERE else in the project (index.html + bench + src + mp-server + party). Conservative:
// counts any \bNAME\b occurrence (incl. strings/HTML/__hc keys) so dynamic dispatch isn't falsely flagged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
(function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){ if(e.name==='node_modules'||e.name==='.git'||e.name==='results')continue;
  const p=path.join(d,e.name); if(e.isDirectory())walk(p); else if(/\.(html|js|mjs)$/.test(e.name))files.push(p); } })(ROOT);
const corpus = files.map(f=>({f, s:fs.readFileSync(f,'utf8')}));
const html = corpus.find(c=>c.f.endsWith('index.html')).s;

// collect definitions in index.html
const defs = new Map();   // name -> {kind, line}
const lines = html.split('\n');
for(let i=0;i<lines.length;i++){ const L=lines[i];
  let m;
  // function NAME(
  const fn = L.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/); if(fn) defs.set(fn[1],{kind:'function',line:i+1});
  // top-level const/let/var NAME =   (indentation 0 = module scope; skip indented locals)
  const v = L.match(/^(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/); if(v && !defs.has(v[2])) defs.set(v[2],{kind:v[1],line:i+1});
}
// count references across the whole corpus
const dead = [];
for(const [name, info] of defs){
  if(name.length<3) continue;                       // skip 1-2 char names (noise, likely locals/loops)
  const re = new RegExp('\\b'+name.replace(/[$]/g,'\\$')+'\\b','g');
  let total=0; for(const c of corpus){ const mm=c.s.match(re); if(mm)total+=mm.length; }
  if(total<=1) dead.push({name, ...info, refs:total});   // <=1 = only the definition itself
}
dead.sort((a,b)=>a.line-b.line);
console.log('DEFS scanned:', defs.size, ' — ZERO-REFERENCE candidates:', dead.length);
for(const d of dead) console.log(`  line ${d.line}  [${d.kind}]  ${d.name}  (refs=${d.refs})`);
