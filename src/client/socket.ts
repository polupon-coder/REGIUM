import { io } from 'socket.io-client';
import type { PublicRoom } from '../server/rooms';
import { trError } from './i18n';

export type { PublicRoom };
export const socket = io({ transports: ['websocket', 'polling'], autoConnect: false });

export interface Reply {
  ok: boolean;
  error?: string;
  code?: string;
  token?: string;
  playerId?: number;
}

export const call = (event: string, data?: unknown) =>
  new Promise<Reply>((resolve) => {
    if (!socket.connected) socket.connect();
    socket.emit(event, data, (r: Reply) => resolve(r.error ? { ...r, error: trError(r.error) } : r));
  });

const KEY = 'regium:sessions';
type Sessions = Record<string, string>;

/**
 * Cada pestaña recuerda su propio jugador (sessionStorage), para poder probar con varias pestañas.
 * localStorage guarda la última sesión como respaldo, para volver tras cerrar el navegador.
 */
function read(store: Storage): Sessions {
  try {
    return JSON.parse(store.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
export const tabSessions = (): Sessions => read(sessionStorage);
export function loadSessions(): Sessions {
  return { ...read(localStorage), ...read(sessionStorage) };
}
export function saveSession(code: string, token: string) {
  for (const store of [sessionStorage, localStorage]) {
    try {
      store.setItem(KEY, JSON.stringify({ ...read(store), [code]: token }));
      store.setItem('regium:last', code);
    } catch {
      /* sin almacenamiento */
    }
  }
}
export function forgetSession(code: string, keepToken = false) {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const s = read(store);
      if (!keepToken) delete s[code];
      store.setItem(KEY, JSON.stringify(s));
      store.removeItem('regium:last');
    } catch {
      /* sin almacenamiento */
    }
  }
}
export const lastCode = () => {
  try {
    return sessionStorage.getItem('regium:last') ?? localStorage.getItem('regium:last');
  } catch {
    return null;
  }
};
