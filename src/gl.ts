import { VERT } from './fluid/shaders';

export type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
export type Prog = { p: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };
export type Kind = 'rg16f' | 'r16f' | 'rgba16f' | 'rgba8';

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

export function program(gl: WebGL2RenderingContext, frag: string): Prog {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    p,
    u(name) {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
      return cache.get(name)!;
    },
  };
}

const FORMATS: Record<Kind, [number, number, number]> = {
  rg16f: [0x822f, 0x8227, 0x140b], // RG16F, RG, HALF_FLOAT
  r16f: [0x822d, 0x1903, 0x140b], // R16F, RED, HALF_FLOAT
  rgba16f: [0x881a, 0x1908, 0x140b], // RGBA16F, RGBA, HALF_FLOAT
  rgba8: [0x8058, 0x1908, 0x1401], // RGBA8, RGBA, UNSIGNED_BYTE
};

export function makeTarget(gl: WebGL2RenderingContext, w: number, h: number, kind: Kind): Target {
  const [internal, format, type] = FORMATS[kind];
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}

export function freeTarget(gl: WebGL2RenderingContext, t: Target) {
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fbo);
}

export function makeQuad(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

export function pass(
  gl: WebGL2RenderingContext,
  vao: WebGLVertexArrayObject,
  prog: Prog,
  target: Target | null,
  w: number,
  h: number,
) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  gl.viewport(0, 0, target ? target.w : w, target ? target.h : h);
  gl.useProgram(prog.p);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function bind(gl: WebGL2RenderingContext, prog: Prog, name: string, unit: number, tex: WebGLTexture) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(prog.u(name), unit);
}

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  return canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
}
