// Gráfico final: ciudades de cada regente al final de cada guerra.
import { REINO_INFO, type GameState } from '../engine';

export function Chart({ g, name }: { g: GameState; name: (s: number) => string }) {
  const rows = g.scoreHistory; // rows[k][seat] = ciudades tras k guerras
  if (rows.length < 2) return null;
  const W = 520;
  const H = 200;
  const pad = { l: 28, r: 12, t: 12, b: 26 };
  const x = (k: number) => pad.l + (k / (rows.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / 7) * (H - pad.t - pad.b);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ciudades de cada regente al final de cada guerra">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {rows.map((_, k) =>
          k % 2 === 1 || k === rows.length - 1 ? (
            <text key={k} x={x(k)} y={H - 8} textAnchor="middle">
              {k}
            </text>
          ) : null,
        )}
        {g.players.map((p, s) => (
          <polyline
            key={s}
            fill="none"
            stroke={REINO_INFO[p.reino].color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            points={rows.map((r, k) => `${x(k)},${y(r[s])}`).join(' ')}
          >
            <title>{name(s)}</title>
          </polyline>
        ))}
      </svg>
      <figcaption>Ciudades al final de cada guerra</figcaption>
    </figure>
  );
}
