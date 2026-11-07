'use strict';
// Principio 10 de la constitución: `node --check` sobre todo el JavaScript propio (no vendor/).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dirs = ['js', 'scripts', 'tests'];
const files = [];
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(c?js)$/.test(e.name)) files.push(p);
  }
};
dirs.forEach((d) => walk(path.join(root, d)));
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (err) { failed++; console.error(`✗ ${path.relative(root, f)}\n${err.stderr}`); }
}
console.log(`node --check: ${files.length - failed}/${files.length} archivos correctos`);
if (failed) process.exitCode = 1;
