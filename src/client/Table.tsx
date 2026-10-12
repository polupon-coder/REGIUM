// Mesa de juego: la misma para online y para partidas en este dispositivo.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  batallas,
  BOT_LABEL,
  GUERRAS,
  imperial,
  legalBids,
  legalCards,
  REINO_INFO,
  resolveOptions,
  sameCard,
  type Action,
  type BotLevel,
  type GameState,
  type Play,
  type Player,
  type Reino,
} from '../engine';
import { escudoImg, Lugares, lugarImg, pergaminoImg, preloadCards, regenteImg, Tropa } from './cards';
import { Chart } from './Chart';
import { Rules } from './Rules';

export interface SeatMeta {
  name: string;
  bot: BotLevel | null;
  online?: boolean;
}

/** Ventana flotante: grande (una a la vez, en el centro) o aviso pequeño (en la esquina). */
interface Notice {
  id: number;
  big: boolean;
  img?: string;
  imgKind?: 'lugar' | 'regente' | 'pergamino';
  title: ReactNode;
  text?: ReactNode;
  tone?: 'good' | 'bad';
}

const BIG_MS = 2600;
const SMALL_MS = 2800;
const SUMMARY_MS = 9000;

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
  /** Avisa de si hay ventanas a la vista (para pausar a las máquinas locales). */
  pauseSummary?: (showing: boolean) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'none' | 'rules' | 'log' | 'menu'>('none');
  /** En el móvil la mesa se divide en dos apartados. */
  const [tab, setTab] = useState<'batalla' | 'reinos'>('batalla');
  const g = game;
  const n = g.players.length;
  const imp = imperial(g);
  const me = mySeat !== null ? g.players[mySeat] : null;
  const myTurn = mySeat !== null && g.turn === mySeat && g.phase !== 'GAME_OVER';
  const name = (s: number) => (s === mySeat ? 'Tú' : g.players[s].name);

  useEffect(() => preloadCards(g.players.map((p) => p.reino)), [g.players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ Ventanas flotantes
  const [summary, setSummary] = useState<number | null>(null);
  const [bigQueue, setBigQueue] = useState<Notice[]>([]);
  const [toasts, setToasts] = useState<Notice[]>([]);
  const nextId = useRef(1);
  const prev = useRef<GameState | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = g;
    const big: Notice[] = [];
    const small: Notice[] = [];
    const add = (list: Notice[], x: Omit<Notice, 'id'>) => list.push({ ...x, id: nextId.current++ });

    if (!p) {
      if (g.phase !== 'GAME_OVER' && g.battle === 0 && g.phase === 'BID') add(big, warNotice(g, name));
    } else {
      // Apuestas de los rivales
      if (g.war === p.war)
        g.players.forEach((pl, i) => {
          if (i !== mySeat && p.players[i].bid === null && pl.bid !== null)
            add(small, {
              big: false,
              img: regenteImg(pl.reino),
              imgKind: 'regente',
              title: name(i),
              text: (
                <>
                  apuesta <b className="num">{pl.bid}</b> {pl.bid === 1 ? 'batalla' : 'batallas'}
                </>
              ),
            });
        });
      // Lo que gano o pierdo yo
      if (mySeat !== null) {
        const a = p.players[mySeat];
        const b = g.players[mySeat];
        const built = Math.max(0, b.ciudades - a.ciudades);
        const razed = Math.max(0, a.ciudades - b.ciudades);
        const netT = b.territorios - a.territorios + built - razed;
        const who = p.turn !== mySeat ? name(p.turn) : 'Un rival';
        if (netT > 0)
          add(big, {
            big: true,
            tone: 'good',
            img: lugarImg(b.reino, 'territorio', Math.min(7, b.ciudades + b.territorios)),
            imgKind: 'lugar',
            title: 'Nuevo territorio',
          });
        for (let k = 0; k < built; k++)
          add(big, {
            big: true,
            tone: 'good',
            img: lugarImg(b.reino, 'ciudad', b.ciudades - built + k + 1),
            imgKind: 'lugar',
            title: 'Nueva ciudad',
            text: `${b.ciudades - built + k + 1} de 7`,
          });
        if (razed > 0)
          add(big, {
            big: true,
            tone: 'bad',
            img: lugarImg(b.reino, 'ciudad', a.ciudades),
            imgKind: 'lugar',
            title: 'Ciudad arrasada',
            text: who,
          });
        if (netT < 0)
          add(big, {
            big: true,
            tone: 'bad',
            img: lugarImg(b.reino, 'territorio', Math.max(1, a.ciudades + a.territorios)),
            imgKind: 'lugar',
            title: 'Territorio conquistado',
            text: who,
          });
      }
      // Fin de una guerra: resumen y anuncio de la siguiente
      if (g.war !== p.war && g.phase !== 'GAME_OVER') {
        setSummary(g.history.length - 1);
        add(big, warNotice(g, name));
      }
    }
    if (big.length) setBigQueue((q) => [...q, ...big]);
    const newWar = !!p && g.war !== p.war;
    if (small.length || newWar) setToasts((t) => [...(newWar ? [] : t), ...small].slice(-5));
    for (const x of small) setTimeout(() => setToasts((t) => t.filter((y) => y.id !== x.id)), SMALL_MS);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps

  // El resumen va primero; después, las ventanas grandes de una en una
  const currentBig = summary === null ? bigQueue[0] : undefined;
  useEffect(() => {
    if (summary === null) return;
    const t = setTimeout(() => setSummary(null), SUMMARY_MS);
    return () => clearTimeout(t);
  }, [summary]);
  useEffect(() => {
    if (!currentBig) return;
    const t = setTimeout(() => setBigQueue((q) => q.slice(1)), BIG_MS);
    return () => clearTimeout(t);
  }, [currentBig?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const showing = summary !== null || !!currentBig;
  useEffect(() => pauseSummary?.(showing), [showing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ Acciones
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
  const bidding = g.phase === 'BID' && myTurn;

  return (
    <div className={`table tab-${tab}`} style={{ ['--imp' as string]: REINO_INFO[imp].color, ['--np' as string]: n }}>
      <header className="topbar">
        <img className="imp-escudo" src={escudoImg(imp)} alt="" title={`Imperial: ${REINO_INFO[imp].nombre}`} />
        <div className="war-info">
          <span className="war-n">
            Guerra <b>{g.war + 1}</b>/{GUERRAS.length}
          </span>
          <span className="war-b">
            {g.phase === 'PLAY' ? `Batalla ${Math.min(g.battle + 1, batallas(g))}/${batallas(g)}` : `${batallas(g)} ${batallas(g) === 1 ? 'batalla' : 'batallas'}`}
          </span>
        </div>
        <CoinButton glyph="☰" label="Menú" onClick={() => setPanel(panel === 'menu' ? 'none' : 'menu')} />
      </header>

      <section className="chips" style={{ ['--rivals' as string]: others.length }}>
        {others.map((s) => {
          const p = g.players[s];
          return (
            <button
              key={s}
              className={`chip ${g.turn === s && g.phase !== 'GAME_OVER' ? 'turn' : ''}`}
              style={{ ['--rc' as string]: REINO_INFO[p.reino].color }}
              onClick={() => setTab('reinos')}
            >
              <img src={g.emperor === s ? escudoImg(p.reino) : regenteImg(p.reino)} alt="" />
              <span className="chip-bid">{p.bid === null ? '–' : `${p.won}/${p.bid}`}</span>
              <span className="chip-cities">♜{p.ciudades}</span>
            </button>
          );
        })}
      </section>

      <section className="rivals" style={{ ['--rivals' as string]: others.length }}>
        {others.map((s) => (
          <SeatPanel key={s} g={g} seat={s} meta={seats[s]} extra={seatExtra?.(s)} resolve={resolve} act={act} name={name} />
        ))}
      </section>

      <section className="field" style={{ backgroundImage: `url(${pergaminoImg(g.players[g.emperor].reino)})` }}>
        <div className="field-shade" />
        {bidding ? <BidPanel g={g} act={act} busy={busy} /> : resolve ? <ResolvePanel g={g} act={act} busy={busy} onAttack={() => setTab('reinos')} /> : <Battle g={g} name={name} />}
        <Status g={g} mySeat={mySeat} name={name} />
      </section>

      {me && mySeat !== null && (
        <section className={`mine ${myTurn ? 'active' : ''}`} style={{ ['--rc' as string]: REINO_INFO[me.reino].color }}>
          <div className="mine-head">
            <span className="pname">
              {me.name} {g.emperor === mySeat && <span className="crown">♛</span>}
            </span>
            <BidLine g={g} seat={mySeat} />
            <span className="cities">
              ♜ <b>{me.ciudades}</b>/7
            </span>
          </div>
          <div className="my-lugares">
            <Lugares player={me} size="lg" />
          </div>
          <div className="hand" style={{ ['--n' as string]: Math.max(me.hand.length, 1) }}>
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

      <nav className="tabbar">
        <button className={`start ${tab === 'batalla' ? 'on' : ''}`} onClick={() => setTab('batalla')}>
          ⚔ Batalla
        </button>
        <button className={`start ${tab === 'reinos' ? 'on' : ''}`} onClick={() => setTab('reinos')}>
          ♜ Reinos{resolve && (resolve.destroyCity.length > 0 || resolve.destroyTerritory.length > 0) ? ' •' : ''}
        </button>
      </nav>

      {panel === 'menu' && (
        <div className="overlay soft" onClick={() => setPanel('none')}>
          <div className="menu-box framed" onClick={(e) => e.stopPropagation()}>
            <CoinButton glyph="¶" label="Crónica" onClick={() => setPanel('log')} big />
            <CoinButton glyph="§" label="Reglas" onClick={() => setPanel('rules')} big />
            <CoinButton glyph="✕" label="Salir" onClick={onExit} big />
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.img && <img src={t.img} alt="" />}
            <div>
              <div className="toast-title">{t.title}</div>
              {t.text && <div>{t.text}</div>}
            </div>
          </div>
        ))}
      </div>

      {currentBig && g.phase !== 'GAME_OVER' && (
        <div className="overlay soft" onClick={() => setBigQueue((q) => q.slice(1))}>
          <div className={`notice framed ${currentBig.tone ?? ''} ${currentBig.imgKind ?? ''}`} role="status">
            {currentBig.img && <img src={currentBig.img} alt="" />}
            <h2>{currentBig.title}</h2>
            {currentBig.text && <p>{currentBig.text}</p>}
          </div>
        </div>
      )}
      {summary !== null && g.history[summary] && g.phase !== 'GAME_OVER' && (
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

/** Anuncio de una guerra: cuántas batallas y en qué reino tiene lugar. */
function warNotice(g: GameState, name: (s: number) => string): Omit<Notice, 'id'> {
  const r: Reino = g.players[g.emperor].reino;
  const nb = batallas(g);
  return {
    big: true,
    img: pergaminoImg(r),
    imgKind: 'pergamino',
    title: `Guerra ${g.war + 1}`,
    text: (
      <>
        {nb} {nb === 1 ? 'batalla' : 'batallas'} · <b>{REINO_INFO[r].nombre}</b>
        <br />
        Emperador: {name(g.emperor)}
      </>
    ),
  };
}

/** Batallas ganadas / apuesta, con un símbolo. */
function BidLine({ g, seat }: { g: GameState; seat: number }) {
  const p = g.players[seat];
  if (p.bid === null) return <span className="bidline muted">⚔ –</span>;
  const cls = g.phase === 'RESOLVE' ? (p.won === p.bid ? 'hit' : 'miss') : '';
  return (
    <span className={`bidline ${cls}`} title="Batallas ganadas / apuesta">
      ⚔ <b>{p.won}</b>/{p.bid}
    </span>
  );
}

function SeatPanel({
  g,
  seat,
  meta,
  extra,
  resolve,
  act,
  name,
}: {
  g: GameState;
  seat: number;
  meta: SeatMeta;
  extra?: ReactNode;
  resolve: ReturnType<typeof resolveOptions> | null;
  act: (a: Action) => void;
  name: (s: number) => string;
}) {
  const p = g.players[seat];
  const turn = g.turn === seat && g.phase !== 'GAME_OVER';
  const canCity = !!resolve?.destroyCity.includes(seat);
  const canTerr = !!resolve?.destroyTerritory.includes(seat);
  return (
    <div className={`seat ${turn ? 'turn' : ''} ${canCity || canTerr ? 'targetable' : ''}`} style={{ ['--rc' as string]: REINO_INFO[p.reino].color }}>
      <div className="seat-head">
        <img className="seat-face" src={g.emperor === seat ? escudoImg(p.reino) : regenteImg(p.reino)} alt="" />
        <div className="seat-info">
          <div className="pname">
            {name(seat)} {g.emperor === seat && <span className="crown">♛</span>}
          </div>
          <BidLine g={g} seat={seat} />
          <div className="meta">
            {p.handCount} {p.handCount === 1 ? 'tropa' : 'tropas'}
            {meta.bot ? ` · máquina ${BOT_LABEL[meta.bot]}` : meta.online === false ? ' · desconectado' : ''}
          </div>
        </div>
        <span className="cities">
          ♜ <b>{p.ciudades}</b>/7
        </span>
      </div>
      <Lugares
        player={p}
        size="md"
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
  if (!showing) return <div className="battle empty" />;
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
  if (g.phase === 'BID') text = mine ? '' : `${name(g.turn)} decide su apuesta…`;
  else if (g.phase === 'PLAY') {
    if (g.trick.length === 0 && g.lastTrick && g.battle > 0) {
      const w = g.lastTrick.winner;
      text = `${w === mySeat ? 'Ganas' : `${name(w)} gana`} la batalla. ${mine ? 'Sales tú.' : `Sale ${name(g.turn)}.`}`;
    } else if (g.trick.length === 0) text = mine ? 'Sales tú: juega una tropa.' : `Sale ${name(g.turn)}.`;
    else text = mine ? 'Tu turno: juega una tropa.' : `Turno de ${name(g.turn)}.`;
  } else if (g.phase === 'RESOLVE') text = mine ? '' : `${name(g.turn)} reparte sus victorias…`;
  if (!text) return null;
  return <div className={`status ${mine && g.phase !== 'GAME_OVER' ? 'mine' : ''}`}>{text}</div>;
}

function BidPanel({ g, act, busy }: { g: GameState; act: (a: Action) => void; busy: boolean }) {
  const allowed = legalBids(g);
  const n = batallas(g);
  const sum = g.players.reduce((s, p) => s + (p.bid ?? 0), 0);
  const last = g.players.filter((p) => p.bid === null).length === 1;
  return (
    <div className="panel framed">
      <div className="panel-title">¿Cuántas batallas vas a ganar?</div>
      <div className="bids">
        {Array.from({ length: n + 1 }, (_, b) => (
          <button key={b} className="gem" disabled={busy || !allowed.includes(b)} onClick={() => act({ type: 'bid', n: b })}>
            {b}
          </button>
        ))}
      </div>
      {last && n - sum >= 0 && <div className="hint">No puedes apostar {n - sum}.</div>}
    </div>
  );
}

function ResolvePanel({ g, act, busy, onAttack }: { g: GameState; act: (a: Action) => void; busy: boolean; onAttack?: () => void }) {
  const o = resolveOptions(g);
  const left = g.actionsLeft;
  return (
    <div className="panel framed">
      <div className="panel-title">
        Te {left === 1 ? 'queda' : 'quedan'} <b className="num">{left}</b> {left === 1 ? 'victoria' : 'victorias'}
      </div>
      <div className="resolve-actions">
        <CoinButton glyph="♜" label="Levantar ciudad" disabled={busy || !o.build} onClick={() => act({ type: 'build' })} big />
        {(o.destroyCity.length > 0 || o.destroyTerritory.length > 0) && onAttack && (
          <span className="mobile-only">
            <CoinButton glyph="⚔" label="Atacar" onClick={onAttack} big />
          </span>
        )}
        <CoinButton glyph="✓" label={left > 0 ? 'Terminar' : 'Continuar'} disabled={busy} onClick={() => act({ type: 'pass' })} big />
      </div>

    </div>
  );
}

/** Botón redondo de bronce con un símbolo y su nombre debajo. */
export function CoinButton({ glyph, label, onClick, disabled, big }: { glyph: string; label: string; onClick: () => void; disabled?: boolean; big?: boolean }) {
  return (
    <button className={`coin-btn ${big ? 'big' : ''}`} onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      <span className="coin">{glyph}</span>
      <span className="coin-label">{label}</span>
    </button>
  );
}

/** Cartas que un jugador ha conseguido (o perdido) en una guerra. */
function acquired(p: Player, c: GameState['history'][number]['changes'][number]) {
  const out: { src: string; lost?: boolean }[] = [];
  const total = Math.min(7, Math.max(1, p.ciudades + p.territorios));
  if (c.territorio) out.push({ src: lugarImg(p.reino, 'territorio', total) });
  for (let k = 0; k < c.ciudades; k++) out.push({ src: lugarImg(p.reino, 'ciudad', Math.max(1, p.ciudades - k)) });
  for (let k = 0; k < c.ciudadesPerdidas; k++) out.push({ src: lugarImg(p.reino, 'ciudad', Math.min(7, p.ciudades + k + 1)), lost: true });
  for (let k = 0; k < c.territoriosPerdidos; k++) out.push({ src: lugarImg(p.reino, 'territorio', Math.min(7, total + k + 1)), lost: true });
  return out;
}

function WarSummary({ g, index, name, onClose }: { g: GameState; index: number; name: (s: number) => string; onClose: () => void }) {
  const w = g.history[index];
  return (
    <div className="overlay soft" onClick={onClose}>
      <div className="summary framed" onClick={(e) => e.stopPropagation()}>
        <h2>Fin de la guerra {w.war + 1}</h2>
        <div className="sum-rows">
          {g.players.map((p, i) => {
            const ok = w.bids[i] === w.won[i];
            const cards = w.changes ? acquired(p, w.changes[i]) : [];
            return (
              <div key={i} className={`sum-row ${ok ? 'hit' : 'miss'}`} style={{ ['--rc' as string]: REINO_INFO[p.reino].color }}>
                <img className="sum-face" src={regenteImg(p.reino)} alt="" />
                <div className="sum-name">
                  {name(i)}
                  {w.emperor === i && ' ♛'}
                </div>
                <div className="sum-score" title="Ganadas / apuesta">
                  <span className="pips">
                    {Array.from({ length: Math.max(w.bids[i], w.won[i]) }, (_, k) => (
                      <i key={k} className={k < w.won[i] ? (k < w.bids[i] ? 'on' : 'over') : 'off'} />
                    ))}
                    {w.bids[i] === 0 && w.won[i] === 0 && <i className="zero">0</i>}
                  </span>
                  <b>{ok ? '✓' : '✗'}</b>
                </div>
                <div className="sum-cards">
                  {cards.length ? cards.map((c, k) => <img key={k} src={c.src} alt="" className={c.lost ? 'lost' : ''} />) : <span className="muted">—</span>}
                </div>
              </div>
            );
          })}
        </div>
        <button className="primary" onClick={onClose}>
          Continuar
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
      <div className="gameover framed">
        <div className="gameover-crown">
          {winners.map((w) => (
            <img key={w} src={regenteImg(g.players[w].reino)} alt="" />
          ))}
        </div>
        <h1>
          {winners.map((w) => name(w)).join(' y ')}{' '}
          {winners.length > 1 ? 'comparten' : winners[0] !== undefined && name(winners[0]) === 'Tú' ? 'ganas' : 'gana'} la corona
        </h1>
        <p>
          {g.endReason === 'ciudades'
            ? `Siete ciudades levantadas en la guerra ${g.war + 1}.`
            : 'Tras las 19 guerras, nadie levantó siete ciudades: manda quien más tiene.'}
        </p>
        <div className="ranking">
          {ranking.map(({ p, i }) => (
            <div key={i} className="rank-row">
              <span className="rank-name">{name(i)}</span>
              <Lugares player={p} size="md" />
            </div>
          ))}
        </div>
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
