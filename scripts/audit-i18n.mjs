import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const files = (await readdir('src', { recursive: true })).filter((file) => file.endsWith('.tsx') && !file.startsWith('i18n/'));
const failures = [];
for (const file of files) {
  const text = (await readFile(`src/${file}`, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const pattern of [/>\s*([A-Za-z][^<>{}\n]*)<\//g, /(?:aria-label|title|subtitle|placeholder|label)="([A-Za-z][^"]*)"/g]) {
    for (const match of text.matchAll(pattern)) failures.push(`${file}: ${match[1].trim()}`);
  }
}
assert.deepEqual(failures, [], 'Extract UI text to src/i18n/locales/en.ts');
console.log(`PASS: no literal JSX text or UI labels in ${files.length} files.`);
