/**
 * The DOM h1 is the layout authority. This redraws the same text into a canvas at device
 * resolution so the shader can composite letterforms with palette-safe edges.
 */
export function buildMask(h1: HTMLElement, cssW: number, cssH: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cssW * dpr));
  c.height = Math.max(1, Math.round(cssH * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  for (const span of Array.from(h1.querySelectorAll<HTMLElement>('.lead, .giant'))) {
    const cs = getComputedStyle(span);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    const top = span.getBoundingClientRect().top;
    const m = ctx.measureText('Hxg');
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    // baseline of line i sits half a line box plus the font's own asymmetry below its top
    const base = lh / 2 + (ascent - descent) / 2;

    for (const { word, x, y } of words(span)) {
      const line = Math.max(0, Math.round((y - top) / lh));
      ctx.fillText(word, x, top + line * lh + base);
    }
  }
  return c;
}

function* words(span: HTMLElement): Generator<{ word: string; x: number; y: number }> {
  const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (const m of text.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(node, m.index!);
      range.setEnd(node, m.index! + m[0].length);
      const r = range.getClientRects()[0];
      if (r) yield { word: m[0], x: r.left, y: r.top };
    }
  }
}

/** Dev-only self-check: mask word widths must match the DOM's within a pixel. */
export function checkMask(h1: HTMLElement) {
  const c = document.createElement('canvas').getContext('2d')!;
  let worst = 0;
  for (const span of Array.from(h1.querySelectorAll<HTMLElement>('.lead, .giant'))) {
    const cs = getComputedStyle(span);
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    for (const node of Array.from(span.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        for (const m of (node.textContent ?? '').matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, m.index!);
          range.setEnd(node, m.index! + m[0].length);
          const r = range.getClientRects()[0];
          if (!r) continue;
          worst = Math.max(worst, Math.abs(c.measureText(m[0]).width - r.width));
        }
      }
    }
  }
  console.log(`[mask] max word width delta: ${worst.toFixed(2)}px`);
}
