import type { Motion } from './motionToggle';

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

/**
 * One pass, no feedback buffers, no input: a slow drifting field of contour bands.
 * Everything here is a pure function of time and position, so a given second always
 * looks the same and coverage cannot drift away from its threshold.
 */
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uTh;
uniform float uFade;

const vec3 PAPER = vec3(1.0);
const vec3 INK = vec3(0.0);
const vec3 SHU = vec3(0.9098039, 0.0, 0.1098039);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(11.3, 7.7); a *= 0.5; }
  return s;
}

void main() {
  float aspect = uRes.x / max(1.0, uRes.y);
  vec2 q = vec2(vUv.x * aspect, vUv.y);

  // A single flow direction. The field only travels along it, so forms stay laminar.
  float along = dot(q, vec2(0.940, -0.342));
  float across = dot(q, vec2(0.342, 0.940));
  float t = uTime;

  // 0.0088 units/s along a 900 CSS px tall region is under 20 CSS px/s.
  float a0 = along - t * 0.0088;
  float c0 = across + t * 0.0038;

  // Low-frequency warp: no eddies smaller than a quarter of the short side.
  float w1 = fbm(vec2(a0 * 1.05, c0 * 0.30));
  float w2 = fbm(vec2(a0 * 2.10, c0 * 0.55) + 5.7);
  // Drifting contour bands: one flow direction; the warp runs along the bands,
  // so each form meanders like ink on water instead of ruling straight stripes.
  float band = sin(6.2831853 * (c0 * 2.45 + 0.80 * (w1 - 0.5) + 0.26 * (w2 - 0.5)));

  float aa = max(fwidth(band) * 0.45, 0.0012);
  float ink = smoothstep(uTh - aa, uTh + aa, band);

  // One red filament per 34s cycle: it slides along a contour and bleeds in from the left edge.
  float phase = fract(t / 34.0);
  float gate = smoothstep(0.02, 0.12, phase) * (1.0 - smoothstep(0.24, 0.38, phase));
  float level = uTh + 0.055 - 0.11 * smoothstep(0.0, 0.34, phase);
  float front = 1.0 - smoothstep(-0.05 + 1.15 * smoothstep(0.06, 0.30, phase) - 0.10, -0.05 + 1.15 * smoothstep(0.06, 0.30, phase) + 0.02, vUv.x);
  float red = (1.0 - smoothstep(0.080, 0.080 + aa * 2.0, abs(band - level))) * gate * front;

  // Paper is solid where the text lives; the ink feathers out above it.
  float fade = smoothstep(0.0, uFade, vUv.y);

  vec3 col = mix(PAPER, INK, ink * fade);
  col = mix(col, SHU, red * fade);
  fragColor = vec4(col, 1.0);
}
`;

const THRESHOLD = -0.25;
const FEATHER_CSS = 28;
const MAX_DPR = 3;

export function start(canvas: HTMLCanvasElement, motion: Motion) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!gl) {
    canvas.remove();
    return null;
  }
  const ctx = gl;

  const compile = (type: number, src: string) => {
    const s = ctx.createShader(type);
    if (!s) return null;
    ctx.shaderSource(s, src);
    ctx.compileShader(s);
    if (ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) return s;
    console.error('[ink] shader', ctx.getShaderInfoLog(s));
    return null;
  };

  const vs = compile(ctx.VERTEX_SHADER, VERT);
  const fs = compile(ctx.FRAGMENT_SHADER, FRAG);
  const prog = ctx.createProgram();
  if (!vs || !fs || !prog) {
    canvas.remove();
    return null;
  }
  ctx.attachShader(prog, vs);
  ctx.attachShader(prog, fs);
  ctx.linkProgram(prog);
  if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) {
    console.error('[ink] link', ctx.getProgramInfoLog(prog));
    canvas.remove();
    return null;
  }
  ctx.useProgram(prog);

  const buf = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
  const aPos = ctx.getAttribLocation(prog, 'aPos');
  ctx.enableVertexAttribArray(aPos);
  ctx.vertexAttribPointer(aPos, 2, ctx.FLOAT, false, 0, 0);

  const uRes = ctx.getUniformLocation(prog, 'uRes');
  const uTime = ctx.getUniformLocation(prog, 'uTime');
  const uTh = ctx.getUniformLocation(prog, 'uTh');
  const uFade = ctx.getUniformLocation(prog, 'uFade');

  // The clock only advances while the ink is actually on screen.
  let t0 = performance.now();
  let pausedFor = 0;
  let pausedAt = 0;
  let frozen = false;
  const clock = () => ((frozen ? pausedAt : performance.now()) - t0 - pausedFor) / 1000;

  const dpr = () => Math.min(devicePixelRatio || 1, MAX_DPR);

  function resize() {
    const ratio = dpr();
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.viewport(0, 0, w, h);
  }

  function draw() {
    ctx.uniform2f(uRes, canvas.width, canvas.height);
    ctx.uniform1f(uTime, clock());
    ctx.uniform1f(uTh, THRESHOLD);
    ctx.uniform1f(uFade, Math.min(0.1, (FEATHER_CSS * dpr()) / Math.max(1, canvas.height)));
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
  }

  let raf = 0;
  let running = false;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    draw();
  };

  function play() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function freeze() {
    if (frozen) return;
    frozen = true;
    pausedAt = performance.now();
    stop();
  }

  function thaw() {
    if (!frozen) return;
    frozen = false;
    pausedFor += performance.now() - pausedAt;
    pausedAt = 0;
    if (motion.playing) play();
  }

  const onVisibility = () => (document.hidden ? freeze() : thaw());

  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    canvas.remove();
  };

  const ro = new ResizeObserver(() => {
    resize();
    draw();
  });
  ro.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onLost);

  motion.onChange((playing) => (playing ? (frozen ? thaw() : play()) : freeze()));

  resize();
  draw();
  if (motion.playing) play();

  return {
    destroy() {
      stop();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.remove();
    },
  };
}
