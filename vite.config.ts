import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(
  readFileSync(new URL('./maintenance.config.json', import.meta.url), 'utf8'),
) as { eta: string | null; notifyEndpoint: string | null; showJapanese: boolean };

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

export default defineConfig({
  // The config decides what the static HTML contains, so the no-JS page is already correct.
  plugins: [
    {
      name: 'maintenance-config',
      transformIndexHtml(html: string) {
        if (!cfg.notifyEndpoint) html = html.replace(/<!--form-->[\s\S]*?<!--\/form-->/g, '');
        if (!cfg.showJapanese) html = html.replace(/<!--ja-->[\s\S]*?<!--\/ja-->/g, '');
        if (cfg.eta) html = html.replace('<!--eta-->', `<p class="eta">Expected back around ${esc(cfg.eta)}.</p>`);
        return html.replaceAll('%NOTIFY_ENDPOINT%', esc(cfg.notifyEndpoint ?? ''));
      },
    },
  ],
  build: { target: 'es2022' },
});
