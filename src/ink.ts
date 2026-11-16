/**
 * Three non-periodic ink masses, drawn in one pass.
 *
 * Each mass is a spine with a wobble and an elliptical width profile, so the
 * widths are unequal by construction (never evenly spaced bands). Masses shrink
 * to a point before they reach the text, which keeps the quiet zone at zero ink
 * without an alpha fade, gradient or blur. One red ribbon rides just outside the
 * widest mass's edge, like a misregistered plate.
 */

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;      // canvas device px
uniform float uS;       // min(uRes.x, uRes.y)
uniform float uTime;
uniform vec4 uQuiet;    // x, y, w, h in q units, y up
uniform vec2 uCenter;   // centre of the free area, q units
uniform vec2 uDir;      // base flow direction, unit
uniform vec3 uW;        // half widths
uniform vec3 uOff;      // spine offsets across the flow
uniform vec3 uAng;      // per-mass direction offset, radians
uniform vec3 uPh;       // per-mass phase
uniform vec3 uLen;      // half length of each spine
uniform float uRetract; // taper length before the quiet zone
uniform float uGap;     // red ribbon gap, q units
uniform float uRedW;    // red ribbon width, q units
uniform float uPx;      // one device px in q units

const vec3 PAPER = vec3(1.0);
const vec3 INK = vec3(0.0);
const vec3 SHU = vec3(0.9098039, 0.0, 0.1098039);

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

