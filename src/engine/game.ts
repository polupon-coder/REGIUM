// Motor de reglas de REGIUM. Puro y determinista: (estado, jugador, acción) → estado nuevo.
// Fuente de verdad de las reglas: docs/REGLAMENTO.md

export const REINOS = ['rojo', 'verde', 'amarillo', 'azul', 'morado'] as const;
export type Reino = (typeof REINOS)[number];

export const REINO_INFO: Record<Reino, { nombre: string; escudo: string; color: string }> = {
  rojo: { nombre: 'Reino Rojo', escudo: 'Dragón', color: '#9b2a2e' },
  verde: { nombre: 'Reino Verde', escudo: 'Águila', color: '#5b7a3a' },
  amarillo: { nombre: 'Reino Amarillo', escudo: 'Serpiente', color: '#d9b81c' },
  azul: { nombre: 'Reino Azul', escudo: 'Cráneo astado', color: '#1f6b84' },
  morado: { nombre: 'Reino Morado', escudo: 'Elefante', color: '#6e2a85' },
};

/** Número de batallas de cada guerra: 1, 2 … 10, 9 … 1 (19 guerras). */
export const GUERRAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export const LUGARES = 7;
export const CIUDADES_PARA_GANAR = 7;

export interface Card {
  reino: Reino;
  valor: number; // 1..10
}
export const cardId = (c: Card) => `${c.reino}-${c.valor}`;
export const sameCard = (a: Card, b: Card) => a.reino === b.reino && a.valor === b.valor;

export interface Player {
  name: string;
  reino: Reino;
  hand: Card[];
  /** Número de cartas en la mano (útil cuando la mano está oculta). */
  handCount: number;
  bid: number | null;
  won: number;
  territorios: number;
  ciudades: number;
}

export type Phase = 'BID' | 'PLAY' | 'RESOLVE' | 'GAME_OVER';

export interface Play {
  seat: number;
  card: Card;
}

export interface WarResult {
  war: number;
  batallas: number;
  emperor: number;
  bids: number[];
  won: number[];
}

export interface LogEntry {
  n: number;
  text: string;
  seat?: number;
}

export interface GameState {
  players: Player[];
  /** Índice de la guerra en curso (0..18). */
  war: number;
  emperor: number;
  phase: Phase;
  /** Jugador que debe actuar. */
  turn: number;
  trick: Play[];
  /** Batalla anterior completa, para mostrarla. */
  lastTrick: { plays: Play[]; winner: number } | null;
  /** Batallas jugadas en esta guerra. */
  battle: number;
  /** Cartas ya jugadas en esta guerra (información pública). */
  played: Card[];
  /** Reinos de los que cada jugador ha demostrado no tener cartas en esta guerra. */
  voids: Reino[][];
  /** Fase de resultado: victorias que le quedan por usar al jugador en turno. */
  actionsLeft: number;
  /** Jugadores que ya han resuelto su resultado en esta guerra. */
  resolved: number[];
  lastWar: WarResult | null;
  history: WarResult[];
  /** Puntuación (ciudades) de cada jugador al final de cada guerra, para el gráfico final. */
  scoreHistory: number[][];
  winners: number[] | null;
  endReason: 'ciudades' | 'guerras' | null;
  log: LogEntry[];
  rng: number;
}

export type Action =
  | { type: 'bid'; n: number }
  | { type: 'play'; card: Card }
  | { type: 'build' }
  | { type: 'destroyCity'; target: number }
  | { type: 'destroyTerritory'; target: number }
  | { type: 'pass' };

export class RuleError extends Error {}

