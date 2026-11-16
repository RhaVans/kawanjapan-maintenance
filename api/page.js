// GET / — serves the built page with 503 + Retry-After, which a static file
// cannot do. The HTML is read from the build output (vercel.json includes
// dist/index.html in this function) so the markup has one source.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUCCESS = {
  id: 'Terima kasih. Kami akan mengirim satu email saat situs kembali.',
  en: 'Thank you. We will send one email when the site is back.',
  ja: 'ありがとうございます。復旧しましたらメールを1通お送りします。',
};

let cached = null;
function html() {
  if (cached === null) cached = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8');
  return cached;
}

function pickLang(url, accept) {
  const q = url.searchParams.get('lang');
  if (q === 'id' || q === 'en' || q === 'ja') return q;
  for (const part of String(accept || '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().split('-')[0];
    if (tag === 'ja') return 'ja';
    if (tag === 'en') return 'en';
  }
  return 'id';
}

export default function handler(req, res) {
  const url = new URL(req.url, 'https://' + (req.headers.host || 'localhost'));
  const lang = pickLang(url, req.headers['accept-language']);
  let body = html().replace('<html lang="id"', '<html lang="' + lang + '"');
  // Server-rendered render time: the dwell check in api/subscribe compares
  // against it, so a scripted submit cannot claim it waited.
  body = body.replace('name="ts" value="0"', 'name="ts" value="' + Date.now() + '"');
  if (url.searchParams.get('ok') === '1') {
    const done = '<p class="notify-done" role="status" aria-live="polite" data-i18n="success">' + SUCCESS[lang] + '</p>';
    body = body.replace(/<!--form-->[\s\S]*?<!--\/form-->/, done);
  }
  res.statusCode = 503;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('retry-after', '3600');
  res.end(body);
}
