// Mesa de juego: la misma para online y para partidas en este dispositivo.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  batallas,
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
import { fondoImg, Lugares, lugarImg, pergaminoImg, preloadCards, regenteImg, Tropa } from './cards';
import { Chart } from './Chart';
import { isMuted, play, toggleMuted, type Sound } from './sounds';
import { Rules } from './Rules';

/** Color de texto de cada reino (más claro que el del marco, para leerse sobre fondo oscuro). */
export const TEXTO_REINO: Record<Reino, string> = {
  rojo: '#e2665c',
  verde: '#9cc865',
  amarillo: '#e3c64e',
  azul: '#5fb6d6',
  morado: '#bb86d8',
};
/* Tinta del color de cada reino para escribir sobre el papiro claro */
const TINTA_REINO: Record<Reino, string> = {
  rojo: '#6e0f06',
  verde: '#1f4708',
  amarillo: '#5e4200',
  azul: '#0a3560',
  morado: '#46105f',
};
const Rn = ({ r, children }: { r: Reino; children: ReactNode }) => <span style={{ color: TEXTO_REINO[r] }}>{children}</span>;

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
  /** Batalla terminada: todas las cartas jugadas y la ganadora. */
  plays?: Play[];
  winner?: number;
  /** Resumen de una guerra (índice en history). */
  summary?: number;
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
  /** Avisa de si hay ventanas a la vista (para pausar a las máquinas locales). */
  pauseSummary?: (showing: boolean) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(isMuted());
  const [panel, setPanel] = useState<'none' | 'rules' | 'log' | 'menu'>('none');
  /** En el móvil la mesa se divide en dos apartados. */
  const [tab, setTab] = useState<'batalla' | 'reinos'>('batalla');
  const g = game;
  const n = g.players.length;
  const imp = imperial(g);
  const me = mySeat !== null ? g.players[mySeat] : null;
  const myTurn = mySeat !== null && g.turn === mySeat && g.phase !== 'GAME_OVER';
  const name = (s: number) => (s === mySeat ? 'Tú' : g.players[s].name);
  /** Nombre del jugador en el color de su reino. */
  const who = (s: number) => <Rn r={g.players[s].reino}>{name(s)}</Rn>;

  useEffect(() => preloadCards(g.players.map((p) => p.reino)), [g.players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ Ventanas flotantes
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
      // Batalla terminada: qué ha jugado cada uno y quién gana
      if (g.lastTrick && JSON.stringify(g.lastTrick) !== JSON.stringify(p.lastTrick)) {
        const w = g.lastTrick.winner;
        const card = g.lastTrick.plays.find((x) => x.seat === w)!.card;
        add(big, {
          big: true,
          tone: w === mySeat ? 'good' : undefined,
          title: w === mySeat ? <Rn r={g.players[w].reino}>Ganas la batalla</Rn> : <>Gana {who(w)}</>,
          text: (
            <>
              con el <Rn r={card.reino}>{card.valor} {REINO_INFO[card.reino].nombre.replace('Reino ', '').toLowerCase()}</Rn>
            </>
          ),
          plays: g.lastTrick.plays,
          winner: w,
        });
      }
      // Apuestas de los rivales
      if (g.war === p.war)
        g.players.forEach((pl, i) => {
          if (i !== mySeat && p.players[i].bid === null && pl.bid !== null)
            add(small, {
              big: false,
              img: regenteImg(pl.reino),
              imgKind: 'regente',
              title: who(i),
              text: (
                <>
                  apuesta <b className="num">{pl.bid}</b> {pl.bid === 1 ? 'batalla' : 'batallas'}
                </>
              ),
            });
        });
      // Estrategia fallada
      if (mySeat !== null && g.history.length > p.history.length) {
        const w = g.history[g.history.length - 1];
        if (w.bids[mySeat] !== w.won[mySeat])
          add(big, {
            big: true,
            tone: 'bad',
            img: regenteImg(g.players[mySeat].reino),
            imgKind: 'regente',
            title: 'Fallaste',
            text: `⚔ ${w.won[mySeat]}/${w.bids[mySeat]}`,
          });
      }
      // Lo que gano o pierdo yo
      if (mySeat !== null) {
        const a = p.players[mySeat];
        const b = g.players[mySeat];
        const built = Math.max(0, b.ciudades - a.ciudades);
        const razed = Math.max(0, a.ciudades - b.ciudades);
        const netT = b.territorios - a.territorios + built - razed;
        const quien = p.turn !== mySeat ? who(p.turn) : 'Un rival';
        if (netT > 0)
          add(big, {
            big: true,
            tone: 'good',
            img: lugarImg(b.reino, 'territorio', Math.min(7, b.ciudades + b.territorios)),
            imgKind: 'lugar',
            title: 'Nuevo territorio',
            text: 'Has acertado tu estrategia.',
          });
        for (let k = 0; k < built; k++)
          add(big, {
            big: true,
            tone: 'good',
            img: lugarImg(b.reino, 'ciudad', b.ciudades - built + k + 1),
            imgKind: 'lugar',
            title: 'Nueva ciudad',
            text: `Conviertes un territorio en ciudad. Llevas ${b.ciudades - built + k + 1} de 7.`,
          });
        if (razed > 0)
          add(big, {
            big: true,
            tone: 'bad',
            img: lugarImg(b.reino, 'ciudad', a.ciudades),
            imgKind: 'lugar',
            title: 'Ciudad arrasada',
            text: <>{quien} arrasa una de tus ciudades: vuelve a ser territorio.</>,
          });
        if (netT < 0)
          add(big, {
            big: true,
            tone: 'bad',
            img: lugarImg(b.reino, 'territorio', Math.max(1, a.ciudades + a.territorios)),
            imgKind: 'lugar',
            title: 'Territorio conquistado',
            text: <>{quien} te arrebata un territorio.</>,
          });
      }
      // Fin de una guerra: resumen y anuncio de la siguiente
      if (g.war !== p.war && g.phase !== 'GAME_OVER') {
        add(big, { big: true, title: '', summary: g.history.length - 1 });
        add(big, warNotice(g, name));
      }
    }
    // Sonidos
    if (p) {
      const sounds: Sound[] = [];
      const newPlay =
        g.trick.length > p.trick.length
          ? g.trick[g.trick.length - 1]
          : g.lastTrick && JSON.stringify(g.lastTrick) !== JSON.stringify(p.lastTrick)
            ? g.lastTrick.plays[g.lastTrick.plays.length - 1]
            : null;
      if (newPlay) sounds.push(newPlay.card.valor === 10 ? 'rugido' : 'ficha');
      for (const x of big) {
        const t = typeof x.title === 'string' ? x.title : '';
        if (x.plays) sounds.push(x.winner === mySeat ? 'celebracion' : 'batalla');
        else if (x.summary !== undefined) continue;
        else if (t.startsWith('Guerra')) sounds.push('fe');
        else if (t === 'Nuevo territorio') sounds.push('conquista');
        else if (t === 'Nueva ciudad') sounds.push('construir');
        else if (t === 'Fallaste') sounds.push('derrota');
        else if (x.tone === 'bad') sounds.push('destruccion');
      }
      if (g.phase === 'GAME_OVER' && p.phase !== 'GAME_OVER')
        sounds.push(mySeat !== null && g.winners?.includes(mySeat) ? 'victoria' : 'risa');
      const myTurnNow = g.phase !== 'GAME_OVER' && g.turn === mySeat;
      if (myTurnNow && (p.turn !== mySeat || p.phase !== g.phase)) sounds.push('turno');
      sounds.forEach((snd, k) => play(snd, k * 450));
    }
    if (big.length) setBigQueue((q) => [...q, ...big]);
    const newWar = !!p && g.war !== p.war;
    if (small.length || newWar) setToasts((t) => [...(newWar ? [] : t), ...small].slice(-5));
    // Los avisos de apuestas sí desaparecen solos
    for (const x of small) setTimeout(() => setToasts((t) => t.filter((y) => y.id !== x.id)), 2800);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ventanas grandes de una en una; se cierran al tocarlas
  const currentBig = bigQueue[0];
  const closeBig = () => setBigQueue((q) => q.slice(1));
  const showing = !!currentBig;
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
        <span className={`imp-gem ${imp === 'amarillo' ? 'claro' : ''}`} style={{ ['--gc' as string]: imp === 'amarillo' ? '#ffd000' : REINO_INFO[imp].color }} title={`La guerra tiene lugar en el ${REINO_INFO[imp].nombre}`} />
        <div className="war-info">
          <span className="war-n">
            Guerra <b>{g.war + 1}</b>/{GUERRAS.length}
          </span>
          <span className="war-b">
            {g.phase === 'PLAY' ? `Batalla ${Math.min(g.battle + 1, batallas(g))}/${batallas(g)}` : `${batallas(g)} ${batallas(g) === 1 ? 'batalla' : 'batallas'}`}
          </span>
        </div>
        <div className="top-coins">
          <CoinButton glyph="☰" label="Menú" onClick={() => setPanel(panel === 'menu' ? 'none' : 'menu')} />
        </div>
      </header>

      {me && mySeat !== null && (
        <section className={`me-chip-row ${myTurn ? 'turn' : ''}`} style={{ ['--rc' as string]: REINO_INFO[me.reino].color }}>
          <div className="me-side left">
            <span>
              {me.name}
              {g.emperor === mySeat && <span className="crown"> ♛</span>}
            </span>
          </div>
          <div className="chip mine-chip">
            <img src={regenteImg(me.reino)} alt="" />
          </div>
          <div className="me-side right">
            <span className="chip-line">
              <span className="chip-bid">⚔ {me.bid === null ? '–' : `${me.won}/${me.bid}`}</span>
              <span className="chip-cities">♜ {me.ciudades}</span>
            </span>
          </div>
        </section>
      )}

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
              <img src={regenteImg(p.reino)} alt="" />
              <span className="chip-line">
                <span className="chip-bid">⚔ {p.bid === null ? '–' : `${p.won}/${p.bid}`}</span>
                <span className="chip-cities">♜ {p.ciudades}</span>
                {g.emperor === s && <span className="crown">♛</span>}
              </span>
            </button>
          );
        })}
      </section>

      <section className="rivals" style={{ ['--rivals' as string]: others.length }}>
        {others.map((s) => (
          <SeatPanel key={s} g={g} seat={s} meta={seats[s]} extra={seatExtra?.(s)} resolve={resolve} act={act} name={name} />
        ))}
      </section>

      <section className="field" style={{ backgroundImage: `url(${fondoImg(g.players[g.emperor].reino)})` }}>
        <div className="field-shade" />
        {bidding ? <BidPanel g={g} act={act} busy={busy} /> : resolve ? <ResolvePanel g={g} act={act} busy={busy} onAttack={() => setTab('reinos')} /> : <Battle g={g} name={name} />}
        <Status g={g} mySeat={mySeat} name={name} />
      </section>

      {me && mySeat !== null && (
        <section className={`mine ${myTurn ? 'active' : ''}`} style={{ ['--rc' as string]: REINO_INFO[me.reino].color }}>
          <div className="mine-head">
            <img className="mine-face" src={regenteImg(me.reino)} alt="" />
            <span className="pname">
              <Rn r={me.reino}>{me.name}</Rn> {g.emperor === mySeat && <span className="crown">♛</span>}
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
            <CoinButton glyph={muted ? '♪̸' : '♪'} label={muted ? 'Sin sonido' : 'Sonido'} onClick={() => setMuted(toggleMuted())} big />
            <CoinButton glyph="✕" label="Salir" onClick={onExit} big />
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            {t.img && <img src={t.img} alt="" />}
            <div>
              <div className="toast-title">{t.title}</div>
              {t.text && <div>{t.text}</div>}
            </div>
          </div>
        ))}
      </div>

      {currentBig && g.phase !== 'GAME_OVER' && currentBig.summary !== undefined && g.history[currentBig.summary] && (
        <WarSummary g={g} index={currentBig.summary} name={name} onClose={closeBig} />
      )}
      {currentBig && g.phase !== 'GAME_OVER' && currentBig.summary === undefined && (
        <div className="overlay soft" onClick={closeBig}>
          <div className={`notice framed ${currentBig.tone ?? ''} ${currentBig.imgKind ? `k-${currentBig.imgKind}` : ''}`} role="status">
            {currentBig.img && <img src={currentBig.img} alt="" />}
            {currentBig.plays && (
              <div className="notice-plays">
                {currentBig.plays.map((pl) => (
                  <div key={pl.seat} className={`played ${pl.seat === currentBig.winner ? 'winner' : 'loser'}`}>
                    <Tropa card={pl.card} />
                    <span className="who">{who(pl.seat)}</span>
                  </div>
                ))}
              </div>
            )}
            <h2>{currentBig.title}</h2>
            {currentBig.text && <p>{currentBig.text}</p>}
          </div>
        </div>
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
  return {
    big: true,
    img: pergaminoImg(r),
    imgKind: 'pergamino',
    title: `Guerra ${g.war + 1}`,
    text: (
      <>
        <Rn r={r}>{REINO_INFO[r].nombre}</Rn>
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
        <img className="seat-face" src={regenteImg(p.reino)} alt="" />
        <div className="seat-info">
          <div className="pname">
            <Rn r={p.reino}>{name(seat)}</Rn> {g.emperor === seat && <span className="crown">♛</span>}
          </div>
          <BidLine g={g} seat={seat} />
          <div className="meta">
            {p.handCount} {p.handCount === 1 ? 'tropa' : 'tropas'}
            {meta.bot ? ' · bot' : meta.online === false ? ' · desconectado' : ''}
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
        <div key={p.seat} className={`played ${showing.winner === p.seat ? 'winner' : ''}`} style={{ ['--tinta' as string]: TINTA_REINO[g.players[p.seat].reino] }}>
          <Tropa card={p.card} className={p.card.reino === imperial(g) ? 'imperial-card' : ''} />
          <span className="who">
            <Rn r={g.players[p.seat].reino}>{name(p.seat)}</Rn>
          </span>
        </div>
      ))}
    </div>
  );
}

