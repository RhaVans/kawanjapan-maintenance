// POST /api/subscribe — validates, rate limits and stores one email address.
// Node runtime, platform standard library only; storage is Upstash-compatible
// REST KV (what Vercel's Marketplace Redis integration injects).

const LIMIT = 5;
const WINDOW = 60;
const MAX_BODY = 1024;
const MIN_DWELL_MS = 2000;
const KEY = 'kawanjapan:subs';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED = ['https://kawanjapan.com', 'https://www.kawanjapan.com'];
const LANGS = new Set(['id', 'en', 'ja']);

function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function kv(commands) {
  const s = store();
  if (!s) throw new Error('no-store');
  const res = await fetch(s.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  const data = await res.json();
  return data.map((d) => d.result);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too-large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '');
  return fwd.split(',')[0].trim() || String(req.headers['x-real-ip'] || '0.0.0.0');
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin form post sends no Origin in some browsers
  if (ALLOWED.includes(origin)) return true;
  return origin === `https://${req.headers.host}`;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(req)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
  }
  res.setHeader('cache-control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, accept');
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method' });
    return;
  }
  if (!originAllowed(req)) {
    res.status(403).json({ ok: false, error: 'origin' });
    return;
  }
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) {
    res.status(413).json({ ok: false, error: 'body' });
    return;
  }

  let payload;
  try {
    const raw = await readBody(req);
    const type = String(req.headers['content-type'] || '');
    payload = type.includes('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch (err) {
    res.status(err && err.status === 413 ? 413 : 400).json({ ok: false, error: 'body' });
    return;
  }

  const wantsHtml = String(req.headers.accept || '').includes('text/html');
  const lang = LANGS.has(String(payload.lang)) ? String(payload.lang) : 'id';
  const redirectOk = () => {
    res.statusCode = 303;
    res.setHeader('location', `/?ok=1&lang=${lang}`);
    res.end();
  };

  // Honeypot: pretend it worked, store nothing.
  if (String(payload.hp || '').trim() !== '') {
    if (wantsHtml) redirectOk();
    else res.status(200).json({ ok: true });
    return;
  }
  // Dwell is measured on the server clock against the render time the page
  // function wrote into the form, so it cannot be forged by editing the field.
  const rendered = Number(payload.ts || 0);
  if (!rendered || Date.now() - rendered < MIN_DWELL_MS) {
    if (wantsHtml) res.status(400).send('too-fast');
    else res.status(400).json({ ok: false, error: 'too-fast' });
    return;
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    if (wantsHtml) res.status(400).send('invalid');
    else res.status(400).json({ ok: false, error: 'invalid' });
    return;
  }

  if (!store()) {
    if (wantsHtml) res.status(503).send('not-configured');
    else res.status(503).json({ ok: false, error: 'not-configured' });
    return;
  }

  try {
    const minute = Math.floor(Date.now() / (WINDOW * 1000));
    const [count] = await kv([
      ['INCR', `rl:${clientIp(req)}:${minute}`],
      ['EXPIRE', `rl:${clientIp(req)}:${minute}`, String(WINDOW)],
    ]);
    if (Number(count) > LIMIT) {
      if (wantsHtml) res.status(429).send('rate');
      else res.status(429).json({ ok: false, error: 'rate' });
      return;
    }

    // HSETNX keeps the first timestamp for a repeated address.
    await kv([['HSETNX', KEY, email, JSON.stringify({ ts: new Date().toISOString(), lang })]]);
  } catch (err) {
    if (wantsHtml) res.status(503).send('unavailable');
    else res.status(503).json({ ok: false, error: 'unavailable' });
    return;
  }

  if (wantsHtml) redirectOk();
  else res.status(200).json({ ok: true });
}
