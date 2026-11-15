export const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
`;

export const SPLAT_VEL = `${HEAD}
uniform sampler2D uTarget;
uniform vec2 uAspect;
uniform vec4 uSplat[8];
uniform int uCount;
uniform float uRadius;
void main() {
  vec4 v = texture(uTarget, vUv);
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec2 d = (vUv - uSplat[i].xy) * uAspect;
    v.xy += uSplat[i].zw * exp(-dot(d, d) / uRadius);
  }
  fragColor = v;
}`;

export const SPLAT_INK = `${HEAD}
uniform sampler2D uTarget;
uniform vec2 uAspect;
uniform vec4 uSplat[8];
uniform vec4 uInk[8];
uniform int uCount;
uniform float uRadius;
void main() {
  vec4 v = texture(uTarget, vUv);
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec2 d = (vUv - uSplat[i].xy) * uAspect;
    v.rg += uInk[i].rg * exp(-dot(d, d) / uRadius);
  }
  fragColor = v;
}`;

export const CURL = `${HEAD}
uniform sampler2D uVel;
uniform vec2 uTexel;
void main() {
  float l = texture(uVel, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVel, vUv + vec2(uTexel.x, 0.0)).y;
  float b = texture(uVel, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uVel, vUv + vec2(0.0, uTexel.y)).x;
  fragColor = vec4(0.5 * ((r - l) - (t - b)), 0.0, 0.0, 1.0);
}`;

export const VORT = `${HEAD}
uniform sampler2D uVel;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uStrength;
uniform float uDt;
void main() {
  float l = abs(texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x);
  float r = abs(texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x);
  float b = abs(texture(uCurl, vUv - vec2(0.0, uTexel.y)).x);
  float t = abs(texture(uCurl, vUv + vec2(0.0, uTexel.y)).x);
  float c = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(t - b, r - l);
  f /= length(f) + 1e-4;
  f *= uStrength * c;
  f.y *= -1.0;
  vec2 v = texture(uVel, vUv).xy + f * uDt;
  fragColor = vec4(v, 0.0, 1.0);
}`;

export const DIV = `${HEAD}
uniform sampler2D uVel;
uniform vec2 uTexel;
void main() {
  float l = texture(uVel, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVel, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uVel, vUv - vec2(0.0, uTexel.y)).y;
  float t = texture(uVel, vUv + vec2(0.0, uTexel.y)).y;
  fragColor = vec4(0.5 * ((r - l) + (t - b)), 0.0, 0.0, 1.0);
}`;

export const PRESS = `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uDiv;
uniform vec2 uTexel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float d = texture(uDiv, vUv).x;
  fragColor = vec4((l + r + b + t - d) * 0.25, 0.0, 0.0, 1.0);
}`;

export const GRAD = `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uVel;
uniform vec2 uTexel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 v = texture(uVel, vUv).xy - 0.5 * vec2(r - l, t - b);
  fragColor = vec4(v, 0.0, 1.0);
}`;

export const ADVECT = `${HEAD}
uniform sampler2D uVel;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 coord = clamp(vUv - uDt * texture(uVel, vUv).xy, 0.0, 1.0);
  fragColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
}`;

// Tier B: same dye channels, no simulation state.
export const AMBIENT = `${HEAD}
uniform float uTime;
uniform vec2 uAspect;
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return s;
}
void main() {
  vec2 p = vec2(vUv.x * uAspect.x, vUv.y) * 2.4;
  float t = uTime * 0.05;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float n = fbm(p + q * 2.2 + vec2(0.0, t * 0.4));
  float sumi = smoothstep(0.40, 0.60, n);
  float shu = smoothstep(0.48, 0.62, fbm(p * 1.35 + q * 1.6 + 11.0));
  fragColor = vec4(shu * 0.95, sumi, 0.0, 1.0);
}`;

// The look pass: two inks, three flat colours, grain as the only gradient.
export const LOOK = `${HEAD}
uniform sampler2D uDye;
uniform sampler2D uType;
uniform float uHasType;
uniform float uGrainPx;
uniform float uEdge;
uniform float uSoft;
uniform float uFringeW;
uniform float uFringeBands;
uniform float uQuietA;
uniform float uQuietB;
uniform float uReveal;
uniform vec2 uMisreg;

const vec3 SUMI = vec3(0.0);
const vec3 PAPER = vec3(1.0);
const vec3 SHU = vec3(0.9098, 0.0, 0.1098);

void main() {
  vec2 cell = floor(gl_FragCoord.xy / uGrainPx);
  float n1 = hash(cell);
  float n2 = hash(cell + 17.0);

  float f = 1.0 - vUv.y;
  float quiet = smoothstep(uQuietA, uQuietB, f);

  float sumi = texture(uDye, vUv).g * (1.0 - quiet) * uReveal;
  float shu = texture(uDye, vUv + uMisreg).r * (1.0 - quiet) * uReveal;

  bool isSumi = sumi > uEdge + (n1 - 0.5) * uSoft;

  float d = (uEdge - sumi) / uFringeW;
  bool rim = d > 0.0 && d < uFringeBands && mod(floor(d), 2.0) == 0.0;
  bool isShu = rim || (!isSumi && shu > uEdge + (n2 - 0.5) * uSoft);

  vec3 col = isSumi ? SUMI : (isShu ? SHU : PAPER);

  float m = texture(uType, vUv).a * uHasType;
  bool onInk = sumi > uEdge || shu > uEdge;
  col = mix(col, onInk ? PAPER : SUMI, m);

  fragColor = vec4(col, 1.0);
}`;
