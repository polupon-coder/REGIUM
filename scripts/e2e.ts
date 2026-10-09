// Prueba de extremo a extremo online: 2 personas + 1 máquina juegan una partida completa.
// Comprueba que nadie recibe las cartas de los demás y la reconexión. Requiere el servidor (PORT).
import { io, type Socket } from 'socket.io-client';
import { legalBids, legalCards, imperial, resolveOptions, type GameState } from '../src/engine';

const URL = `http://localhost:${process.env.PORT ?? 3001}`;
const emit = (s: Socket, ev: string, data?: unknown) => new Promise<any>((r) => s.emit(ev, data, r));
const ok = async (p: Promise<any>) => {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r;
};

async function main() {
  const c = [io(URL, { transports: ['websocket'] }), io(URL, { transports: ['websocket'] })];
  const rooms: any[] = [null, null];
  c.forEach((s, i) => s.on('room', (r) => (rooms[i] = r)));
  const a = await ok(emit(c[0], 'createRoom', { name: 'Ana' }));
  const b = await ok(emit(c[1], 'joinRoom', { code: a.code, name: 'Beto' }));
  await ok(emit(c[0], 'lobby', { reino: 'azul' }));
  await ok(emit(c[1], 'lobby', { reino: 'verde' }));
  await ok(emit(c[0], 'addBot', { reino: 'morado', level: 'normal' }));
  for (const s of c) await ok(emit(s, 'lobby', { ready: true }));
  await ok(emit(c[0], 'start'));
  const wait = () => new Promise((r) => setTimeout(r, 30));
  let steps = 0;
  let reconnected = false;
  for (;;) {
    await wait();
    for (let i = 0; i < 2; i++) {
      const r = rooms[i];
      if (!r?.game) continue;
      const g: GameState = r.game;
      const me = r.players.find((p: any) => p.id === (i === 0 ? a : b).playerId);
      // Nadie ve las cartas de otro
      g.players.forEach((p, s) => {
        if (s !== me.seat && g.phase !== 'GAME_OVER' && p.hand.length) throw new Error('¡Se ven cartas ajenas!');
      });
      if (g.phase === 'GAME_OVER' || g.turn !== me.seat) continue;
      steps++;
      if (g.phase === 'BID') await ok(emit(c[i], 'action', { type: 'bid', n: legalBids(g)[0] }));
      else if (g.phase === 'PLAY') await ok(emit(c[i], 'action', { type: 'play', card: legalCards(g.players[me.seat].hand, g.trick, imperial(g))[0] }));
      else if (g.phase === 'RESOLVE') await ok(emit(c[i], 'action', resolveOptions(g).build ? { type: 'build' } : { type: 'pass' }));
    }
    if (steps >= 40 && !reconnected) {
      // Beto se desconecta y vuelve con su token
      reconnected = true;
      c[1].disconnect();
      rooms[1] = null;
      c[1].connect();
      await ok(emit(c[1], 'rejoin', { code: a.code, token: b.token }));
    }
    if (rooms[0]?.game?.phase === 'GAME_OVER') break;
  }
  const g = rooms[0].game as GameState;
  console.log(`OK: partida terminada en la guerra ${g.war + 1} (${g.endReason}); ganan ${g.winners!.map((w) => g.players[w].name).join(', ')}; ${steps} acciones humanas`);
  c.forEach((s) => s.close());
}
main().catch((e) => {
  console.error('FALLO:', e.message);
  process.exit(1);
});
