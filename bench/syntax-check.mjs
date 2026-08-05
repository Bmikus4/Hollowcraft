// Real syntax check for index.html. The main script is type="module", so `new Function(body)` cannot parse it (import/export
// are illegal there) and a checker that skips module scripts reports "0 errors" for a file that will not boot at all.
// Writes the module body out and lets node's own parser judge it.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const file=process.argv[2]||'index.html';
const s=fs.readFileSync(file,'utf8');
const re=/<script([^>]*)>([\s\S]*?)<\/script>/g; let m,n=0,bad=0;
while((m=re.exec(s))){ n++; const attrs=m[1]||'', body=m[2];
  if(/\bsrc=/.test(attrs)) continue;
  if(/type\s*=\s*["']importmap["']/.test(attrs)){ try{ JSON.parse(body); }catch(e){ bad++; console.log('script #'+n+' importmap JSON: '+e.message); } continue; }
  const tmp=path.join(os.tmpdir(),'hc-syncheck-'+n+'.mjs');
  fs.writeFileSync(tmp, body);
  try{ execFileSync(process.execPath,['--check',tmp],{stdio:'pipe'}); }
  catch(e){ bad++; console.log('script #'+n+' SYNTAX:\n'+String(e.stderr||e.stdout||e.message).split('\n').slice(0,6).join('\n')); }
  finally{ try{ fs.unlinkSync(tmp); }catch(_){} } }
console.log(file+': '+n+' scripts, '+bad+' with syntax errors');
process.exit(bad?1:0);
