import data from './copy.json';

export type Lang = 'id' | 'en' | 'ja';

export type Copy = {
  title: string;
  lead: string;
  giant: string;
  body: string;
  formLead: string;
  label: string;
  button: string;
  helper: string;
  invalid: string;
  sending: string;
  success: string;
  fail: string;
};

export const COPY = data as Record<Lang, Copy>;

export function pickLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'id' || q === 'en' || q === 'ja') return q;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = (tag || '').toLowerCase().split('-')[0];
    if (base === 'ja') return 'ja';
    if (base === 'en') return 'en';
    if (base === 'id' || base === 'in') return 'id';
  }
  return 'id';
}

export function applyCopy(lang: Lang): Copy {
  const copy = COPY[lang];
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
  document.title = copy.title;
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as keyof Copy | undefined;
    if (key && copy[key]) el.textContent = copy[key];
  }
  const input = document.getElementById('email') as HTMLInputElement | null;
  const langField = document.querySelector<HTMLInputElement>('input[name="lang"]');
  if (langField) langField.value = lang;
  if (input) input.setAttribute('aria-label', copy.label);
  return copy;
}
