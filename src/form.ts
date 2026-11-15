export function initForm() {
  const form = document.getElementById('notify') as HTMLFormElement | null;
  const status = document.getElementById('status');
  if (!form || !status) return;

  const input = form.elements.namedItem('email') as HTMLInputElement;
  const honeypot = form.elements.namedItem('company') as HTMLInputElement;
  const button = form.querySelector('button')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: input.value.trim(), company: honeypot.value }),
      });
      if (res.ok) {
        status.textContent = "Done. You'll get one email when the site is back.";
        form.reset();
      } else if (res.status === 429) {
        status.textContent = 'Too many attempts. Try again in a minute.';
      } else if (res.status === 400) {
        status.textContent = "That email address isn't valid. Check it and try again.";
      } else {
        status.textContent = 'Something went wrong on our side. Try again in a few minutes.';
      }
    } catch {
      status.textContent = "Couldn't send. Check your connection and try again.";
    } finally {
      button.disabled = false;
    }
  });
}
