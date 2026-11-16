export type Tier = 'A' | 'B' | 'C';

export function chooseTier(): Tier {
  // Dev builds can force a tier with ?tier=a|b|c (acceptance check 9).
  const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get('tier') : null;
  if (forced && ['a', 'b', 'c'].includes(forced)) return forced.toUpperCase() as Tier;

  if (matchMedia('(forced-colors: active)').matches) return 'C';
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return 'C';

  const probe = document.createElement('canvas').getContext('webgl2');
  probe?.getExtension('WEBGL_lose_context')?.loseContext();
  if (!probe) return 'C';

  // B is the same painting, held as one still frame.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'B';
  return 'A';
}
