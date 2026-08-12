// Syntax-check index.html's type="module" script WITHOUT running it or resolving its imports.
// The shared-checkout rule says commit index.html whole; this is how you find out the whole file parses
// before you do. bench/_syntax_extract.mjs is a stale EXTRACTED COPY of an old index.html, not a tool —
// it tries to import three and dies on module resolution.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const raw=fs.readFileSync(process.argv[2],'utf8');
// HTML COMMENTS ARE BLANKED FIRST, KEEPING THE LINE COUNT, and this is not tidying. On 08-12 a comment
// explaining the new UI-scale block contained the words "a classic <script>, not the module" - so the scan
// matched that literal <script> inside the comment, swallowed the comment's own prose as the script body,
// and reported "Unexpected token ','" against a file that was perfectly valid. A guard that cries wolf gets
// ignored, and this one is the last thing standing between a shared checkout and a build that does not run.
// Newlines are preserved so the reported line number still points at the real script.
const html=raw.replace(/<!--[\s\S]*?-->/g, c => c.replace(/[^\n]/g,' '));
const re=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, n=0, bad=0;
while((m=re.exec(html))){
  const attrs=m[1]||'', body=m[2];
  if(/\bsrc\s*=/.test(attrs)) continue;              // external, nothing inline to parse
  const ty=(/type\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)||[,''])[1].toLowerCase();
  if(ty && !/^(module|text\/javascript|application\/javascript)$/.test(ty)) continue;   // importmap/json are not JS
  const isModule = ty==='module';
  const line=html.slice(0,m.index).split('\n').length;
  n++;
  try{
    // SourceTextModule parses ES syntax (import/export) without resolving or evaluating anything.
    if(isModule) new vm.SourceTextModule(body);
    else new vm.Script(body);
    console.log(`  ok    script #${n} at line ${line} (${isModule?'module':'classic'}, ${body.split('\n').length} lines)`);
  }catch(e){
    bad++;
    console.log(`  FAIL  script #${n} at line ${line}: ${e.message}`);
    // Report the offending line in the FILE's numbering, not the script's, or it is useless on a 34k-line file.
    const mm=/<anonymous>:(\d+)/.exec(e.stack||'')||/:(\d+):\d+/.exec(e.stack||'');
    if(mm) console.log(`        index.html line ~${line + (+mm[1]) - 1}`);
  }
}
console.log(bad? `  ${bad} of ${n} inline scripts FAILED to parse` : `  ${n} inline scripts parse`);
process.exit(bad?1:0);
