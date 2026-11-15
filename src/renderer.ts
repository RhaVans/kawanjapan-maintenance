import {
  bind,
  createContext,
  freeTarget,
  makeQuad,
  makeTarget,
  pass,
  program,
  type Prog,
} from './gl';
import { LOOK } from './fluid/shaders';
import { Ambient, Fluid, LEVELS, type Particle } from './fluid/sim';
import { Stirrers } from './fluid/stirrers';
import { buildMask } from './typeMask';
import type { Motion } from './motionToggle';

export type Phase = 'A' | 'B' | 'C+';

const INK_GAIN = 4.5;
const SPLAT_RADIUS = 0.001;
const STROKE_RADIUS = 0.0012;
const BURST_RADIUS = 0.004;

export function start(canvas: HTMLCanvasElement, phase: Phase, motion: Motion) {
  const gl = createContext(canvas);
  if (!gl) return toStatic(canvas);
  // Half-float colour attachments stay non-renderable until the extension is enabled here.
  const floatOk = !!gl.getExtension('EXT_color_buffer_float');

  const h1 = document.querySelector<HTMLElement>('h1');
  const vao = makeQuad(gl);
  const look = program(gl, LOOK);
  const stirrers = new Stirrers(0x4b6177);
  const blank = makeTarget(gl, 1, 1, 'rgba8');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let fluid: Fluid | null = null;
  let ambient: Ambient | null = null;
  let level = matchMedia('(pointer: coarse)').matches || innerWidth < 700 ? 1 : 0;
  let mode: 'A' | 'B' = phase === 'B' || !floatOk ? 'B' : 'A';
  const still = phase === 'C+' || (mode === 'B' && reduced);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let aspect = 1;
  let typeTex: WebGLTexture | null = null;
  let hasType = false;
  let quiet = { a: 0.8, b: 1 };
  let t = 0;
  let reveal = 0;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let lastInput = 0;
  let disposed = false;
  const probe = { n: 0, sum: 0 };
  const pointer: Particle[] = [];
  const bursts: Particle[] = [];
  let pointerLast = { x: 0, y: 0, t: 0 };
  let burstTimes: number[] = [];

  // ---- sizing -----------------------------------------------------------------
  function resize() {
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    const nextDpr = Math.min(devicePixelRatio || 1, level >= 2 ? 1.5 : 2);
    const prevW = w;
    const prevH = h;
    const prevAspect = aspect;

    dpr = nextDpr;
    w = Math.round(cw * dpr);
    h = Math.round(ch * dpr);
    canvas.width = w;
    canvas.height = h;
    aspect = w / h;

    const sizeChanged = w !== prevW || h !== prevH;
    // The simulation grid only follows width (and orientation); height-only changes keep it.
    if (w !== prevW || prevAspect >= 1 !== aspect >= 1) {
      if (mode === 'A') fluid?.resize(aspect);
      else ambient?.resize(aspect);
    }
    if (sizeChanged || !typeTex) buildType();
    quiet = measureQuiet();
    if (h1 && import.meta.env.DEV && new URLSearchParams(location.search).has('check')) {
      void import('./typeMask').then((m) => m.checkMask(h1));
    }
  }

  function measureQuiet() {
    const els = [document.querySelector('.info'), document.querySelector('.ja')].filter(
      (e): e is HTMLElement => !!e && getComputedStyle(e).display !== 'none',
    );
    if (!els.length) return { a: 0.8, b: 1 };
    let top = Infinity;
    for (const el of els) top = Math.min(top, el.getBoundingClientRect().top);
    const H = canvas.clientHeight;
    const quietTop = Math.max(0, Math.min(H, top - 32));
    return { a: Math.max(0, (quietTop - 120) / H), b: quietTop / H };
  }

  function buildType() {
    if (!h1) return;
    const mask = buildMask(h1, canvas.clientWidth, canvas.clientHeight, dpr);
    if (!typeTex) {
      typeTex = gl!.createTexture();
      gl!.bindTexture(gl!.TEXTURE_2D, typeTex);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    }
    gl!.bindTexture(gl!.TEXTURE_2D, typeTex);
    gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    // vUv runs bottom-up, canvas rows run top-down
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, mask);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
    hasType = true;
  }

  // ---- simulation setup --------------------------------------------------------
  function buildSource() {
    if (mode === 'A' && fluid) return;
    if (mode === 'B' && ambient) return;
    fluid?.dispose();
    ambient?.dispose();
    fluid = null;
    ambient = null;
    if (mode === 'A') fluid = new Fluid(gl!, vao, aspect, LEVELS[level]!, true);
    else ambient = new Ambient(gl!, vao, aspect);
  }

  // ---- frame -------------------------------------------------------------------
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const raw = now - last;
    last = now;
    const cap = now - lastInput > 10000 ? 1000 / 30 : 1000 / 60;
    acc += raw;
    if (acc < cap - 2) return;
    const dt = Math.min(acc / 1000, 1 / 30);
    acc = 0;
    t += dt;
    reveal = Math.min(1, reveal + dt / 1.2);

    if (mode === 'A' && fluid) {
      fluid.splatVelocity([...stirrers.at(t), ...pointer], SPLAT_RADIUS);
      fluid.splatInk([...stirrers.at(t), ...pointer], SPLAT_RADIUS);
      if (bursts.length) fluid.splatInk(bursts, BURST_RADIUS);
      fluid.step(dt);
    } else if (ambient) {
      ambient.step(t);
    }
    pointer.length = 0;
    bursts.length = 0;

    draw();
    if (hasType && h1 && !h1.dataset.mask) h1.dataset.mask = 'on';
    probeFrame(raw);
  }

  function draw() {
    const dye = mode === 'A' ? fluid?.dye : ambient?.dye;
    if (!dye) return;
    gl!.useProgram(look.p);
    bind(gl!, look, 'uDye', 0, dye);
    bind(gl!, look, 'uType', 1, typeTex ?? blank.tex);
    gl!.uniform1f(look.u('uHasType'), hasType ? 1 : 0);
    gl!.uniform1f(look.u('uGrainPx'), 1.25 * dpr);
    gl!.uniform1f(look.u('uEdge'), 0.5);
    gl!.uniform1f(look.u('uSoft'), 0.12);
    gl!.uniform1f(look.u('uFringeW'), 0.04);
    gl!.uniform1f(look.u('uFringeBands'), 2);
    gl!.uniform1f(look.u('uQuietA'), quiet.a);
    gl!.uniform1f(look.u('uQuietB'), quiet.b);
    gl!.uniform1f(look.u('uReveal'), reveal);
    gl!.uniform2f(look.u('uMisreg'), (4 * dpr) / Math.max(1, w), 0);
    pass(gl!, vao, look, null, w, h);
  }

  function probeFrame(raw: number) {
    if (mode !== 'A' || still) return;
    probe.n++;
    probe.sum += raw;
    if (probe.n < 45) return;
    const avg = probe.sum / probe.n;
    probe.n = 0;
    probe.sum = 0;
    if (avg <= 24) return;
    if (level < LEVELS.length - 1) {
      level++;
      resize();
      buildSource();
    } else {
      mode = 'B';
      buildSource();
      draw();
    }
  }

  // ---- lifecycle ---------------------------------------------------------------
  function play() {
    if (disposed) return;
    if (running) return;
    running = true;
    if (still) {
      warm();
      draw();
      if (hasType && h1 && !h1.dataset.mask) h1.dataset.mask = 'on';
      running = false;
      return;
    }
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
    if (mode === 'A') lastInput = performance.now() - 9000;
  }

  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // A still has no loop, so the composition is warmed before its one frame.
  function warm() {
    if (mode === 'A' && fluid) {
      // shortcut: fixed step count instead of the full choreography, tune if the still looks empty
      for (let i = 0; i < 40; i++) {
        t += 1 / 30;
        fluid.splatVelocity(stirrers.at(t), SPLAT_RADIUS);
        fluid.splatInk(stirrers.at(t), SPLAT_RADIUS);
        fluid.step(1 / 30);
      }
    } else if (ambient) {
      ambient.step(3);
    }
    reveal = 1;
  }

  function destroy() {
    disposed = true;
    pause();
    removeListeners();
    fluid?.dispose();
    ambient?.dispose();
    if (typeTex) gl!.deleteTexture(typeTex);
    freeTarget(gl!, blank);
    toStatic(canvas);
  }

  // ---- input -------------------------------------------------------------------
  const isUi = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest('form, button, input, a, label');

  const toUv = (e: PointerEvent) => ({
    x: e.clientX / Math.max(1, canvas.clientWidth),
    y: 1 - e.clientY / Math.max(1, canvas.clientHeight),
  });

  function onMove(e: PointerEvent) {
    if (isUi(e.target) || mode !== 'A') return;
    lastInput = performance.now();
    const { x, y } = toUv(e);
    const dt = Math.max(0.008, (e.timeStamp - pointerLast.t) / 1000);
    const dx = Math.max(-2, Math.min(2, ((x - pointerLast.x) / dt) * 0.15));
    const dy = Math.max(-2, Math.min(2, ((y - pointerLast.y) / dt) * 0.15));
    pointerLast = { x, y, t: e.timeStamp };
    if (pointerLast.t === 0) return;
    if (Math.abs(dx) + Math.abs(dy) < 0.02) return;
    pointer.push({ x, y, dx, dy, shu: 0, sumi: 0 });
    if (pointer.length > 6) pointer.shift();
  }

  function onDown(e: PointerEvent) {
    if (isUi(e.target) || mode !== 'A') return;
    lastInput = performance.now();
    const now = performance.now();
    burstTimes = burstTimes.filter((s) => now - s < 1000);
    if (burstTimes.length >= 4) return;
    burstTimes.push(now);
    const { x, y } = toUv(e);
    bursts.push({ x, y, dx: 0, dy: 0, shu: 0.9, sumi: 0 });
  }

  const onVisibility = () => (document.hidden ? pause() : motion.playing && play());
  const onLost = () => {
    pause();
    if (h1) delete h1.dataset.mask;
    toStatic(canvas);
    canvas.addEventListener(
      'webglcontextrestored',
      () => {
        if (h1) delete h1.dataset.mask;
        hasType = false;
        buildType();
        buildSource();
        if (motion.playing) play();
      },
      { once: true },
    );
  };

  function addListeners() {
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('webglcontextlost', onLost as EventListener);
    let debounce = 0;
    window.addEventListener('resize', () => {
      clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        resize();
        draw();
      }, 150);
    });
    window.addEventListener('orientationchange', () => {
      clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        resize();
        draw();
      }, 150);
    });
  }

  function removeListeners() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  // ---- boot --------------------------------------------------------------------
  addListeners();
  resize();
  buildType();
  buildSource();
  motion.onChange((playing) => (playing ? play() : pause()));
  document.fonts.ready.then(() => {
    if (disposed) return;
    resize();
    buildType();
    draw();
  });
  if (motion.playing) play();
  else {
    // reduced motion: leave the paper as it is until the visitor asks for motion
    draw();
  }

  return { destroy };
}

function toStatic(canvas: HTMLCanvasElement) {
  canvas.remove();
  const h1 = document.querySelector<HTMLElement>('h1');
  if (h1) delete h1.dataset.mask;
}
