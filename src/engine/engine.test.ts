import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  GUERRAS,
  legalBids,
  legalCards,
  playOut,
  viewFor,
  winningPlay,
  type Card,
  type GameState,
  type Play,
  type Reino,
} from '.';

const c = (reino: Reino, valor: number): Card => ({ reino, valor });
const plays = (...cards: Card[]): Play[] => cards.map((card, seat) => ({ seat, card }));
const three = () =>
  createGame(
    [
      { name: 'Ana', reino: 'rojo' },
      { name: 'Beto', reino: 'verde' },
      { name: 'Cris', reino: 'azul' },
    ],
    42,
    0,
  );

describe('preparación', () => {
  it('reparte tantas tropas como batallas y empieza con 1 territorio', () => {
    const g = three();
    expect(g.war).toBe(0);
    expect(g.players.every((p) => p.hand.length === 1 && p.territorios === 1 && p.ciudades === 0)).toBe(true);
    expect(g.phase).toBe('BID');
    expect(g.turn).toBe(0);
  });
  it('solo usa tropas de los reinos en juego', () => {
    let g = three();
    for (let i = 0; i < 40 && g.war < 9; i++) g = playOut(g, ['normal', 'normal', 'normal'], Math.random, 1);
    const reinos = new Set(['rojo', 'verde', 'azul']);
    expect(g.players.flatMap((p) => p.hand).every((x) => reinos.has(x.reino))).toBe(true);
  });
  it('10 guerras: de 1 a 10 batallas', () => {
    expect(GUERRAS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('rechaza reinos repetidos y más de 5 jugadores', () => {
    expect(() => createGame([{ name: 'a', reino: 'rojo' }, { name: 'b', reino: 'rojo' }], 1)).toThrow();
  });
});

describe('ganador de una batalla', () => {
  it('gana la más alta del reino de salida', () => {
    expect(winningPlay(plays(c('verde', 5), c('verde', 9), c('azul', 10)), 'rojo').seat).toBe(1);
  });
  it('una imperial gana a cualquier otra', () => {
    expect(winningPlay(plays(c('verde', 10), c('rojo', 1), c('verde', 9)), 'rojo').seat).toBe(1);
  });
  it('entre imperiales gana la más alta', () => {
    expect(winningPlay(plays(c('verde', 10), c('rojo', 3), c('rojo', 7)), 'rojo').seat).toBe(2);
  });
});

describe('cartas legales: siempre hay que superar si se puede', () => {
  const imp: Reino = 'rojo';
  it('debe seguir el reino y superar', () => {
    const hand = [c('verde', 2), c('verde', 8), c('rojo', 5)];
    expect(legalCards(hand, plays(c('verde', 6)), imp)).toEqual([c('verde', 8)]);
  });
  it('si no puede superar, cualquiera del reino de salida', () => {
    const hand = [c('verde', 2), c('verde', 3), c('rojo', 5)];
    expect(legalCards(hand, plays(c('verde', 6)), imp)).toEqual([c('verde', 2), c('verde', 3)]);
  });
  it('si ya ganó una imperial, cualquiera del reino de salida', () => {
    const hand = [c('verde', 2), c('verde', 9)];
    expect(legalCards(hand, plays(c('verde', 6), c('rojo', 1)), imp)).toEqual(hand);
  });
  it('sin reino de salida, imperial obligatoria', () => {
    const hand = [c('azul', 9), c('rojo', 2), c('rojo', 7)];
    expect(legalCards(hand, plays(c('verde', 6)), imp)).toEqual([c('rojo', 2), c('rojo', 7)]);
  });
  it('sin reino de salida, imperial que supere a la imperial ganadora', () => {
    const hand = [c('azul', 9), c('rojo', 2), c('rojo', 7)];
    expect(legalCards(hand, plays(c('verde', 6), c('rojo', 4)), imp)).toEqual([c('rojo', 7)]);
  });
  it('sin reino ni imperial, cualquier carta', () => {
    const hand = [c('azul', 9), c('azul', 2)];
    expect(legalCards(hand, plays(c('verde', 6)), imp)).toEqual(hand);
  });
  it('quien sale juega lo que quiera', () => {
    const hand = [c('azul', 9), c('rojo', 2)];
    expect(legalCards(hand, [], imp)).toEqual(hand);
  });
});

describe('apuestas', () => {
  it('el último no puede igualar la suma al número de batallas', () => {
    let g = three(); // 1 batalla
    g = applyAction(g, 0, { type: 'bid', n: 0 });
    g = applyAction(g, 1, { type: 'bid', n: 0 });
    expect(legalBids(g)).toEqual([0]);
    expect(() => applyAction(g, 2, { type: 'bid', n: 1 })).toThrow(/suma/);
  });
  it('no se puede apostar fuera de turno', () => {
    expect(() => applyAction(three(), 1, { type: 'bid', n: 0 })).toThrow(/turno/);
  });
});

/** Fuerza manos concretas en una guerra para probar el resultado. */
function rig(g: GameState, hands: Card[][]) {
  g = structuredClone(g);
  g.players.forEach((p, i) => {
    p.hand = hands[i];
    p.handCount = hands[i].length;
  });
  return g;
}

describe('resultado de la guerra', () => {
  it('quien acierta gana territorio y puede convertirlo en ciudad', () => {
    let g = rig(three(), [[c('rojo', 10)], [c('verde', 1)], [c('azul', 1)]]);
    g = applyAction(g, 0, { type: 'bid', n: 1 });
    g = applyAction(g, 1, { type: 'bid', n: 1 });
    g = applyAction(g, 2, { type: 'bid', n: 1 });
    g = applyAction(g, 0, { type: 'play', card: c('rojo', 10) });
    g = applyAction(g, 1, { type: 'play', card: c('verde', 1) });
    g = applyAction(g, 2, { type: 'play', card: c('azul', 1) });
    expect(g.phase).toBe('RESOLVE');
    expect(g.turn).toBe(0);
    expect(g.players[0].territorios).toBe(2); // 1 inicial + 1 por acertar
    g = applyAction(g, 0, { type: 'build' });
    expect(g.players[0]).toMatchObject({ territorios: 1, ciudades: 1 });
    expect(g.history[0].changes[0]).toMatchObject({ territorio: 1, ciudades: 1 });
    expect(g.lastWar!.changes[0].ciudades).toBe(1);
    // Tras guardar y cargar (JSON), sigue anotando una sola vez
    expect(JSON.parse(JSON.stringify(g)).history[0].changes[1].territorio).toBe(0);
    // Los demás fallan: se pasa a la guerra 2 con el siguiente Emperador
    expect(g.war).toBe(1);
    expect(g.emperor).toBe(1);
    expect(g.players[1].territorios).toBe(1);
  });

  it('apostar 0 y acertar da un territorio', () => {
    let g = rig(three(), [[c('rojo', 10)], [c('verde', 1)], [c('azul', 1)]]);
    g = applyAction(g, 0, { type: 'bid', n: 1 });
    g = applyAction(g, 1, { type: 'bid', n: 0 });
    g = applyAction(g, 2, { type: 'bid', n: 1 });
    g = applyAction(g, 0, { type: 'play', card: c('rojo', 10) });
    g = applyAction(g, 1, { type: 'play', card: c('verde', 1) });
    g = applyAction(g, 2, { type: 'play', card: c('azul', 1) });
    g = applyAction(g, 0, { type: 'pass' });
    expect(g.players[1].territorios).toBe(2);
    expect(g.players[2].territorios).toBe(1);
  });

  it('destruir: 1 victoria arrasa una ciudad, 2 victorias un territorio', () => {
    let g = three();
    g = structuredClone(g);
    g.phase = 'RESOLVE';
    g.turn = 0;
    g.actionsLeft = 3;
    g.resolved = [];
    g.players[1].ciudades = 2;
    g.players[1].territorios = 1;
    g = applyAction(g, 0, { type: 'destroyCity', target: 1 });
    expect(g.players[1]).toMatchObject({ ciudades: 1, territorios: 2 });
    g = applyAction(g, 0, { type: 'destroyTerritory', target: 1 });
    expect(g.players[1]).toMatchObject({ ciudades: 1, territorios: 1 });
    expect(g.actionsLeft).toBe(0);
  });

  it('gana quien llega a 7 ciudades, en ese mismo momento', () => {
    let g = structuredClone(three());
    g.phase = 'RESOLVE';
    g.turn = 0;
    g.actionsLeft = 1;
    g.players[0].ciudades = 6;
    g.players[0].territorios = 1;
    g = applyAction(g, 0, { type: 'build' });
    expect(g.phase).toBe('GAME_OVER');
    expect(g.winners).toEqual([0]);
    expect(g.endReason).toBe('ciudades');
  });
});

describe('información oculta', () => {
  it('cada jugador solo ve su mano', () => {
    const v = viewFor(three(), 1);
    expect(v.players[1].hand).toHaveLength(1);
    expect(v.players[0].hand).toHaveLength(0);
    expect(v.players[0].handCount).toBe(1);
    expect(v.rng).toBe(0);
  });
});

describe('partidas completas con máquinas', () => {
  it('terminan siempre, con 2 a 5 jugadores', () => {
    const reinos: Reino[] = ['rojo', 'verde', 'amarillo', 'azul', 'morado'];
    for (let n = 2; n <= 5; n++) {
      for (let seed = 1; seed <= 6; seed++) {
        const g0 = createGame(
          reinos.slice(0, n).map((reino, i) => ({ name: `J${i}`, reino })),
          seed * 7919,
        );
        const levels = Array.from({ length: n }, (_, i) => (['facil', 'normal', 'dificil'] as const)[(seed + i) % 3]);
        const end = playOut(g0, seed <= 2 ? levels : levels.map((l) => (l === 'dificil' ? 'facil' : l)));
        expect(end.phase).toBe('GAME_OVER');
        expect(end.winners!.length).toBeGreaterThan(0);
        for (const p of end.players) expect(p.ciudades + p.territorios).toBeLessThanOrEqual(7);
      }
    }
  }, 120_000);
});
