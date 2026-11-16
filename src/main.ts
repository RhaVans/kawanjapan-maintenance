import { applyCopy, pickLang } from './copy';
import { initForm } from './form';
import { chooseTier } from './tier';

const canvas = document.getElementById('ink') as HTMLCanvasElement | null;
const lang = pickLang();
const copy = applyCopy(lang);
initForm(lang, copy);

const panel = document.querySelector<HTMLElement>('.panel');
const form = document.getElementById('notify') as HTMLFormElement | null;
const giant = document.querySelector<HTMLElement>('.giant');
const h1 = document.querySelector<HTMLElement>('h1');

// The giant word fills the panel, or the column height when space is short.
function fitGiant() {
  if (!giant || !h1 || !panel) return;
  const available = panel.clientWidth;
  if (!available) return;
  // Measure the word on one line: a wrapped range reports the column width,
  // which would size the giant to the column and then wrap anyway.
  const prevWrap = giant.style.whiteSpace;
  giant.style.whiteSpace = 'nowrap';
  giant.style.fontSize = '100px';
  const range = document.createRange();
  range.selectNodeContents(giant);
  const at100 = range.getBoundingClientRect().width;
  giant.style.whiteSpace = prevWrap;
  if (!at100) return;
  const byWidth = ((available - 1) / at100) * 100;
  // CJK glyphs sit in a full em square, so they read larger at the same size.
  const cjk = document.documentElement.lang === 'ja' ? 0.72 : 1;
  const short = innerHeight <= 520;
  const byHeight = (short ? innerHeight * 0.34 : innerHeight * 0.30) * cjk;
  const size = Math.max(20, Math.min(byWidth, byHeight));
  giant.style.fontSize = `${size}px`;
  const wide = panel.clientWidth >= 420;
  form?.classList.toggle('wide', wide);
  document.documentElement.style.setProperty('--giant', `${size}px`);
}

// Keep the panel inside the viewport when the keyboard opens.
if (window.visualViewport) {
  const vv = window.visualViewport;
  vv.addEventListener('resize', fitGiant);
}

// Snap the text block to whole device pixels: a half-pixel edge renders as a
// grey or pinkish row one device pixel tall, which breaks the three-colour rule.
function snap() {
  if (!panel) return;
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const r = panel.getBoundingClientRect();
  const dx = Math.round(r.left * dpr) / dpr - r.left;
  const dy = Math.round(r.top * dpr) / dpr - r.top;
  panel.style.transform = `translate(${dx}px, ${dy}px)`;
}

function layout() {
  fitGiant();
  snap();
}

layout();
document.fonts.ready.then(layout);
window.addEventListener('resize', layout);

const tier = chooseTier();
if (tier === 'C' || !canvas) {
  canvas?.remove();
} else {
  const boot = () =>
    import('./ink').then(
      (m) => {
        const ink = m.start(canvas, tier === 'B');
        if (!ink) return;
        const place = () => {
          const box = panel?.getBoundingClientRect();
          if (!box) return;
          // Quiet zone: the text block plus 24 CSS px on every side.
          ink.setQuiet(box.left - 24, box.top - 24, box.width + 48, box.height + 48);
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, { passive: true });
        document.fonts.ready.then(place);
      },
      (err) => {
        console.error('[ink] renderer failed, falling back to paper', err);
        canvas.remove();
      },
    );
  if (document.readyState === 'complete') void boot();
  else window.addEventListener('load', () => void boot(), { once: true });
}
