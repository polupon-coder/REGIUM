// Mesa de juego: la misma para online y para partidas en este dispositivo.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  batallas,
  BOT_LABEL,
  GUERRAS,
  hit,
  imperial,
  legalBids,
  legalCards,
  REINO_INFO,
  resolveOptions,
  sameCard,
  type Action,
  type BotLevel,
  type Card,
  type GameState,
  type Play,
} from '../engine';
import { CityCount, DORSO_TROPA, Lugares, pergaminoImg, preloadCards, RegenteCard, Tropa, escudoImg } from './cards';
import { Rules } from './Rules';
import { Chart } from './Chart';

export interface SeatMeta {
  name: string;
  bot: BotLevel | null;
  online?: boolean;
}

export function Table({
  game,
  mySeat,
  seats,
  send,
  onExit,
  seatExtra,
  pauseSummary,
}: {
  game: GameState;
  /** Jugador desde cuyo punto de vista se ve la mesa (null = espectador). */
  mySeat: number | null;
  seats: SeatMeta[];
  send: (a: Action) => Promise<string | null>;
  onExit: () => void;
  /** Botones extra junto a cada jugador (p. ej. ceder a la máquina). */
  seatExtra?: (seat: number) => ReactNode;
  /** Avisa de si el resumen de la guerra está a la vista (para pausar a las máquinas locales). */
  pauseSummary?: (showing: boolean) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'none' | 'rules' | 'log'>('none');
  const g = game;
  const n = g.players.length;
  const imp = imperial(g);
  const me = mySeat !== null ? g.players[mySeat] : null;
  const myTurn = mySeat !== null && g.turn === mySeat && g.phase !== 'GAME_OVER';

  useEffect(() => preloadCards(g.players.map((p) => p.reino)), [g.players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resumen de la guerra que acaba de terminar
  const [summary, setSummary] = useState<number | null>(null);
  const seenWars = useRef(g.history.length);
  useEffect(() => {
    if (g.history.length > seenWars.current) {
      seenWars.current = g.history.length;
      if (g.phase !== 'GAME_OVER') setSummary(g.history.length - 1);
    }
  }, [g.history.length, g.phase]);
  useEffect(() => {
    pauseSummary?.(summary !== null);
    if (summary === null) return;
    const t = setTimeout(() => setSummary(null), 6000);
    return () => clearTimeout(t);
  }, [summary]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (a: Action) => {
    if (busy) return;
    setBusy(true);
    const err = await send(a);
    setBusy(false);
    setError(err ?? '');
  };

  // Orden en la mesa: yo abajo; los demás arriba, empezando por mi izquierda
  const others = useMemo(() => {
    const base = mySeat ?? -1;
    return Array.from({ length: n }, (_, k) => (base + 1 + k + n) % n).filter((s) => s !== mySeat);
  }, [mySeat, n]);

  const legal = me && g.phase === 'PLAY' && myTurn ? legalCards(me.hand, g.trick, imp) : [];
  const resolve = g.phase === 'RESOLVE' && myTurn ? resolveOptions(g) : null;

  const name = (s: number) => (s === mySeat ? 'Tú' : g.players[s].name);

  return (
    <div className="table" style={{ ['--imp' as string]: REINO_INFO[imp].color }}>
      <header className="topbar">
        <div className="war">
          <span className="brand">REGIUM</span>
          <span className="war-n">
            Guerra <b>{g.war + 1}</b> de {GUERRAS.length}
          </span>
          <span className="war-b">
            {batallas(g)} {batallas(g) === 1 ? 'batalla' : 'batallas'}
            {g.phase === 'PLAY' && <> · batalla {Math.min(g.battle + 1, batallas(g))}</>}
          </span>
        </div>
        <div className="imperial" title="Las tropas imperiales son el triunfo de esta guerra">
          <img src={escudoImg(imp)} alt="" />
          <span>
            Imperial: <b>{REINO_INFO[imp].nombre}</b>
          </span>
        </div>
        <nav>
          <button onClick={() => setPanel(panel === 'log' ? 'none' : 'log')}>Crónica</button>
          <button onClick={() => setPanel(panel === 'rules' ? 'none' : 'rules')}>Reglas</button>
          <button onClick={onExit}>Salir</button>
        </nav>
      </header>

      <section className="rivals">
        {others.map((s) => (
          <SeatPanel key={s} g={g} seat={s} meta={seats[s]} extra={seatExtra?.(s)} resolve={resolve} act={act} />
        ))}
      </section>

      <section className="field" style={{ backgroundImage: `url(${pergaminoImg(g.players[g.emperor].reino)})` }}>
        <div className="field-shade" />
        <Battle g={g} name={name} />
        <Status g={g} mySeat={mySeat} name={name} />
      </section>

      {me && mySeat !== null && (
        <section className={`mine ${myTurn ? 'active' : ''}`}>
          <div className="mine-info">
            <RegenteCard reino={me.reino} flipped={g.emperor === mySeat} small />
            <div>
              <div className="pname">
                {me.name} {g.emperor === mySeat && <span className="crown" title="Emperador">♛</span>}
              </div>
              <BidLine g={g} seat={mySeat} />
              <CityCount player={me} />
            </div>
            <Lugares player={me} />
          </div>

          {g.phase === 'BID' && myTurn && <BidPanel g={g} act={act} busy={busy} />}
          {resolve && <ResolvePanel g={g} act={act} busy={busy} />}

          <div className="hand">
            {me.hand.map((c) => {
              const ok = legal.some((x) => sameCard(x, c));
              return (
                <Tropa
                  key={`${c.reino}-${c.valor}`}
                  card={c}
                  className={c.reino === imp ? 'imperial-card' : ''}
                  onClick={g.phase === 'PLAY' && myTurn ? () => act({ type: 'play', card: c }) : undefined}
                  disabled={!ok || busy}
                  dim={g.phase === 'PLAY' && myTurn && !ok}
                />
              );
            })}
          </div>
          {error && <div className="error">{error}</div>}
        </section>
      )}

      {summary !== null && g.history[summary] && (
        <WarSummary g={g} index={summary} name={name} onClose={() => setSummary(null)} />
      )}
      {g.phase === 'GAME_OVER' && <GameOver g={g} name={name} onExit={onExit} />}
      {panel === 'rules' && (
        <Drawer title="Reglas" onClose={() => setPanel('none')}>
          <Rules />
        </Drawer>
      )}
      {panel === 'log' && (
        <Drawer title="Crónica" onClose={() => setPanel('none')}>
          <ol className="log">
            {[...g.log].reverse().map((l) => (
              <li key={l.n}>{l.text}</li>
            ))}
          </ol>
        </Drawer>
      )}
    </div>
  );
}

function BidLine({ g, seat }: { g: GameState; seat: number }) {
  const p = g.players[seat];
  if (p.bid === null)
    return <div className="bidline muted">{g.phase === 'BID' ? (g.turn === seat ? 'Pensando su apuesta…' : 'Sin apuesta aún') : ''}</div>;
  const done = g.phase === 'RESOLVE';
  return (
    <div className={`bidline ${done ? (hit(p) ? 'hit' : 'miss') : ''}`} title="Batallas ganadas / apuesta">
      <span className="won">{p.won}</span>
      <span className="sep">/</span>
      <span className="bid">{p.bid}</span>
      <small> batallas</small>
    </div>
  );
}

function SeatPanel({
  g,
  seat,
  meta,
  extra,
  resolve,
  act,
}: {
  g: GameState;
  seat: number;
  meta: SeatMeta;
  extra?: ReactNode;
  resolve: ReturnType<typeof resolveOptions> | null;
  act: (a: Action) => void;
}) {
  const p = g.players[seat];
  const turn = g.turn === seat && g.phase !== 'GAME_OVER';
  const canCity = !!resolve?.destroyCity.includes(seat);
  const canTerr = !!resolve?.destroyTerritory.includes(seat);
  return (
    <div className={`seat ${turn ? 'turn' : ''} ${canCity || canTerr ? 'targetable' : ''}`} style={{ ['--rc' as string]: REINO_INFO[p.reino].color }}>
      <div className="seat-head">
        <RegenteCard reino={p.reino} flipped={g.emperor === seat} small />
        <div className="seat-info">
          <div className="pname">
            {p.name} {g.emperor === seat && <span className="crown" title="Emperador">♛</span>}
          </div>
          <div className="meta">
            {meta.bot ? `máquina · ${BOT_LABEL[meta.bot]}` : meta.online === false ? 'desconectado' : ''}
          </div>
          <BidLine g={g} seat={seat} />
        </div>
        <CityCount player={p} />
      </div>
      <div className="seat-hand" aria-label={`${p.handCount} tropas en la mano`}>
        {Array.from({ length: p.handCount }, (_, i) => (
          <img key={i} src={DORSO_TROPA} alt="" />
        ))}
      </div>
      <Lugares
        player={p}
        size="sm"
        targetCity={canCity}
        targetTerritory={canTerr}
        onClick={(tipo) => act(tipo === 'ciudad' ? { type: 'destroyCity', target: seat } : { type: 'destroyTerritory', target: seat })}
      />
      {extra}
    </div>
  );
}

function Battle({ g, name }: { g: GameState; name: (s: number) => string }) {
  const showing: { plays: Play[]; winner: number | null; past: boolean } | null = g.trick.length
    ? { plays: g.trick, winner: null, past: false }
    : g.lastTrick && (g.battle > 0 || g.phase === 'RESOLVE')
      ? { plays: g.lastTrick.plays, winner: g.lastTrick.winner, past: true }
      : null;
  if (!showing)
    return (
      <div className="battle empty">
        <img className="big-escudo" src={escudoImg(imperial(g))} alt="" />
      </div>
    );
  return (
    <div className={`battle ${showing.past ? 'past' : ''}`}>
      {showing.plays.map((p) => (
        <div key={p.seat} className={`played ${showing.winner === p.seat ? 'winner' : ''}`}>
          <Tropa card={p.card} className={p.card.reino === imperial(g) ? 'imperial-card' : ''} />
          <span className="who">{name(p.seat)}</span>
        </div>
      ))}
    </div>
  );
}

function Status({ g, mySeat, name }: { g: GameState; mySeat: number | null; name: (s: number) => string }) {
  let text = '';
  const mine = g.turn === mySeat;
  if (g.phase === 'BID') text = mine ? '¿Cuántas batallas vas a ganar?' : `${name(g.turn)} decide su apuesta…`;
  else if (g.phase === 'PLAY') {
    if (g.trick.length === 0 && g.lastTrick && g.battle > 0) {
      const w = g.lastTrick.winner;
      text = `${w === mySeat ? 'Ganas' : `${name(w)} gana`} la batalla. ${mine ? 'Sales tú.' : `Sale ${name(g.turn)}.`}`;
    } else if (g.trick.length === 0) text = mine ? 'Eres el Emperador: sales tú.' : `Sale ${name(g.turn)}.`;
    else text = mine ? 'Tu turno: juega una tropa.' : `Turno de ${name(g.turn)}.`;
  } else if (g.phase === 'RESOLVE') text = mine ? 'Has acertado: reparte tus victorias.' : `${name(g.turn)} reparte sus victorias…`;
  return <div className={`status ${mine && g.phase !== 'GAME_OVER' ? 'mine' : ''}`}>{text}</div>;
}

function BidPanel({ g, act, busy }: { g: GameState; act: (a: Action) => void; busy: boolean }) {
  const allowed = legalBids(g);
  const n = batallas(g);
  const sum = g.players.reduce((s, p) => s + (p.bid ?? 0), 0);
  const last = g.players.filter((p) => p.bid === null).length === 1;
  return (
    <div className="panel bid-panel">
      <div className="panel-title">Tu apuesta</div>
      <div className="bids">
        {Array.from({ length: n + 1 }, (_, b) => (
          <button key={b} className="coin" disabled={busy || !allowed.includes(b)} onClick={() => act({ type: 'bid', n: b })}>
            {b}
          </button>
        ))}
      </div>
      <div className="hint">
        Apuestas hasta ahora: {sum} de {n}.
        {last && ` Eres el último: no puedes apostar ${n - sum}.`}
      </div>
    </div>
  );
}

function ResolvePanel({ g, act, busy }: { g: GameState; act: (a: Action) => void; busy: boolean }) {
  const o = resolveOptions(g);
  const left = g.actionsLeft;
  return (
    <div className="panel resolve-panel">
      <div className="panel-title">
        Te {left === 1 ? 'queda' : 'quedan'} <b>{left}</b> {left === 1 ? 'victoria' : 'victorias'}
      </div>
      <div className="resolve-actions">
        <button className="primary" disabled={busy || !o.build} onClick={() => act({ type: 'build' })}>
          Levantar una ciudad
        </button>
        <button disabled={busy} onClick={() => act({ type: 'pass' })}>
          {left > 0 ? 'Terminar' : 'Continuar'}
        </button>
      </div>
      <div className="hint">
        {o.destroyCity.length > 0 && 'Toca una ciudad rival para arrasarla (1 victoria). '}
        {o.destroyTerritory.length > 0 && 'Toca un territorio rival para conquistarlo (2 victorias).'}
      </div>
    </div>
  );
}

function WarSummary({ g, index, name, onClose }: { g: GameState; index: number; name: (s: number) => string; onClose: () => void }) {
  const w = g.history[index];
  return (
    <div className="overlay soft" onClick={onClose}>
      <div className="summary" onClick={(e) => e.stopPropagation()}>
        <h2>Fin de la guerra {w.war + 1}</h2>
        <table>
          <thead>
            <tr>
              <th />
              <th>Apuesta</th>
              <th>Ganadas</th>
              <th />
              <th>Ciudades</th>
            </tr>
          </thead>
          <tbody>
            {g.players.map((p, i) => {
              const ok = w.bids[i] === w.won[i];
              return (
                <tr key={i} className={ok ? 'hit' : 'miss'}>
                  <td>
                    <span className="dot" style={{ background: REINO_INFO[p.reino].color }} /> {name(i)}
                    {w.emperor === i && ' ♛'}
                  </td>
                  <td>{w.bids[i]}</td>
                  <td>{w.won[i]}</td>
                  <td>{ok ? 'Acierta' : 'Falla'}</td>
                  <td>{p.ciudades}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button className="primary" onClick={onClose}>
          Siguiente guerra
        </button>
      </div>
    </div>
  );
}

function GameOver({ g, name, onExit }: { g: GameState; name: (s: number) => string; onExit: () => void }) {
  const winners = g.winners ?? [];
  const ranking = g.players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.ciudades - a.p.ciudades || b.p.territorios - a.p.territorios);
  return (
    <div className="overlay">
      <div className="gameover">
        <div className="gameover-crown">
          {winners.map((w) => (
            <RegenteCard key={w} reino={g.players[w].reino} />
          ))}
        </div>
        <h1>
          {winners.map((w) => name(w)).join(' y ')} {winners.length > 1 ? 'comparten' : winners[0] === undefined ? '' : name(winners[0]) === 'Tú' ? 'ganas' : 'gana'} la corona
        </h1>
        <p>
          {g.endReason === 'ciudades'
            ? `Siete ciudades levantadas en la guerra ${g.war + 1}.`
            : 'Tras las 19 guerras, nadie levantó siete ciudades: manda quien más tiene.'}
        </p>
        <ol className="ranking">
          {ranking.map(({ p, i }) => (
            <li key={i}>
              <span className="dot" style={{ background: REINO_INFO[p.reino].color }} /> {name(i)} — {p.ciudades} ciudades,{' '}
              {p.territorios} territorios
            </li>
          ))}
        </ol>
        <Chart g={g} name={name} />
        <button className="primary" onClick={onExit}>
          Volver al inicio
        </button>
      </div>
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}

export type { Card };
