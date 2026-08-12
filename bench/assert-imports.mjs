// EVERY NAME index.html IMPORTS MUST ACTUALLY BE EXPORTED. This is the cheapest guard in the repo and
// it exists because its absence took production down.
//
// 2026-08-12: the deployed build threw, on the very first line of the module, before anything else ran:
//   "The requested module './src/entity/giantess/index.js' does not provide an export named 'giantessDeathFall'"
// index.html had been committed importing giantessDeathFall and giantessSquat while the module that
// defines them sat UNCOMMITTED in a shared working tree. An ES module that fails to link does not run AT
// ALL, so there was no __hc, no startGame, and no watchdog - clicking "Enter the Wood" did nothing and the
// key art stayed up for ever. That is exactly the report that opened this whole handoff: "it never loads,
// it gets stuck without fading on the main menu image".
//
// WHY NOTHING CAUGHT IT. bench/syntax-check.mjs parses the inline module WITHOUT resolving imports, which
// is deliberate and right for what it does. Every other harness boots the LOCAL DEV SERVER, which serves
// the WORKING TREE - where the file is present and correct. The break only exists in the committed tree,
// so only something that reads git, or a browser pointed at the deploy, could ever have seen it.
//
// So this runs against `git show HEAD:` by default, NOT the working copy. Checking the working copy would
// have reported green on the day production was down.
//
//   node bench/assert-imports.mjs            the committed tree (what deploys)
//   node bench/assert-imports.mjs --worktree the files on disk (what the dev server serves)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const WORKTREE = process.argv.includes('--worktree');
const REF = (process.argv.find(a => a.startsWith('--ref=')) || '--ref=HEAD').slice(6);

function read(rel) {
  if (WORKTREE) { const p = path.join(ROOT, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; }
  try { return execFileSync('git', ['show', `${REF}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }); }
  catch { return null; }
}

// Named exports of one module, following `export * from` so a barrel file resolves.
function exportsOf(rel, seen = new Set()) {
  if (seen.has(rel)) return new Set(); seen.add(rel);
  const src = read(rel);
  const out = new Set();
  if (src == null) return out;
  for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) out.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm))
    for (const piece of m[1].split(',')) {
      const t = piece.trim(); if (!t) continue;
      const as = t.split(/\s+as\s+/); out.add((as[1] || as[0]).trim());
    }
  if (/^\s*export\s+default\b/m.test(src)) out.add('default');
  for (const m of src.matchAll(/^\s*export\s*\*\s*from\s*['"]([^'"]+)['"]/gm)) {
    const child = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
    for (const n of exportsOf(child, seen)) out.add(n);
  }
  return out;
}

const html = read('index.html');
if (html == null) { console.log(`  cannot read index.html at ${WORKTREE ? 'worktree' : REF}`); process.exit(2); }

let checked = 0; const problems = [];
// Named, default and namespace imports of RELATIVE modules. Bare specifiers (three, etc.) come from the
// import map and are not this guard's business.
for (const m of html.matchAll(/^\s*import\s+([^;]+?)\s+from\s*['"](\.[^'"]+)['"]/gm)) {
  const clause = m[1].trim();
  const rel = path.posix.normalize(path.posix.join('.', m[2].replace(/^\.\//, '')));
  if (read(rel) == null) { problems.push(`MISSING MODULE  ${rel}`); continue; }
  if (/^\*\s+as\s+/.test(clause)) continue;                       // namespace import needs no name to exist
  const named = clause.match(/\{([^}]*)\}/);
  const wanted = [];
  const bare = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim();
  if (bare) wanted.push('default');
  if (named) for (const piece of named[1].split(',')) {
    const t = piece.trim(); if (!t) continue;
    wanted.push(t.split(/\s+as\s+/)[0].trim());
  }
  const have = exportsOf(rel);
  for (const w of wanted) { checked++; if (!have.has(w)) problems.push(`NOT EXPORTED    ${w}  <-  ${rel}`); }
}

const where = WORKTREE ? 'working tree' : `git ${REF}`;
console.log(`  ${checked} imported names checked against ${where}`);
for (const p of problems) console.log('  ' + p);
if (problems.length) {
  console.log(`\n  FAIL ${problems.length} unresolved. An ES module that fails to link does not execute at all:`);
  console.log('  no __hc, no startGame, no watchdog, and the menu never leaves the key art.');
  process.exit(1);
}
console.log('  PASS every relative import resolves to a real export');
