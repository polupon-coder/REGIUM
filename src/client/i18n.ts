// Idioma de la interfaz: español o inglés. Se guarda en el navegador; al cambiarlo se recarga la página.
import { REINO_INFO, nameEn, type Reino } from '../engine';

export type Lang = 'es' | 'en';
const KEY = 'regium-lang';

function detect(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'es' || s === 'en') return s;
  } catch {
    /* sin almacenamiento */
  }
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export const LANG: Lang = detect();
export const EN = LANG === 'en';
if (typeof document !== 'undefined') document.documentElement.lang = LANG;

/** Texto en el idioma actual. */
export function L<T>(es: T, en: T): T {
  return EN ? en : es;
}

export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* sin almacenamiento */
  }
  location.reload();
}

/** «Reino Rojo» / «Red Kingdom». */
export const reinoName = (r: Reino) => (EN ? REINO_INFO[r].name : REINO_INFO[r].nombre);
/** «rojo» / «red». */
export const colorName = (r: Reino) => (EN ? REINO_INFO[r].colorEn : REINO_INFO[r].nombre.replace('Reino ', '').toLowerCase());
/** Nombre de un jugador tal como se muestra (los bots y «Jugador N» se traducen). */
export const playerName = (p: { name: string; reino: Reino }) => (EN ? nameEn(p) : p.name);

// ------------------------------------------------------------------ Mensajes del motor y del servidor
const ERRORES: Record<string, string> = {
  'REGIUM se juega de 2 a 5 jugadores.': 'REGIUM is played by 2 to 5 players.',
  'Cada jugador debe gobernar un reino distinto.': 'Each player must rule a different kingdom.',
  'La partida ha terminado.': 'The game is over.',
  'No es tu turno.': 'It is not your turn.',
  'Ahora no se apuesta.': 'Bidding is not open now.',
  'Apuesta no válida.': 'Invalid bid.',
  'Ahora no se juegan cartas.': 'Cards are not played now.',
  'No tienes esa carta.': 'You do not have that card.',
  'No tienes del reino de salida: debes jugar una tropa imperial (superando si puedes).':
    'You have none of the leading kingdom: you must play an imperial troop (beating if you can).',
  'Carta no válida.': 'Invalid card.',
  'No te quedan victorias.': 'You have no victories left.',
  'No tienes territorios que convertir en ciudad.': 'You have no territories to turn into a city.',
  'Destruir un territorio cuesta 2 victorias.': 'Destroying a territory costs 2 victories.',
  'Acción desconocida.': 'Unknown action.',
  'Ahora no se reparten las victorias.': 'Victories are not being spent now.',
  'Objetivo no válido.': 'Invalid target.',
  'Demasiados intentos fallidos. Espera unos minutos.': 'Too many failed attempts. Wait a few minutes.',
  'No estás en ninguna partida.': 'You are not in any game.',
  'Ese jugador ya está conectado en otra pestaña.': 'That player is already connected in another tab.',
  'Esa partida no existe.': 'That game does not exist.',
  'No perteneces a esta partida.': 'You do not belong to this game.',
  'La partida ya ha empezado.': 'The game has already started.',
  'La partida está completa.': 'The game is full.',
  'Reino no válido.': 'Invalid kingdom.',
  'Ese reino ya tiene regente.': 'That kingdom already has a regent.',
  'Solo quien creó la partida puede iniciarla.': 'Only the host can start the game.',
  'Solo quien creó la partida puede hacerlo.': 'Only the host can do that.',
  'Hacen falta al menos 2 regentes.': 'At least 2 regents are needed.',
  'Todos los regentes deben elegir reino.': 'Every regent must choose a kingdom.',
  'La partida no ha empezado.': 'The game has not started.',
  'No juegas en esta partida.': 'You are not playing in this game.',
  'Mensaje vacío.': 'Empty message.',
  'Nivel no válido.': 'Invalid level.',
  'Ese jugador no es una máquina.': 'That player is not a bot.',
  'Jugador desconocido.': 'Unknown player.',
  'Ese sitio ya lo juega la máquina.': 'A bot already plays that seat.',
  'Ese jugador está conectado.': 'That player is connected.',
  'Error inesperado.': 'Unexpected error.',
  'Sin conexión con el servidor.': 'No connection to the server.',
};

/** Traduce un mensaje de error que viene en español. */
export function trError(msg: string): string {
  if (!EN || !msg) return msg;
  if (ERRORES[msg]) return ERRORES[msg];
  let m = /^Debes jugar una tropa del (.+) y superar si puedes\.$/.exec(msg);
  if (m) {
    const r = (Object.keys(REINO_INFO) as Reino[]).find((k) => REINO_INFO[k].nombre === m![1]);
    return `You must play a troop of the ${r ? REINO_INFO[r].name : m[1]} and beat if you can.`;
  }
  m = /^(.+) no tiene ciudades\.$/.exec(msg);
  if (m) return `${m[1]} has no cities.`;
  m = /^(.+) no tiene territorios\.$/.exec(msg);
  if (m) return `${m[1]} has no territories.`;
  m = /^La partida está completa \((\d+) jugadores\)\.$/.exec(msg);
  if (m) return `The game is full (${m[1]} players).`;
  return msg;
}
