import { bind, freeTarget, makeTarget, pass, program, type Kind, type Prog, type Target } from '../gl';
import { ADVECT, AMBIENT, CURL, DIV, GRAD, PRESS, SPLAT_INK, SPLAT_VEL, VORT } from './shaders';

export type Particle = { x: number; y: number; dx: number; dy: number; shu: number; sumi: number };
export type Level = { vel: number; dye: number; iters: number };

export const LEVELS: Level[] = [
  { vel: 128, dye: 512, iters: 20 },
  { vel: 96, dye: 384, iters: 12 },
  { vel: 64, dye: 256, iters: 8 },
];

const MAX = 8;

export class Fluid {
  private velA!: Target;
  private velB!: Target;
  private dyeA!: Target;
  private dyeB!: Target;
  private curlT!: Target;
  private divT!: Target;
  private pA!: Target;
  private pB!: Target;
  private velW = 0;
  private velH = 0;
  private readonly progSplatVel: Prog;
  private readonly progSplatInk: Prog;
  private readonly curl: Prog;
  private readonly vort: Prog;
  private readonly div: Prog;
  private readonly press: Prog;
  private readonly grad: Prog;
  private readonly advect: Prog;
  private readonly useFloat: boolean;

  constructor(
    private gl: WebGL2RenderingContext,
    private vao: WebGLVertexArrayObject,
    private aspect: number,
    private level: Level,
    floatTargets: boolean,
  ) {
    this.useFloat = floatTargets;
    this.progSplatVel = program(gl, SPLAT_VEL);
    this.progSplatInk = program(gl, SPLAT_INK);
    this.curl = program(gl, CURL);
    this.vort = program(gl, VORT);
    this.div = program(gl, DIV);
    this.press = program(gl, PRESS);
    this.grad = program(gl, GRAD);
    this.advect = program(gl, ADVECT);
    this.alloc();
  }

  private alloc() {
    const gl = this.gl;
    this.free();
    const v = grid(this.level.vel, this.aspect);
    const d = grid(this.level.dye, this.aspect);
    this.velW = v.w;
    this.velH = v.h;
    const dyeKind: Kind = this.useFloat ? 'rgba16f' : 'rgba8';
    this.velA = makeTarget(gl, v.w, v.h, 'rg16f');
    this.velB = makeTarget(gl, v.w, v.h, 'rg16f');
    this.curlT = makeTarget(gl, v.w, v.h, 'r16f');
    this.divT = makeTarget(gl, v.w, v.h, 'r16f');
    this.pA = makeTarget(gl, v.w, v.h, 'r16f');
    this.pB = makeTarget(gl, v.w, v.h, 'r16f');
    this.dyeA = makeTarget(gl, d.w, d.h, dyeKind);
    this.dyeB = makeTarget(gl, d.w, d.h, dyeKind);
  }

  private free() {
    for (const t of [this.velA, this.velB, this.dyeA, this.dyeB, this.curlT, this.divT, this.pA, this.pB]) {
      if (t) freeTarget(this.gl, t);
    }
  }

  resize(aspect: number) {
    this.aspect = aspect;
    this.alloc();
  }

  get dye(): WebGLTexture {
    return this.dyeA.tex;
  }

  splatVelocity(list: Particle[], radius: number) {
    this.splat(this.progSplatVel, this.velA, this.velB, list, radius, false);
  }

  splatInk(list: Particle[], radius: number) {
    this.splat(this.progSplatInk, this.dyeA, this.dyeB, list, radius, true);
  }

