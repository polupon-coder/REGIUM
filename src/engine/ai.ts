// Jugadores máquina. Solo ven su propia mano (usan viewFor) y siempre eligen acciones legales.
import {
  applyAction,
  batallas,
  imperial,
  legalBids,
  legalCards,
  resolveOptions,
  viewFor,
  winningPlay,
  type Action,
  type Card,
  type GameState,
  type Reino,
} from './game';

export type BotLevel = 'facil' | 'normal' | 'dificil';
export const BOT_LABEL: Record<BotLevel, string> = { facil: 'fácil', normal: 'medio', dificil: 'difícil' };
/** Los dos niveles que se ofrecen al elegir bot. */
export const BOT_NIVELES: BotLevel[] = ['facil', 'dificil'];

type Rand = () => number;

/** Probabilidad aproximada de que una carta gane una batalla. */
function cardStrength(c: Card, imp: Reino, nPlayers: number, handSize: number) {
  const others = nPlayers - 1;
  if (c.reino === imp) {
    // Las imperiales altas casi siempre ganan; las bajas ganan cuando otros se quedan sin reino
    const base = (c.valor - 1) / 9;
    return Math.min(0.97, 0.3 + 0.7 * base ** 1.3);
  }
  // Una carta de otro reino gana si es la más alta de su reino en la batalla y nadie fallará con imperial
  const higher = 10 - c.valor; // cartas más altas del mismo reino en la baraja
  const dealt = (handSize * nPlayers) / (nPlayers * 10); // fracción de la baraja repartida
  const pNoHigher = (1 - dealt) ** higher;
  const pNoTrump = Math.max(0.15, 1 - 0.12 * others * (handSize / 10));
  return pNoHigher * pNoTrump * 0.9;
}

function estimateBid(g: GameState, seat: number) {
  const me = g.players[seat];
  const imp = imperial(g);
  const n = batallas(g);
  const s = me.hand.reduce((acc, c) => acc + cardStrength(c, imp, g.players.length, n), 0);
  return s;
}

