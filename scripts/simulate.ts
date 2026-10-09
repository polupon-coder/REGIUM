// Simula partidas entre máquinas: npx tsx scripts/simulate.ts 200 dificil,normal,facil
import { createGame, playOut, REINOS, type BotLevel } from '../src/engine';
const n = Number(process.argv[2] ?? 100);
const levels = (process.argv[3] ?? 'normal,normal,normal').split(',') as BotLevel[];
const wins = levels.map(() => 0);
let byCities = 0, wars = 0, hits = 0, bids = 0;
for (let i = 0; i < n; i++) {
  const g = playOut(createGame(levels.map((_, k) => ({ name: `J${k}`, reino: REINOS[k] })), i * 2654435761), levels);
  for (const w of g.winners!) wins[w] += 1 / g.winners!.length;
  if (g.endReason === 'ciudades') byCities++;
  wars += g.history.length;
  for (const h of g.history) h.bids.forEach((b, k) => { bids++; if (b === h.won[k]) hits++; });
}
console.log(levels.map((l, k) => `${l}: ${(100 * wins[k] / n).toFixed(0)}%`).join('  '));
console.log(`fin por 7 ciudades: ${(100 * byCities / n).toFixed(0)}%  guerras/partida: ${(wars / n).toFixed(1)}  aciertos: ${(100 * hits / bids).toFixed(0)}%`);
