// Prints shell assignments for scripts/fonts.sh, so the subsets always match
// the copy in src/copy.json.
import { readFileSync } from 'node:fs';

const copy = JSON.parse(readFileSync(new URL('../src/copy.json', import.meta.url), 'utf8'));
const uniq = (s) => [...new Set(s.split(''))].join('');
const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

const ja = Object.values(copy.ja).join(' ');
const latin = [...Object.values(copy.id), ...Object.values(copy.en)].join(' ');

console.log(`DISPLAY=${q(uniq(`${copy.id.giant} ${copy.en.giant}`))}`);
console.log(`LEAD=${q(uniq(`${copy.id.lead} ${copy.en.lead}`))}`);
console.log(`JA=${q(uniq(ja))}`);
console.log(`LATIN=${q(uniq(latin))}`);
