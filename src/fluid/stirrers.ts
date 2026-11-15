import type { Particle } from './sim';

const cx = (i: number) => 0.30 + 0.08 * i;
const cy = (i: number) => 0.10 + 0.04 * i;

/** Seeded so a given seed always gives the same composition (used for stills). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Stirrers {
  private readonly wx: number[] = [];
  private readonly wy: number[] = [];
  private readonly px: number[] = [];
  private readonly py: number[] = [];

  constructor(seed = 1) {
    const rnd = mulberry32(seed);
    for (let i = 0; i < 3; i++) {
      // periods of 20-40 s, per PRD 9.5
      this.wx.push(((Math.PI * 2) / (20 + rnd() * 20)) * (rnd() < 0.5 ? -1 : 1));
      this.wy.push(((Math.PI * 2) / (20 + rnd() * 20)) * (rnd() < 0.5 ? -1 : 1));
      this.px.push(rnd() * Math.PI * 2);
      this.py.push(rnd() * Math.PI * 2);
    }
  }

  /** Three stirrers: sumi, shu, and velocity only. Ink stays above the quiet zone. */
  at(t: number): Particle[] {
    const out: Particle[] = [];
    for (let i = 0; i < 3; i++) {
      const x = 0.5 + cx(i) * Math.cos(this.wx[i]! * t + this.px[i]!);
      const y = 0.62 + cy(i) * Math.sin(this.wy[i]! * t + this.py[i]!);
      const dx = -cx(i) * this.wx[i]! * Math.sin(this.wx[i]! * t + this.px[i]!);
      const dy = cy(i) * this.wy[i]! * Math.cos(this.wy[i]! * t + this.py[i]!);
      const k = 2.4;
      out.push({
        x,
        y,
        dx: dx * k,
        dy: dy * k,
        shu: i === 1 ? 0.9 : 0,
        sumi: i === 0 ? 0.6 : 0,
      });
    }
    return out;
  }
}
