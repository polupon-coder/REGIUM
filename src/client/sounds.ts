// Sonidos de REGIUM (los mismos de Héroes e Imperio, sin la música). Se pueden silenciar.
const KEY = 'regium:mudo';
const FILE = {
  boton: 'boton.wav',
  ficha: 'ficha.wav',
  turno: 'turno.wav',
  batalla: 'batalla.mp3',
  celebracion: 'celebracion.mp3',
  derrota: 'derrota.mp3',
  victoria: 'victoria.mp3',
  construir: 'construir.mp3',
  fe: 'fe.mp3',
  destruccion: 'destruccion.mp3',
  conquista: 'conquista.mp3',
  rugido: 'rugido.mp3',
  risa: 'risa.mp3',
} as const;
export type Sound = keyof typeof FILE;
// Volúmenes igualados (los mismos que en Héroes)
const VOLUME: Partial<Record<Sound, number>> = {
  fe: 0.36, destruccion: 0.29, derrota: 0.32, construir: 0.63, batalla: 0.76, celebracion: 0.43,
  victoria: 0.8, conquista: 1, rugido: 0.6, risa: 0.55,
};

const cache = new Map<Sound, HTMLAudioElement>();
let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  /* sin almacenamiento */
}

export function play(name: Sound, delay = 0) {
  if (muted) return;
  const go = () => {
    let base = cache.get(name);
    if (!base) {
      base = new Audio(`/sonidos/${FILE[name]}`);
      cache.set(name, base);
    }
    const a = base.cloneNode() as HTMLAudioElement;
    a.volume = VOLUME[name] ?? 0.8;
    a.play().catch(() => {});
  };
  if (delay) setTimeout(go, delay);
  else go();
}

export const isMuted = () => muted;
export function toggleMuted() {
  muted = !muted;
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    /* nada */
  }
  return muted;
}

// Toque corto al pulsar cualquier botón
if (typeof document !== 'undefined')
  document.addEventListener(
    'click',
    (e) => {
      const b = (e.target as HTMLElement).closest?.('button');
      if (b && !b.disabled && !b.classList.contains('silent')) play('boton');
    },
    true,
  );
