// PROBE: where does index.html's module become unbalanced? `node --check` only ever says "Unexpected end of input"
// at the last line, which is useless in a 26,000-line file that four sessions are editing at once. This lexes
// strings, template literals and both comment forms, then reports the first line whose brace depth diverges from
// the same file at HEAD — which is the line the damage starts on, not the line it is noticed on.
// usage: node bench/tmp-brace-profile.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const RX = /<script type="module">([\s\S]*?)<\/script>/;
const SQ = "'", DQ = '"', BT = '`', BS = '\\';

function profile(src){
  const perLine = [];
  let d = 0, i = 0, st = null;
  const n = src.length;
  while(i < n){
    const c = src[i], c2 = src[i+1];
    if(c === '\n'){ perLine.push(d); if(st === 'lc') st = null; i++; continue; }
    if(st === 'lc'){ i++; continue; }
    if(st === 'bc'){ if(c === '*' && c2 === '/'){ st = null; i += 2; } else i++; continue; }
    if(st === 'sq' || st === 'dq' || st === 'tpl'){
      if(c === BS){ i += 2; continue; }
      if((st === 'sq' && c === SQ) || (st === 'dq' && c === DQ) || (st === 'tpl' && c === BT)) st = null;
      i++; continue; }
    if(c === '/' && c2 === '/'){ st = 'lc'; i += 2; continue; }
    if(c === '/' && c2 === '*'){ st = 'bc'; i += 2; continue; }
    if(c === SQ){ st = 'sq'; i++; continue; }
    if(c === DQ){ st = 'dq'; i++; continue; }
    if(c === BT){ st = 'tpl'; i++; continue; }
    if(c === '{') d++; else if(c === '}') d--;
    i++;
  }
  perLine.push(d);
  return { depth: d, perLine, endState: st };
}

const work = fs.readFileSync('index.html','utf8').match(RX)[1];
const head = execFileSync('git',['show','HEAD:index.html'],{encoding:'utf8',maxBuffer:1<<28}).match(RX)[1];
const pw = profile(work), ph = profile(head);
console.log('HEAD    final depth '+ph.depth+'  unterminated: '+(ph.endState||'none'));
console.log('WORKING final depth '+pw.depth+'  unterminated: '+(pw.endState||'none'));

const NL=String.fromCharCode(10);
const lines=work.split(NL);
// print depth around every one of MY edit sites, so the jump is attributable
for(const probe of ['const ATLAS_COUNT = _tileCursor;','function foliageMesh(c){','function injectAtlas(mat, opts={}){','function buildChunkStaged(c){','function buildChunkMeshes(c){']){
  const k=lines.findIndex(L=>L.indexOf(probe)===0 || L.trim().indexOf(probe)===0);
  console.log((k+1)+'  depth-before='+(k>0?pw.perLine[k-1]:0)+'   '+probe);
}
