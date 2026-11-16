import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fonts are renamed to their content hash: /assets is immutable for a year, so
 * a stable filename would pin a stale subset after a rebuild.
 *
 * The page itself is served by api/page.js, which reads dist/index.html, so the
 * markup has one source and the response can still be a 503 with Retry-After.
 */
function hashedFonts(): Plugin {
  return {
    name: 'hashed-fonts',
    apply: 'build',
    closeBundle() {
      const dir = 'dist/assets/fonts';
      let html = readFileSync('dist/index.html', 'utf8');
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.woff2')) continue;
        const bytes = readFileSync(join(dir, file));
        const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
        const hashed = file.replace(/\.woff2$/, `.${hash}.woff2`);
        renameSync(join(dir, file), join(dir, hashed));
        html = html.replaceAll(`/assets/fonts/${file}`, `/assets/fonts/${hashed}`);
      }
      writeFileSync('dist/index.html', html);
    },
  };
}

export default defineConfig({
  plugins: [hashedFonts()],
  build: { target: 'es2022' },
});