// ---------------------------------------------------------------------------------------------
// Azar reproducible (mulberry32)
// ---------------------------------------------------------------------------------------------
function next(state: GameState) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(state: GameState, arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------------------------
// Utilidades de reglas
// ---------------------------------------------------------------------------------------------
export const batallas = (g: GameState) => GUERRAS[g.war];
export const imperial = (g: GameState) => g.players[g.emperor].reino;
export const nextSeat = (g: GameState, s: number) => (s + 1) % g.players.length;
export const reserva = (p: Player) => LUGARES - p.territorios - p.ciudades;

/** Carta que va ganando una batalla (incompleta o completa). */
export function winningPlay(plays: Play[], imp: Reino): Play {
  const lead = plays[0].card.reino;
  let best = plays[0];
  for (const p of plays.slice(1)) {
    const b = best.card;
    const c = p.card;
    const bImp = b.reino === imp;
    const cImp = c.reino === imp;
    if (cImp && !bImp) best = p;
    else if (cImp === bImp && c.reino === b.reino && c.valor > b.valor) best = p;
    else if (!cImp && !bImp && c.reino === lead && b.reino !== lead) best = p;
  }
  return best;
}

/**
 * Cartas que se pueden jugar: hay que seguir el reino de salida y, si se puede, superar.
 * Sin cartas de ese reino hay que jugar una imperial (superando a la imperial que vaya ganando
 * si se puede). Sin ninguna de las dos, cualquier carta.
 */
export function legalCards(hand: Card[], trick: Play[], imp: Reino): Card[] {
  if (trick.length === 0) return hand;
  const lead = trick[0].card.reino;
  const best = winningPlay(trick, imp).card;
  const follow = hand.filter((c) => c.reino === lead);
  if (follow.length) {
    if (best.reino !== lead) return follow; // ya ganó una imperial: ninguna del reino de salida la supera
    const beat = follow.filter((c) => c.valor > best.valor);
    return beat.length ? beat : follow;
  }
  const imps = hand.filter((c) => c.reino === imp);
  if (imps.length) {
    if (best.reino !== imp) return imps;
    const beat = imps.filter((c) => c.valor > best.valor);
    return beat.length ? beat : imps;
  }
  return hand;
}

/** Apuestas permitidas: el último en apostar no puede hacer que la suma iguale el nº de batallas. */
export function legalBids(g: GameState): number[] {
  const n = batallas(g);
  const all = Array.from({ length: n + 1 }, (_, i) => i);
  const pending = g.players.filter((p) => p.bid === null).length;
  if (pending !== 1) return all;
  const sum = g.players.reduce((s, p) => s + (p.bid ?? 0), 0);
  return all.filter((b) => sum + b !== n);
}

/** ¿Ha acertado su apuesta? */
export const hit = (p: Player) => p.bid !== null && p.bid === p.won;

/** Objetivos posibles en la fase de resultado para el jugador en turno. */
export function resolveOptions(g: GameState) {
  const me = g.players[g.turn];
  const left = g.actionsLeft;
  return {
    build: left >= 1 && me.territorios > 0,
    destroyCity: left >= 1 ? g.players.map((p, i) => i).filter((i) => i !== g.turn && g.players[i].ciudades > 0) : [],
    destroyTerritory:
      left >= 2 ? g.players.map((p, i) => i).filter((i) => i !== g.turn && g.players[i].territorios > 0) : [],
  };
}
const hasOptions = (g: GameState) => {
  const o = resolveOptions(g);
  return o.build || o.destroyCity.length > 0 || o.destroyTerritory.length > 0;
};

// ---------------------------------------------------------------------------------------------
// Creación y desarrollo de la partida
// ---------------------------------------------------------------------------------------------
export function createGame(players: { name: string; reino: Reino }[], seed: number, firstEmperor?: number): GameState {
  if (players.length < 2 || players.length > 5) throw new RuleError('REGIUM se juega de 2 a 5 jugadores.');
  const reinos = new Set(players.map((p) => p.reino));
  if (reinos.size !== players.length) throw new RuleError('Cada jugador debe gobernar un reino distinto.');
  const g: GameState = {
    players: players.map((p) => ({
      name: p.name,
      reino: p.reino,
      hand: [],
      handCount: 0,
      bid: null,
      won: 0,
      territorios: 1,
      ciudades: 0,
    })),
    war: 0,
    emperor: 0,
    phase: 'BID',
    turn: 0,
    trick: [],
    lastTrick: null,
    battle: 0,
    played: [],
    voids: players.map(() => []),
    actionsLeft: 0,
    resolved: [],
    lastWar: null,
    history: [],
    scoreHistory: [players.map(() => 0)],
    winners: null,
    endReason: null,
    log: [],
    rng: seed | 0,
  };
  g.emperor = firstEmperor ?? Math.floor(next(g) * players.length);
  log(g, `${g.players[g.emperor].name} es elegido Emperador por sorteo.`);
  startWar(g);
  return g;
}

function log(g: GameState, text: string, seat?: number) {
  g.log.push({ n: (g.log.at(-1)?.n ?? 0) + 1, text, seat });
  if (g.log.length > 300) g.log.splice(0, g.log.length - 300);
}

function startWar(g: GameState) {
  const n = batallas(g);
  const deck: Card[] = [];
  for (const p of g.players) for (let v = 1; v <= 10; v++) deck.push({ reino: p.reino, valor: v });
  shuffle(g, deck);
  for (const p of g.players) {
    p.hand = sortHand(deck.splice(0, n), imperial(g));
    p.handCount = p.hand.length;
    p.bid = null;
    p.won = 0;
  }
  g.phase = 'BID';
  g.turn = g.emperor;
  g.trick = [];
  g.battle = 0;
  g.played = [];
  g.voids = g.players.map(() => []);
  g.resolved = [];
  g.actionsLeft = 0;
  log(g, `Guerra ${g.war + 1}: ${n} ${n === 1 ? 'batalla' : 'batallas'}. Emperador: ${g.players[g.emperor].name}.`);
}

export function sortHand(hand: Card[], imp: Reino) {
  const order = (r: Reino) => (r === imp ? -1 : REINOS.indexOf(r));
  return [...hand].sort((a, b) => order(a.reino) - order(b.reino) || a.valor - b.valor);
}

/** Jugadores que pueden actuar ahora. */
export const pendingSeats = (g: GameState) => (g.phase === 'GAME_OVER' ? [] : [g.turn]);

export function applyAction(state: GameState, seat: number, action: Action): GameState {
  if (state.phase === 'GAME_OVER') throw new RuleError('La partida ha terminado.');
  if (seat !== state.turn) throw new RuleError('No es tu turno.');
  const g: GameState = structuredClone(state);
  const me = g.players[seat];
  switch (action.type) {
    case 'bid': {
      if (g.phase !== 'BID') throw new RuleError('Ahora no se apuesta.');
      if (!legalBids(g).includes(action.n)) {
        throw new RuleError(
          action.n >= 0 && action.n <= batallas(g)
            ? `No puedes apostar ${action.n}: la suma de apuestas no puede ser igual al número de batallas.`
            : 'Apuesta no válida.',
        );
      }
      me.bid = action.n;
      log(g, `${me.name} apuesta ${action.n}.`, seat);
      g.turn = nextSeat(g, seat);
      if (g.players.every((p) => p.bid !== null)) {
        g.phase = 'PLAY';
        g.turn = g.emperor;
      }
      return g;
    }
    case 'play': {
      if (g.phase !== 'PLAY') throw new RuleError('Ahora no se juegan cartas.');
      const idx = me.hand.findIndex((c) => sameCard(c, action.card));
      if (idx < 0) throw new RuleError('No tienes esa carta.');
      if (!legalCards(me.hand, g.trick, imperial(g)).some((c) => sameCard(c, action.card)))
        throw new RuleError(illegalReason(me.hand, g.trick, imperial(g)));
      if (g.trick.length) {
        const lead = g.trick[0].card.reino;
        const imp = imperial(g);
        const v = g.voids[seat];
        if (action.card.reino !== lead && !v.includes(lead)) v.push(lead);
        if (action.card.reino !== lead && action.card.reino !== imp && !v.includes(imp)) v.push(imp);
      }
      me.hand.splice(idx, 1);
      me.handCount = me.hand.length;
      g.played.push(action.card);
      g.trick.push({ seat, card: action.card });
      if (g.trick.length < g.players.length) {
        g.turn = nextSeat(g, seat);
        return g;
      }
      const win = winningPlay(g.trick, imperial(g));
      g.players[win.seat].won++;
      g.lastTrick = { plays: g.trick, winner: win.seat };
      g.trick = [];
      g.battle++;
      log(g, `${g.players[win.seat].name} gana la batalla ${g.battle} con ${cardName(win.card)}.`, win.seat);
      if (g.battle < batallas(g)) {
        g.turn = win.seat;
        return g;
      }
      endBattles(g);
      return g;
    }
    case 'build': {
      requireResolve(g);
      if (g.actionsLeft < 1) throw new RuleError('No te quedan victorias.');
      if (me.territorios < 1) throw new RuleError('No tienes territorios que convertir en ciudad.');
      me.territorios--;
      me.ciudades++;
      g.actionsLeft--;
      log(g, `${me.name} levanta una ciudad.`, seat);
      afterResolveAction(g);
      return g;
    }
    case 'destroyCity': {
      requireResolve(g);
      const t = target(g, action.target);
      if (g.actionsLeft < 1) throw new RuleError('No te quedan victorias.');
      if (t.ciudades < 1) throw new RuleError(`${t.name} no tiene ciudades.`);
      t.ciudades--;
      t.territorios++;
      g.actionsLeft--;
      log(g, `${me.name} arrasa una ciudad de ${t.name}.`, seat);
      afterResolveAction(g);
      return g;
    }
    case 'destroyTerritory': {
      requireResolve(g);
      const t = target(g, action.target);
      if (g.actionsLeft < 2) throw new RuleError('Destruir un territorio cuesta 2 victorias.');
      if (t.territorios < 1) throw new RuleError(`${t.name} no tiene territorios.`);
      t.territorios--;
      g.actionsLeft -= 2;
      log(g, `${me.name} conquista un territorio de ${t.name}.`, seat);
      afterResolveAction(g);
      return g;
    }
    case 'pass': {
      requireResolve(g);
      if (g.actionsLeft > 0) log(g, `${me.name} renuncia a ${g.actionsLeft} ${g.actionsLeft === 1 ? 'victoria' : 'victorias'}.`, seat);
      g.actionsLeft = 0;
      nextResolver(g);
      return g;
    }
  }
  throw new RuleError('Acción desconocida.');
}

function requireResolve(g: GameState) {
  if (g.phase !== 'RESOLVE') throw new RuleError('Ahora no se reparten las victorias.');
}
function target(g: GameState, t: number) {
  if (!Number.isInteger(t) || t < 0 || t >= g.players.length || t === g.turn) throw new RuleError('Objetivo no válido.');
  return g.players[t];
}

function illegalReason(hand: Card[], trick: Play[], imp: Reino) {
  const lead = trick[0].card.reino;
  if (hand.some((c) => c.reino === lead)) return `Debes jugar una tropa del ${REINO_INFO[lead].nombre} y superar si puedes.`;
  if (hand.some((c) => c.reino === imp)) return 'No tienes del reino de salida: debes jugar una tropa imperial (superando si puedes).';
  return 'Carta no válida.';
}

export const cardName = (c: Card) => `el ${c.valor} ${c.reino}`;

function endBattles(g: GameState) {
  const result: WarResult = {
    war: g.war,
    batallas: batallas(g),
    emperor: g.emperor,
    bids: g.players.map((p) => p.bid ?? 0),
    won: g.players.map((p) => p.won),
  };
  g.lastWar = result;
  g.history.push(result);
  g.phase = 'RESOLVE';
  g.resolved = [];
  g.turn = g.emperor;
  beginResolver(g);
}

/** Prepara el resultado del jugador en turno (en orden desde el Emperador). */
function beginResolver(g: GameState) {
  for (;;) {
    const p = g.players[g.turn];
    if (hit(p)) {
      if (reserva(p) > 0) {
        p.territorios++;
        log(g, `${p.name} acierta (${p.bid}) y gana un territorio.`, g.turn);
      } else log(g, `${p.name} acierta (${p.bid}), pero ya tiene todos sus lugares en juego.`, g.turn);
      g.actionsLeft = p.won;
      if (g.actionsLeft > 0 && hasOptions(g)) return; // espera sus decisiones
    } else {
      log(g, `${p.name} falla: apostó ${p.bid} y ganó ${p.won}.`, g.turn);
    }
    g.actionsLeft = 0;
    g.resolved.push(g.turn);
    if (checkWin(g)) return;
    if (g.resolved.length === g.players.length) return endWar(g);
    g.turn = nextSeat(g, g.turn);
  }
}

function afterResolveAction(g: GameState) {
  if (checkWin(g)) return;
  if (g.actionsLeft > 0 && hasOptions(g)) return;
  if (g.actionsLeft > 0) log(g, `${g.players[g.turn].name} no puede usar ${g.actionsLeft === 1 ? 'la victoria que le queda' : 'las victorias que le quedan'}.`);
  g.actionsLeft = 0;
  nextResolver(g);
}

function nextResolver(g: GameState) {
  g.resolved.push(g.turn);
  if (g.resolved.length === g.players.length) return endWar(g);
  g.turn = nextSeat(g, g.turn);
  beginResolver(g);
}

function checkWin(g: GameState) {
  const p = g.players[g.turn];
  if (p.ciudades < CIUDADES_PARA_GANAR) return false;
  g.scoreHistory.push(g.players.map((x) => x.ciudades));
  g.phase = 'GAME_OVER';
  g.winners = [g.turn];
  g.endReason = 'ciudades';
  log(g, `¡${p.name} levanta su séptima ciudad y se proclama Rey de Reyes!`, g.turn);
  return true;
}

function endWar(g: GameState) {
  g.scoreHistory.push(g.players.map((x) => x.ciudades));
  if (g.war === GUERRAS.length - 1) {
    const score = (p: Player) => p.ciudades * 100 + p.territorios;
    const best = Math.max(...g.players.map(score));
    g.winners = g.players.map((p, i) => i).filter((i) => score(g.players[i]) === best);
    g.phase = 'GAME_OVER';
    g.endReason = 'guerras';
    log(g, `Terminan las 19 guerras. ${g.winners.map((i) => g.players[i].name).join(' y ')} ${g.winners.length > 1 ? 'comparten' : 'se lleva'} la corona.`);
    return;
  }
  g.war++;
  g.emperor = nextSeat(g, g.emperor);
  startWar(g);
}

/** Vista de un jugador: oculta las manos de los demás (seat = null → espectador, todo oculto). */
export function viewFor(g: GameState, seat: number | null): GameState {
  return {
    ...g,
    rng: 0,
    players: g.players.map((p, i) => (i === seat || g.phase === 'GAME_OVER' ? p : { ...p, hand: [] })),
  };
}
