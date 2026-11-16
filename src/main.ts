import { initForm } from './form';
import { initMotion } from './motionToggle';
import { chooseTier } from './tier';

const canvas = document.getElementById('ink') as HTMLCanvasElement | null;
const motion = initMotion();
initForm();

// The giant word fills the measure at every width: lay it out at 100px, then scale.
function fitGiant() {
  const span = document.querySelector<HTMLElement>('.giant');
  const h1 = document.querySelector<HTMLElement>('h1');
  if (!span || !h1) return;
  const available = h1.clientWidth;
  if (!available) return;
  span.style.fontSize = '100px';
  // the span is a block, so measure its text, not its box
  const range = document.createRange();
  range.selectNodeContents(span);
  const at100 = range.getBoundingClientRect().width;
  if (!at100) return;
  // width-fit, but never let the headline eat the art above it
  const size = Math.min(((available - 1) / at100) * 100, innerHeight * 0.3);
  span.style.fontSize = `${size}px`;
}

// Keep the layout correct when the phone keyboard opens.
const vv = window.visualViewport;
function setViewportHeight() {
  document.documentElement.style.setProperty('--vvh', `${Math.round(vv?.height ?? innerHeight)}px`);
}
vv?.addEventListener('resize', setViewportHeight);
setViewportHeight();

fitGiant();
document.fonts.ready.then(fitGiant);
window.addEventListener('resize', fitGiant);

const tier = chooseTier();
if (tier === 'C' || !canvas) {
  canvas?.remove();
} else {
  const boot = () =>
    import('./ink').then(
      (m) => m.start(canvas, motion),
      (err) => {
        console.error('[ink] renderer failed, falling back to paper', err);
        canvas.remove();
      },
    );
  if (document.readyState === 'complete') void boot();
  else window.addEventListener('load', () => void boot(), { once: true });
}