function chooseBid(g: GameState, seat: number, level: BotLevel, rand: Rand): number {
  const options = legalBids(g);
  let est = estimateBid(g, seat);
  if (level === 'facil') est += (rand() - 0.5) * 1.6;
  let best = options[0];
  let bestD = Infinity;
  for (const b of options) {
    const d = Math.abs(b - est) + (level === 'dificil' ? 0 : rand() * 0.2);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function choosePlay(g: GameState, seat: number, level: BotLevel, rand: Rand): Card {
  const me = g.players[seat];
  const imp = imperial(g);
  const legal = legalCards(me.hand, g.trick, imp);
  if (legal.length === 1) return legal[0];
  if (level === 'facil' && rand() < 0.3) return legal[Math.floor(rand() * legal.length)];

  const need = (me.bid ?? 0) - me.won; // victorias que aún quiere
  const remaining = me.hand.length;
  const rank = (c: Card) => (c.reino === imp ? 100 : 0) + c.valor;
  const asc = [...legal].sort((a, b) => rank(a) - rank(b));
  const wouldWin = (c: Card) =>
    g.trick.length === 0 ? null : winningPlay([...g.trick, { seat, card: c }], imp).seat === seat;
  const lastToPlay = g.trick.length === g.players.length - 1;

  if (need <= 0) {
    // Quiere perder: la carta más alta que no gane; si todas ganan, la más baja
    if (g.trick.length === 0) return asc[0];
    const losers = asc.filter((c) => !wouldWin(c));
    return losers.length ? losers[losers.length - 1] : asc[0];
  }

  // Quiere ganar
  if (g.trick.length === 0) {
    // Sale con su carta más fuerte si necesita muchas; si no, con una fuerte no imperial
    const strong = [...legal].sort(
      (a, b) => cardStrength(b, imp, g.players.length, remaining) - cardStrength(a, imp, g.players.length, remaining),
    );
    if (need >= remaining || level !== 'dificil') return strong[0];
    const nonImp = strong.filter((c) => c.reino !== imp && c.valor >= 8);
    return nonImp[0] ?? strong[0];
  }
  const winners = asc.filter((c) => wouldWin(c));
  if (winners.length) {
    // Si es el último, gana con lo justo; si no, con algo más de margen
    if (lastToPlay || level === 'facil') return winners[0];
    return winners[Math.min(winners.length - 1, level === 'dificil' ? 1 : 0)];
  }
  return asc[0]; // no puede ganar: se deshace de la más baja
}

// ---------------------------------------------------------------------------------------------
// Nivel difícil: Monte Carlo. Imagina repartos posibles de las cartas que no ve (respetando los
// reinos de los que cada rival ya ha demostrado no tener) y juega la guerra hasta el final.
// ---------------------------------------------------------------------------------------------
function unseen(g: GameState, seat: number): Card[] {
  const known = new Set([...g.players[seat].hand, ...g.played, ...g.trick.map((t) => t.card)].map((c) => `${c.reino}-${c.valor}`));
  const out: Card[] = [];
  for (const p of g.players) for (let v = 1; v <= 10; v++) if (!known.has(`${p.reino}-${v}`)) out.push({ reino: p.reino, valor: v });
  return out;
}

function sampleWorld(g: GameState, seat: number, rand: Rand): GameState {
  const w: GameState = { ...g, log: [], history: [], scoreHistory: [], players: g.players.map((p) => ({ ...p })) };
  const pool = unseen(g, seat);
  const others = g.players.map((_, i) => i).filter((i) => i !== seat);
  for (let attempt = 0; attempt < 30; attempt++) {
    const deck = [...pool];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // Primero los más restringidos
    const order = [...others].sort((a, b) => g.voids[b].length - g.voids[a].length);
    let ok = true;
    for (const i of order) {
      const need = g.players[i].handCount;
      const hand: Card[] = [];
      for (let k = 0; k < deck.length && hand.length < need; ) {
        if (attempt < 29 && g.voids[i].includes(deck[k].reino)) k++;
        else hand.push(deck.splice(k, 1)[0]);
      }
      if (hand.length < need) {
        ok = false;
        break;
      }
      w.players[i].hand = hand;
    }
    if (ok) return w;
  }
  return w;
}

/** Juega el resto de batallas de la guerra con la política «medio» para todos. */
function rollout(w: GameState, rand: Rand): GameState {
  let s = w;
  const war = s.war;
  while (s.phase === 'PLAY' && s.war === war) {
    s = applyAction(s, s.turn, { type: 'play', card: choosePlay(s, s.turn, 'normal', rand) });
  }
  return s;
}

/** Victorias de cada jugador en esta guerra (lastWar ya contiene el resultado al terminar). */
const wonAfter = (s: GameState, seat: number) => s.lastWar?.won[seat] ?? s.players[seat].won;

function mcBid(g: GameState, seat: number, rand: Rand, samples = 48): number {
  const options = legalBids(g);
  const counts = new Map<number, number>();
  for (let k = 0; k < samples; k++) {
    const w = sampleWorld(g, seat, rand);
    // Los rivales que aún no han apostado apuestan según su estimación
    for (let i = 0; i < w.players.length; i++) {
      if (w.players[i].bid === null) w.players[i].bid = Math.round(estimateBid(w, i));
    }
    w.phase = 'PLAY';
    w.turn = w.emperor;
    const won = wonAfter(rollout(w, rand), seat);
    counts.set(won, (counts.get(won) ?? 0) + 1);
  }
  // Mejor apuesta: máxima esperanza de (1 territorio + victorias) al acertar
  let best = options[0];
  let bestV = -1;
  for (const b of options) {
    const v = ((counts.get(b) ?? 0) / samples) * (1 + b) + 1e-3 * (1 - b / 20);
    if (v > bestV) {
      bestV = v;
      best = b;
    }
  }
  return best;
}

function mcPlay(g: GameState, seat: number, rand: Rand, maxSamples = 24): Card {
  const me = g.players[seat];
  const legal = legalCards(me.hand, g.trick, imperial(g));
  if (legal.length === 1) return legal[0];
  // Presupuesto de cálculo: con muchas opciones, menos repartos imaginados por opción (rápido en el móvil)
  const samples = Math.max(12, Math.min(maxSamples, Math.round(120 / legal.length)));
  let best = legal[0];
  let bestV = -1;
  for (const card of legal) {
    let v = 0;
    for (let k = 0; k < samples; k++) {
      const w = sampleWorld(g, seat, rand);
      const s = rollout(applyAction(w, seat, { type: 'play', card }), rand);
      if (wonAfter(s, seat) === me.bid) v++;
    }
    if (v > bestV) {
      bestV = v;
      best = card;
    }
  }
  return best;
}

function chooseResolve(g: GameState, seat: number, level: BotLevel, rand: Rand): Action {
  const o = resolveOptions(g);
  const me = g.players[seat];
  // 1. Si levantar una ciudad le da la victoria, la levanta
  if (o.build && me.ciudades >= 6) return { type: 'build' };
  const rivals = g.players.map((p, i) => ({ p, i })).filter((x) => x.i !== seat);
  rivals.sort((a, b) => b.p.ciudades - a.p.ciudades || b.p.territorios - a.p.territorios);
  // 2. Frena a quien está cerca de ganar: arrasa sus ciudades
  const umbral = level === 'facil' ? 6 : 5;
  const amenaza = rivals.find((r) => r.p.ciudades >= umbral && r.p.ciudades >= me.ciudades && o.destroyCity.includes(r.i));
  if (amenaza && (level !== 'facil' || rand() < 0.5)) return { type: 'destroyCity', target: amenaza.i };
  // 3. Si no, levanta ciudades propias (cada una le suma frente a todos los rivales)
  if (o.build) return { type: 'build' };
  // 4. Sin territorios propios: arrasa al que va primero; y si no hay ciudades, conquista territorio
  if (o.destroyCity.length) return { type: 'destroyCity', target: rivals.find((r) => o.destroyCity.includes(r.i))!.i };
  if (o.destroyTerritory.length) {
    // conquista al que más territorios tiene a punto de convertir
    const t = [...rivals].sort((a, b) => b.p.territorios + b.p.ciudades - (a.p.territorios + a.p.ciudades)).find((r) => o.destroyTerritory.includes(r.i))!;
    return { type: 'destroyTerritory', target: t.i };
  }
  return { type: 'pass' };
}

/** Acción que elige la máquina para el jugador `seat`. */
export function chooseAction(state: GameState, seat: number, level: BotLevel, rand: Rand = Math.random): Action | null {
  if (state.phase === 'GAME_OVER' || state.turn !== seat) return null;
  const g = viewFor(state, seat); // nunca mira las cartas de los demás
  switch (g.phase) {
    case 'BID':
      return { type: 'bid', n: level === 'facil' ? chooseBid(g, seat, level, rand) : mcBid(g, seat, rand, level === 'dificil' ? 60 : 16) };
    case 'PLAY':
      return { type: 'play', card: level === 'dificil' ? mcPlay(g, seat, rand) : choosePlay(g, seat, level, rand) };
    case 'RESOLVE':
      return chooseResolve(g, seat, level, rand);
  }
  return null;
}

/** Juega una partida completa solo con máquinas (para pruebas y simulaciones). */
export function playOut(g: GameState, levels: BotLevel[], rand: Rand = Math.random, maxSteps = 5000) {
  let s = g;
  for (let i = 0; i < maxSteps && s.phase !== 'GAME_OVER'; i++) {
    const a = chooseAction(s, s.turn, levels[s.turn], rand)!;
    s = applyAction(s, s.turn, a);
  }
  return s;
}