float sdBox(vec2 p, vec2 c, vec2 h) {
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Signed distance to one mass: negative inside. hw reports the local half
// width so hair-thin tips can be dropped instead of drawn as a grey thread.
float sdMass(vec2 q, float ang, float off, float w, float ph, float len, out float hw) {
  vec2 dir = rot(uDir, ang);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 p = q - uCenter;
  float u = dot(p, dir) + len * 0.08 * sin(uTime * 0.09 + ph);
  float v = dot(p, nrm) - off;
  // low-frequency waddle: centre and width both move slowly along the spine
  v -= 0.55 * w * sin(u * 1.45 + ph);
  v -= 0.22 * w * sin(u * 3.05 - ph * 1.6);
  float ell = clamp(abs(u) / len, 0.0, 1.0);
  float taper = (0.80 + 0.20 * (1.0 - ell)) * pow(max(0.0, 1.0 - pow(ell, 4.0)), 0.35);
  hw = w * taper;
  return abs(v) - hw;
}

float sdMassRaw(vec2 q, float ang, float off, float w, float ph, float len, out float hw) {
  vec2 dir = rot(uDir, ang);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 p = q - uCenter;
  float u = dot(p, dir) + len * 0.08 * sin(uTime * 0.09 + ph);
  float v = dot(p, nrm) - off;
  v -= 0.55 * w * sin(u * 1.45 + ph);
  v -= 0.22 * w * sin(u * 3.05 - ph * 1.6);
  float ell = clamp(abs(u) / len, 0.0, 1.0);
  float taper = (0.80 + 0.20 * (1.0 - ell)) * pow(max(0.0, 1.0 - pow(ell, 4.0)), 0.35);
  hw = w * taper;
  return v - hw;
}

void main() {
  vec2 q = vUv * uRes / uS;

  // The text block is untouchable: no ink, no red, at any time.
  float dq = sdBox(q, uQuiet.xy + uQuiet.zw * 0.5, uQuiet.zw * 0.5);
  float k = max(smoothstep(0.0, uRetract, dq), 0.004);

  float hw0, hw1, hw2;
  float d0 = sdMass(q, uAng.x, uOff.x, uW.x, uPh.x, uLen.x, hw0) / k;
  float d1 = sdMass(q, uAng.y, uOff.y, uW.y, uPh.y, uLen.y, hw1) / k;
  float d2 = sdMass(q, uAng.z, uOff.z, uW.z, uPh.z, uLen.z, hw2) / k;
  // Each mass is gated by its own local width, so a spine that has tapered to
  // nothing cannot be drawn as a thread.
  float aa0 = max(fwidth(d0), 1.3 * uPx);
  float aa1 = max(fwidth(d1), 1.3 * uPx);
  float aa2 = max(fwidth(d2), 1.3 * uPx);
  float g0 = smoothstep(0.8 * uPx, 2.6 * uPx, hw0);
  float g1 = smoothstep(0.8 * uPx, 2.6 * uPx, hw1);
  float g2 = smoothstep(0.8 * uPx, 2.6 * uPx, hw2);
  float ink = max(
    max((1.0 - smoothstep(-aa0, aa0, d0)) * g0, (1.0 - smoothstep(-aa1, aa1, d1)) * g1),
    (1.0 - smoothstep(-aa2, aa2, d2)) * g2);
  ink *= step(0.0, dq);

  // One solid ribbon outside the widest mass, one side only.
  float hwr;
  float side = sdMassRaw(q, uAng.x, uOff.x, uW.x, uPh.x, uLen.x, hwr) / k - uGap;
  float aaR = max(fwidth(side), 1.3 * uPx);
  float red = smoothstep(-aaR, aaR, side) * (1.0 - smoothstep(uRedW - aaR, uRedW + aaR, side));
  red *= step(0.0, dq) * smoothstep(0.8 * uPx, 2.6 * uPx, hwr) * (1.0 - ink);

  vec3 col = mix(PAPER, SHU, red);
  col = mix(col, INK, ink);
  fragColor = vec4(col, 1.0);
}
`;

export type Ink = {
  destroy(): void;
  setQuiet(x: number, y: number, w: number, h: number): void;
};

export function start(canvas: HTMLCanvasElement, still: boolean): Ink | null {
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

  const U = (n: string) => ctx.getUniformLocation(prog, n);
  const uRes = U('uRes');
  const uS = U('uS');
  const uTime = U('uTime');
  const uQuiet = U('uQuiet');
  const uCenter = U('uCenter');
  const uDir = U('uDir');
  const uW = U('uW');
  const uOff = U('uOff');
  const uAng = U('uAng');
  const uPh = U('uPh');
  const uLen = U('uLen');
  const uRetract = U('uRetract');
  const uGap = U('uGap');
  const uRedW = U('uRedW');
  const uPx = U('uPx');

  // Share of the free area the masses aim for before the quiet-zone taper.
  const INK_TARGET = 0.62;
  const quiet = { x: 0, y: 0, w: 0, h: 0 };
  let dpr = 1;
  let w = 1;
  let h = 1;

  const t0 = performance.now();
  let pausedFor = 0;
  let pausedAt = 0;
  let frozen = false;
  const clock = () => ((frozen ? pausedAt : performance.now()) - t0 - pausedFor) / 1000;

  function geometry() {
    const S = Math.min(w, h);
    const qw = w / S;
    const qh = h / S;
    const vertical = h >= w;

    // Free run: from the entry edge up to the quiet zone, where the masses stop.
    const run = vertical ? Math.max(0.3, qh - quiet.y - quiet.h) : Math.max(0.25, quiet.x);
    const cross = vertical ? qw : qh;
    const len = 1.7 * run;

    // Solve the thickness that lands the requested ink share of the viewport.
    // Calibrated against the captured frames: the masses cover roughly this
    // share of the free run once their tapering is accounted for. Narrow
    // viewports clamp first, so the clamp itself carries the calibration.
    const cssW = w / dpr;
    const COVER = 0.7;
    const clampK = cssW >= 2000 ? 0.94 : cssW >= 1280 ? 0.84 : cssW >= 1000 ? 0.74 : 0.86;
    const taperAvg = 0.78;
    const thickness = Math.min((COVER * qw * qh) / (run * taperAvg), clampK * cross);
    const shares = [0.56, 0.30, 0.14];
    const widths = shares.map((s2) => (thickness * s2) / 2);

    // The spines start just outside the entry edge, so the masses enter at full
    // width and taper only on the way toward the text.
    const out = 0.22 * run;
    ctx.uniform2f(
      uCenter,
      vertical ? qw * 0.5 : -out,
      vertical ? qh + out : qh * 0.5,
    );
    ctx.uniform2f(uDir, vertical ? 0.16 : 0.98, vertical ? -0.99 : 0.17);
    ctx.uniform3f(uW, widths[0], widths[1], widths[2]);
    ctx.uniform3f(uOff, -0.30 * cross, 0.07 * cross, 0.38 * cross);
    ctx.uniform3f(uAng, -0.34, 0.02, 0.36);
    ctx.uniform3f(uPh, 1.7, 4.1, 0.6);
    ctx.uniform3f(uLen, len, len * 0.82, len * 0.66);
    ctx.uniform1f(uRetract, Math.max(0.06 * Math.min(qw, qh), widths[0] * 0.26));
    ctx.uniform1f(uGap, Math.max(6 * dpr / S, 0.012 * Math.min(qw, qh)));
    ctx.uniform1f(uRedW, Math.max(7 * dpr / S, 0.085 * Math.min(qw, qh)));
    ctx.uniform1f(uPx, 1 / S);
  }

  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 3);
    const cw = canvas.clientWidth || innerWidth;
    const ch = canvas.clientHeight || innerHeight;
    w = Math.max(1, Math.round(cw * dpr));
    h = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.viewport(0, 0, w, h);
    ctx.uniform2f(uRes, w, h);
    ctx.uniform1f(uS, Math.min(w, h));
    ctx.uniform4f(uQuiet, quiet.x, quiet.y, quiet.w, quiet.h);
    geometry();
  }

  function draw() {
    ctx.uniform1f(uTime, clock() * (still ? 0 : 1));
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
  }

  let raf = 0;
  let running = false;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    draw();
  };
  function play() {
    if (running || still) return;
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
    play();
  }
  const onVisibility = () => (document.hidden ? freeze() : thaw());

  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    canvas.remove();
  };

  const ro = new ResizeObserver(() => {
    layout();
    draw();
  });
  ro.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onLost);

  layout();
  draw();
  play();

  return {
    setQuiet(x, y, cw, chh) {
      const S = Math.min(w, h);
      // Clip to the viewport: a box that runs past an edge must not leave a
      // sliver of unprotected page beside the text.
      const x0 = Math.max(0, x);
      const x1 = Math.min(innerWidth, x + cw);
      const y0 = Math.max(0, y);
      const y1 = Math.min(innerHeight, y + chh);
      quiet.x = (x0 * dpr) / S;
      quiet.y = ((innerHeight - y1) * dpr) / S;
      quiet.w = (Math.max(0, x1 - x0) * dpr) / S;
      quiet.h = (Math.max(0, y1 - y0) * dpr) / S;
      ctx.uniform4f(uQuiet, quiet.x, quiet.y, quiet.w, quiet.h);
      geometry();
      draw();
    },
    destroy() {
      stop();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.remove();
    },
  };
}