  private splat(prog: Prog, from: Target, to: Target, list: Particle[], radius: number, ink: boolean) {
    if (!list.length) return;
    const gl = this.gl;
    const n = Math.min(list.length, MAX);
    const splat = new Float32Array(MAX * 4);
    const inkv = new Float32Array(MAX * 4);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      splat.set([p.x, p.y, p.dx, p.dy], i * 4);
      inkv.set([p.shu, p.sumi, 0, 0], i * 4);
    }
    gl.useProgram(prog.p);
    bind(gl, prog, 'uTarget', 0, from.tex);
    gl.uniform2f(prog.u('uAspect'), Math.max(this.aspect, 1), Math.max(1 / this.aspect, 1));
    gl.uniform4fv(prog.u('uSplat'), splat);
    if (ink) gl.uniform4fv(prog.u('uInk'), inkv);
    gl.uniform1i(prog.u('uCount'), n);
    gl.uniform1f(prog.u('uRadius'), radius);
    pass(gl, this.vao, prog, to, 0, 0);
    this.swap(from, to, ink);
  }

  private swap(from: Target, to: Target, ink: boolean) {
    void from;
    void to;
    if (ink) {
      const t = this.dyeA;
      this.dyeA = this.dyeB;
      this.dyeB = t;
    } else {
      const t = this.velA;
      this.velA = this.velB;
      this.velB = t;
    }
  }

  step(dt: number) {
    const gl = this.gl;
    const tx = 1 / this.velW;
    const ty = 1 / this.velH;
    const texel = [tx, ty] as const;

    // curl
    gl.useProgram(this.curl.p);
    bind(gl, this.curl, 'uVel', 0, this.velA.tex);
    gl.uniform2f(this.curl.u('uTexel'), texel[0], texel[1]);
    pass(gl, this.vao, this.curl, this.curlT, 0, 0);

    // vorticity confinement
    gl.useProgram(this.vort.p);
    bind(gl, this.vort, 'uVel', 0, this.velA.tex);
    bind(gl, this.vort, 'uCurl', 1, this.curlT.tex);
    gl.uniform2f(this.vort.u('uTexel'), texel[0], texel[1]);
    gl.uniform1f(this.vort.u('uStrength'), 24);
    gl.uniform1f(this.vort.u('uDt'), dt);
    pass(gl, this.vao, this.vort, this.velB, 0, 0);
    this.swap(this.velA, this.velB, false);

    // divergence
    gl.useProgram(this.div.p);
    bind(gl, this.div, 'uVel', 0, this.velA.tex);
    gl.uniform2f(this.div.u('uTexel'), texel[0], texel[1]);
    pass(gl, this.vao, this.div, this.divT, 0, 0);

    // pressure: shortcut: no warm start, so it costs the full iteration count every frame
    gl.useProgram(this.press.p);
    gl.uniform2f(this.press.u('uTexel'), texel[0], texel[1]);
    bind(gl, this.press, 'uDiv', 1, this.divT.tex);
    for (let i = 0; i < this.level.iters; i++) {
      bind(gl, this.press, 'uPressure', 0, this.pA.tex);
      pass(gl, this.vao, this.press, this.pB, 0, 0);
      const t = this.pA;
      this.pA = this.pB;
      this.pB = t;
    }

    // subtract gradient
    gl.useProgram(this.grad.p);
    bind(gl, this.grad, 'uPressure', 0, this.pA.tex);
    bind(gl, this.grad, 'uVel', 1, this.velA.tex);
    gl.uniform2f(this.grad.u('uTexel'), texel[0], texel[1]);
    pass(gl, this.vao, this.grad, this.velB, 0, 0);
    this.swap(this.velA, this.velB, false);

    // advect velocity, then dye
    gl.useProgram(this.advect.p);
    gl.uniform1f(this.advect.u('uDt'), dt);
    bind(gl, this.advect, 'uVel', 0, this.velA.tex);
    bind(gl, this.advect, 'uSource', 1, this.velA.tex);
    gl.uniform1f(this.advect.u('uDissipation'), 0.14);
    pass(gl, this.vao, this.advect, this.velB, 0, 0);
    this.swap(this.velA, this.velB, false);

    bind(gl, this.advect, 'uVel', 0, this.velA.tex);
    bind(gl, this.advect, 'uSource', 1, this.dyeA.tex);
    gl.uniform1f(this.advect.u('uDissipation'), 0.18);
    pass(gl, this.vao, this.advect, this.dyeB, 0, 0);
    this.swap(this.dyeA, this.dyeB, true);
  }

  dispose() {
    this.free();
  }
}

/** Tier B: dye without simulation state. */
export class Ambient {
  private prog: Prog;
  private target!: Target;
  private readonly kind: Kind;

  constructor(
    private gl: WebGL2RenderingContext,
    private vao: WebGLVertexArrayObject,
    private aspect: number,
  ) {
    this.prog = program(gl, AMBIENT);
    this.kind = 'rgba8';
    this.resize(aspect);
  }

  resize(aspect: number) {
    this.aspect = aspect;
    if (this.target) freeTarget(this.gl, this.target);
    const d = grid(360, aspect);
    this.target = makeTarget(this.gl, d.w, d.h, this.kind);
  }

  get dye(): WebGLTexture {
    return this.target.tex;
  }

  step(time: number) {
    const gl = this.gl;
    gl.useProgram(this.prog.p);
    gl.uniform1f(this.prog.u('uTime'), time);
    gl.uniform2f(this.prog.u('uAspect'), Math.max(this.aspect, 1), 1);
    pass(gl, this.vao, this.prog, this.target, 0, 0);
  }

  dispose() {
    freeTarget(this.gl, this.target);
  }
}

function grid(shortSide: number, aspect: number) {
  return aspect >= 1
    ? { w: Math.round(shortSide * aspect), h: shortSide }
    : { w: shortSide, h: Math.round(shortSide / aspect) };
}
