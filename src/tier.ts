export type Tier = 'A' | 'B' | 'C+' | 'C';

export function chooseTier(): Tier {
  // Dev builds can force a tier with ?tier=a|b|c+|c (acceptance check 9).
  const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get('tier') : null;
  if (forced && ['a', 'b', 'c+', 'c'].includes(forced)) return forced.toUpperCase() as Tier;

  if (matchMedia('(forced-colors: active)').matches) return 'C';
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return 'C';

  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) return 'C';
  const halfFloat = !!probe.getExtension('EXT_color_buffer_float');
  probe.getExtension('WEBGL_lose_context')?.loseContext();

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return halfFloat ? 'C+' : 'B';
  return halfFloat ? 'A' : 'B';
}
