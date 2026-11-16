// Delete every stored address: node scripts/delete-all.mjs
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error('missing KV_REST_API_URL / KV_REST_API_TOKEN');
  process.exit(1);
}

const res = await fetch(url, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify([['DEL', 'kawanjapan:subs']]),
});
if (!res.ok) {
  console.error(`kv ${res.status}`);
  process.exit(1);
}
const [{ result }] = await res.json();
console.log(`deleted keys: ${result}`);
