export type Motion = {
  playing: boolean;
  set(playing: boolean): void;
  onChange(cb: (playing: boolean) => void): void;
};

export function initMotion(): Motion {
  const btn = document.getElementById('motion') as HTMLButtonElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !reduced.matches;
  const listeners: ((p: boolean) => void)[] = [];

  const render = () => {
    btn.textContent = playing ? 'Pause motion' : 'Play motion';
    btn.setAttribute('aria-pressed', String(!playing));
  };

  const set = (v: boolean) => {
    if (v === playing) return;
    playing = v;
    render();
    for (const cb of listeners) cb(v);
  };

  btn.addEventListener('click', () => set(!playing));
  reduced.addEventListener('change', () => set(!reduced.matches));
  render();

  return {
    get playing() {
      return playing;
    },
    set,
    onChange(cb) {
      listeners.push(cb);
    },
  };
}
