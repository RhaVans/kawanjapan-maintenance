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
    status.textContent = 'Mengirim…';
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: input.value.trim(), company: honeypot.value }),
      });
      if (res.ok) {
        status.textContent = 'Selesai. Anda akan menerima satu email saat situs kembali.';
        form.reset();
      } else if (res.status === 429) {
        status.textContent = 'Terlalu banyak percobaan. Coba lagi dalam satu menit.';
      } else if (res.status === 400) {
        status.textContent = 'Alamat email tidak valid. Periksa lalu coba lagi.';
      } else {
        status.textContent = 'Terjadi kesalahan di sisi kami. Coba lagi beberapa menit lagi.';
      }
    } catch {
      status.textContent = 'Gagal mengirim. Periksa koneksi Anda lalu coba lagi.';
    } finally {
      button.disabled = false;
    }
  });
}
