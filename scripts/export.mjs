// Export the stored addresses as CSV: node scripts/export.mjs
// Reads the same Upstash-compatible REST KV the function uses.
import { writeFileSync, mkdirSync } from 'node:fs';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error('missing KV_REST_API_URL / KV_REST_API_TOKEN');
  process.exit(1);
}

const res = await fetch(url, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify([['HGETALL', 'kawanjapan:subs']]),
});
if (!res.ok) {
  console.error(`kv ${res.status}`);
  process.exit(1);
}
const [{ result }] = await res.json();
const flat = Array.isArray(result) ? result : [];
const rows = [];
for (let i = 0; i < flat.length; i += 2) {
  let meta = {};
  try {
    meta = JSON.parse(flat[i + 1]);
  } catch {
    meta = { ts: '', lang: '' };
  }
  rows.push({ email: flat[i], ts: meta.ts ?? '', lang: meta.lang ?? '' });
}
rows.sort((a, b) => a.ts.localeCompare(b.ts));

const seen = new Set();
const unique = rows.filter((r) => {
  const key = r.email.toLowerCase();
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const csv = ['email,subscribed_at,lang']
  .concat(unique.map((r) => `${r.email},${r.ts},${r.lang}`))
  .join('\n');
mkdirSync('exports', { recursive: true });
const name = `exports/subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
writeFileSync(name, `${csv}\n`);
console.log(`${unique.length} rows -> ${name}`);
console.log(csv);
