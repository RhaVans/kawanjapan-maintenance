import type { Copy, Lang } from './copy';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type State = 'idle' | 'invalid' | 'sending' | 'success' | 'fail';

export function initForm(lang: Lang, copy: Copy) {
  const form = document.getElementById('notify') as HTMLFormElement | null;
  const input = document.getElementById('email') as HTMLInputElement | null;
  const status = document.getElementById('email-status');
  const wrap = form?.parentElement ?? null;
  const button = form?.querySelector('button');
  if (!form || !input || !status || !wrap || !button) return;

  const setState = (state: State, message = '') => {
    form.dataset.state = state;
    status.textContent = message;
    button.disabled = state === 'sending';
    button.textContent = state === 'sending' ? copy.sending : copy.button;
    input.setAttribute('aria-invalid', state === 'invalid' ? 'true' : 'false');
  };

  const done = () => {
    // Freeze the block before swapping: the confirmation is shorter than the
    // form, and the text block sits on the bottom edge, so the art would shift.
    wrap.style.minHeight = `${Math.ceil(wrap.getBoundingClientRect().height)}px`;
    const p = document.createElement('p');
    p.className = 'notify-done';
    p.setAttribute('role', 'status');
    p.setAttribute('aria-live', 'polite');
    p.textContent = copy.success;
    form.replaceWith(p);
  };

  // Server answered ?ok=1 in the no-JS path, and JS is running after all.
  if (new URLSearchParams(location.search).get('ok') === '1') {
    done();
    return;
  }

  input.addEventListener('input', () => {
    if (form.dataset.state === 'invalid') setState('idle');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim().toLowerCase();
    input.value = email;
    if (!email || email.length > 254 || !EMAIL.test(email)) {
      setState('invalid', copy.invalid);
      input.focus();
      return;
    }
    setState('sending');
    status.textContent = '';
    try {
      const body = new FormData(form);
      body.set('email', email);
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          email,
          lang,
          ts: Number(body.get('ts') ?? 0),
          hp: String(body.get('hp') ?? ''),
        }),
      });
      if (res.ok) {
        done();
        return;
      }
      // Only a rejected address is the visitor's problem; a dwell rejection or
      // a rate limit is not, so those read as a retry instead.
      const why = await res.json().catch(() => ({}) as { error?: string });
      if (res.status === 400 && (why as { error?: string }).error === 'invalid') {
        setState('invalid', copy.invalid);
        input.focus();
        return;
      }
      setState('fail', copy.fail);
    } catch {
      setState('fail', copy.fail);
    }
  });
}