function Status({ g, mySeat, name }: { g: GameState; mySeat: number | null; name: (s: number) => string }) {
  const mine = g.turn === mySeat;
  const n = (s: number) => <Rn r={g.players[s].reino}>{name(s)}</Rn>;
  let text: ReactNode = null;
  if (g.phase === 'BID') text = mine ? null : <>{n(g.turn)} decide su apuesta…</>;
  else if (g.phase === 'PLAY') {
    if (g.trick.length === 0 && g.lastTrick && g.battle > 0) {
      const w = g.lastTrick.winner;
      text = (
        <>
          {w === mySeat ? 'Ganas' : <>{n(w)} gana</>} la batalla. {mine ? 'Sales tú.' : <>Sale {n(g.turn)}.</>}
        </>
      );
    } else if (g.trick.length === 0) text = mine ? 'Sales tú: juega una tropa.' : <>Sale {n(g.turn)}.</>;
    else text = mine ? 'Tu turno: juega una tropa.' : <>Turno de {n(g.turn)}.</>;
  } else if (g.phase === 'RESOLVE') text = mine ? null : <>{n(g.turn)} reparte sus victorias…</>;
  if (!text) return null;
  return <div className={`status ${mine && g.phase !== 'GAME_OVER' ? 'mine' : ''}`}>{text}</div>;
}

function BidPanel({ g, act, busy }: { g: GameState; act: (a: Action) => void; busy: boolean }) {
  const allowed = legalBids(g);
  const n = batallas(g);
  return (
    <div className="bid-panel">
      <div className="panel-title">Tu estrategia</div>
      <div className="bids">
        {Array.from({ length: n + 1 }, (_, b) => (
          <button key={b} className="gem" disabled={busy || !allowed.includes(b)} onClick={() => act({ type: 'bid', n: b })}>
            {b}
          </button>
        ))}
      </div>

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
                  <Rn r={p.reino}>{name(i)}</Rn>
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
        <button className="start" onClick={onClose}>
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
            : `Tras las ${GUERRAS.length} guerras, nadie levantó siete ciudades: manda quien más tiene.`}
        </p>
        <div className="ranking">
          {ranking.map(({ p, i }) => (
            <div key={i} className="rank-row">
              <span className="rank-name">
                <Rn r={p.reino}>{name(i)}</Rn>
              </span>
              <Lugares player={p} size="md" />
            </div>
          ))}
        </div>
        <Chart g={g} name={name} />
        <button className="start" onClick={onExit}>
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
