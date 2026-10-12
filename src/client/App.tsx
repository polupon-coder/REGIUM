import { useEffect, useRef, useState } from 'react';
import {
  applyAction,
  BOT_LABEL,
  chooseAction,
  createGame,
  REINO_INFO,
  REINOS,
  RuleError,
  viewFor,
  type Action,
  type BotLevel,
  type GameState,
  type Reino,
} from '../engine';
import { PORTADA, pergaminoImg, preloadCards, RegenteCard } from './cards';
import { Rules } from './Rules';
import { call, forgetSession, lastCode, loadSessions, saveSession, socket, tabSessions, type PublicRoom } from './socket';
import { Table, type SeatMeta } from './Table';

type Screen = 'home' | 'local-setup' | 'local' | 'online' | 'rules';
const LEVELS: BotLevel[] = ['facil', 'normal', 'dificil'];
const codeFromUrl = () => new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? null;

export function App() {
  const [screen, setScreen] = useState<Screen>(() => (codeFromUrl() ? 'online' : loadLocal() ? 'local' : 'home'));
  useEffect(() => preloadCards(REINOS), []);
  if (screen === 'local-setup') return <LocalSetup onBack={() => setScreen('home')} onStart={() => setScreen('local')} />;
  if (screen === 'local') return <LocalGame onExit={() => setScreen('home')} />;
  if (screen === 'online') return <Online onExit={() => setScreen('home')} />;
  if (screen === 'rules')
    return (
      <div className="page">
        <div className="sheet">
          <button className="back" onClick={() => setScreen('home')}>
            ← Volver
          </button>
          <h1>Reglas de REGIUM</h1>
          <Rules />
        </div>
      </div>
    );
  return (
    <div className="home">
      <div className="home-bg" style={{ backgroundImage: `url(${PORTADA})` }} />
      <img className="cover" src={PORTADA} alt="REGIUM" />
      <div className="home-content">
        <div className="menu">
          <button className="start" onClick={() => setScreen('online')}>
            Jugar online
          </button>
          <button className="start" onClick={() => setScreen('local-setup')}>
            Jugar en este dispositivo
          </button>
          <button className="link" onClick={() => setScreen('rules')}>
            Reglas
          </button>
          {loadLocal() && (
            <button className="link" onClick={() => setScreen('local')}>
              Continuar la partida guardada
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Elegir reino (se usa en las dos configuraciones)
// ---------------------------------------------------------------------------------------------
function ReinoTile({
  reino,
  children,
  selected,
  onClick,
}: {
  reino: Reino;
  children?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`reino-tile ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''}`}
      style={{ backgroundImage: `url(${pergaminoImg(reino)})`, ['--rc' as string]: REINO_INFO[reino].color }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <RegenteCard reino={reino} flipped={hover} />
      <div className="reino-name">
        {REINO_INFO[reino].nombre}
        <small>{REINO_INFO[reino].escudo}</small>
      </div>
      <div className="reino-body" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Partida en este dispositivo (contra la máquina y/o por turnos)
// ---------------------------------------------------------------------------------------------
type LocalSeat = { reino: Reino; kind: 'human' | BotLevel; name: string };
interface LocalSave {
  game: GameState;
  seats: SeatMeta[];
}
const LOCAL_KEY = 'regium:local';
function loadLocal(): LocalSave | null {
  try {
    const s = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as LocalSave | null;
    return s && s.game.phase !== 'GAME_OVER' ? s : null;
  } catch {
    return null;
  }
}
function saveLocal(s: LocalSave | null) {
  try {
    if (s) localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

function LocalSetup({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const [seats, setSeats] = useState<Record<Reino, LocalSeat | null>>(() => ({
    rojo: { reino: 'rojo', kind: 'human', name: 'Jugador 1' },
    verde: { reino: 'verde', kind: 'normal', name: '' },
    amarillo: { reino: 'amarillo', kind: 'normal', name: '' },
    azul: null,
    morado: null,
  }));
  const chosen = REINOS.map((r) => seats[r]).filter(Boolean) as LocalSeat[];
  const humans = chosen.filter((s) => s.kind === 'human').length;
  const set = (r: Reino, v: LocalSeat | null) => setSeats({ ...seats, [r]: v });
  const start = () => {
    const players = chosen.map((s, i) => ({
      name: s.kind === 'human' ? s.name.trim() || `Jugador ${i + 1}` : BOT_NAMES[s.reino],
      reino: s.reino,
    }));
    const game = createGame(players, Math.floor(Math.random() * 2 ** 31));
    saveLocal({ game, seats: chosen.map((s, i) => ({ name: players[i].name, bot: s.kind === 'human' ? null : s.kind })) });
    onStart();
  };
  return (
    <div className="page">
      <div className="sheet wide">
        <button className="back" onClick={onBack}>
          ← Volver
        </button>
        <h1>Partida en este dispositivo</h1>
        <div className="reinos">
          {REINOS.map((r) => {
            const s = seats[r];
            return (
              <ReinoTile key={r} reino={r} selected={!!s}>
                <select
                  value={s ? s.kind : 'none'}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'none') set(r, null);
                    else set(r, { reino: r, kind: v as LocalSeat['kind'], name: s?.name || (v === 'human' ? `Jugador ${humans + 1}` : '') });
                  }}
                >
                  <option value="none">Fuera de la guerra</option>
                  <option value="human">Persona</option>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      Máquina · {BOT_LABEL[l]}
                    </option>
                  ))}
                </select>
                {s?.kind === 'human' && (
                  <input value={s.name} maxLength={20} placeholder="Nombre" onChange={(e) => set(r, { ...s, name: e.target.value })} />
                )}
              </ReinoTile>
            );
          })}
        </div>
        <div className="setup-foot">
          <button className="start" disabled={chosen.length < 2 || humans < 1} onClick={start}>
            Empezar la guerra
          </button>
        </div>
        {humans < 1 && <p className="hint">Hace falta al menos una persona.</p>}
      </div>
    </div>
  );
}

const BOT_NAMES: Record<Reino, string> = {
  rojo: 'Emperador del Dragón',
  verde: 'Reina del Águila',
  amarillo: 'Sultán de la Serpiente',
  azul: 'Rey del Norte',
  morado: 'Señor del Elefante',
};

const BOT_DELAY = 900;

function LocalGame({ onExit }: { onExit: () => void }) {
  const [save, setSave] = useState<LocalSave | null>(() => loadLocal());
  const [paused, setPaused] = useState(false);
  const humans = save ? save.seats.map((s, i) => (s.bot ? -1 : i)).filter((i) => i >= 0) : [];
  const lastHuman = useRef<number>(humans[0] ?? 0);
  const [revealed, setRevealed] = useState<number | null>(humans.length === 1 ? humans[0] : null);

  const g = save?.game;
  const turnIsHuman = !!g && g.phase !== 'GAME_OVER' && !save!.seats[g.turn].bot;
  if (g && turnIsHuman) lastHuman.current = g.turn;
  const viewSeat = lastHuman.current;

  const update = (game: GameState) => {
    const next = { ...save!, game };
    setSave(next);
    saveLocal(next);
  };

  // Las máquinas juegan solas, con una pausa para que se vea lo que hacen
  useEffect(() => {
    if (!g || g.phase === 'GAME_OVER' || paused) return;
    const level = save!.seats[g.turn].bot;
    if (!level) return;
    const justClosed = g.phase === 'PLAY' && g.trick.length === 0 && g.lastTrick && g.battle > 0;
    const t = setTimeout(() => {
      const a = chooseAction(g, g.turn, level);
      if (a) update(applyAction(g, g.turn, a));
    }, justClosed ? BOT_DELAY * 2 : BOT_DELAY);
    return () => clearTimeout(t);
  }, [g, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!save) onExit();
  }, [save]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!save || !g) return null;

  const send = async (a: Action) => {
    if (g.turn !== viewSeat) return 'No es tu turno.';
    try {
      update(applyAction(g, viewSeat, a));
      return null;
    } catch (e) {
      return e instanceof RuleError ? e.message : 'Error inesperado.';
    }
  };
  const exit = () => {
    if (g.phase === 'GAME_OVER') saveLocal(null);
    onExit();
  };

  // Varias personas en el mismo dispositivo: se tapa la pantalla al pasar el turno
  const needCurtain = humans.length > 1 && turnIsHuman && revealed !== g.turn;
  if (needCurtain)
    return (
      <div className="curtain" style={{ backgroundImage: `url(${pergaminoImg(g.players[g.turn].reino)})` }}>
        <div className="curtain-box">
          <RegenteCard reino={g.players[g.turn].reino} />
          <h2>Turno de {g.players[g.turn].name}</h2>
          <button className="start" onClick={() => setRevealed(g.turn)}>
            Ver mis cartas
          </button>
          <button className="link" onClick={exit}>
            Salir
          </button>
        </div>
      </div>
    );

  return (
    <Table
      game={viewFor(g, humans.length > 1 && revealed === null ? null : viewSeat)}
      mySeat={viewSeat}
      seats={save.seats}
      send={send}
      onExit={exit}
      pauseSummary={setPaused}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Online
// ---------------------------------------------------------------------------------------------
function Online({ onExit }: { onExit: () => void }) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState('');
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('regium:name') ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState(codeFromUrl() ?? '');

  useEffect(() => {
    const onRoom = (r: PublicRoom) => setRoom(r);
    const tryRejoin = async () => {
      setConnected(true);
      const c = codeFromUrl() ?? lastCode();
      if (!c) return;
      const own = tabSessions()[c];
      const token = own ?? loadSessions()[c];
      if (!token) return;
      const r = await call('rejoin', { code: c, token, onlyIfOffline: !own });
      if (r.ok) {
        saveSession(r.code!, r.token!);
        setMyId(r.playerId!);
        history.replaceState(null, '', `?sala=${r.code}`);
      } else if (own) forgetSession(c);
    };
    const onDisconnect = () => setConnected(false);
    socket.on('room', onRoom);
    socket.on('connect', tryRejoin);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) tryRejoin();
    else socket.connect();
    return () => {
      socket.off('room', onRoom);
      socket.off('connect', tryRejoin);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const entered = (r: Awaited<ReturnType<typeof call>>) => {
    if (!r.ok) return setError(r.error ?? 'Error');
    setError('');
    saveSession(r.code!, r.token!);
    setMyId(r.playerId!);
    history.replaceState(null, '', `?sala=${r.code}`);
  };
  const rememberName = () => {
    try {
      localStorage.setItem('regium:name', name.trim());
    } catch {
      /* sin almacenamiento */
    }
  };
  const exit = () => {
    if (room) forgetSession(room.code, !!room.game);
    setRoom(null);
    setMyId(null);
    history.replaceState(null, '', location.pathname);
    socket.disconnect();
    onExit();
  };

  const me = room?.players.find((p) => p.id === myId);

  if (!room || !me)
    return (
      <div className="page">
        <div className="sheet">
          <button className="back" onClick={exit}>
            ← Volver
          </button>
          <h1>Jugar online</h1>
          {!connected && <p className="hint">Conectando con el servidor…</p>}
          <label className="field-label">
            Tu nombre
            <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Regente" />
          </label>
          <div className="online-choices">
            <div>
              <h3>Nueva partida</h3>
              <button
                className="start"
                onClick={async () => {
                  rememberName();
                  entered(await call('createRoom', { name }));
                }}
              >
                Crear partida
              </button>
            </div>
            <div>
              <h3>Unirse</h3>
              <input value={code} maxLength={5} placeholder="CÓDIGO" onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <button
                className="start"
                disabled={code.trim().length < 5}
                onClick={async () => {
                  rememberName();
                  entered(await call('joinRoom', { code, name }));
                }}
              >
                Unirse
              </button>
            </div>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );

  if (room.game)
    return <OnlineGame room={room} me={me} onExit={exit} setError={setError} error={error} connected={connected} />;
  return <Lobby room={room} me={me} onExit={exit} error={error} setError={setError} />;
}

type RoomPlayer = PublicRoom['players'][number];

function Lobby({
  room,
  me,
  onExit,
  error,
  setError,
}: {
  room: PublicRoom;
  me: RoomPlayer;
  onExit: () => void;
  error: string;
  setError: (e: string) => void;
}) {
  const host = room.hostId === me.id;
  const [level, setLevel] = useState<BotLevel>('normal');
  const link = `${location.origin}/?sala=${room.code}`;
  const run = async (ev: string, data?: unknown) => {
    const r = await call(ev, data);
    setError(r.ok ? '' : (r.error ?? 'Error'));
  };
  const allReady = room.players.length >= 2 && room.players.every((p) => p.ready && p.reino);
  return (
    <div className="page">
      <div className="sheet wide">
        <button className="back" onClick={() => run('leave').then(onExit)}>
          ← Salir
        </button>
        <h1>Partida {room.code}</h1>
        <p className="lead">
          <button className="link copy" onClick={() => navigator.clipboard?.writeText(link)} title="Copiar enlace">
            {link}
          </button>
        </p>
        <div className="reinos">
          {REINOS.map((r) => {
            const holder = room.players.find((p) => p.reino === r);
            return (
              <ReinoTile key={r} reino={r} selected={!!holder} onClick={!holder ? () => run('lobby', { reino: r }) : undefined}>
                {holder ? (
                  <div className="holder">
                    <b>{holder.id === me.id ? `${holder.name} (tú)` : holder.name}</b>
                    <span className={holder.ready ? 'ok' : 'muted'}>
                      {holder.bot ? `máquina · ${BOT_LABEL[holder.bot]}` : holder.ready ? 'preparado' : holder.online ? 'eligiendo…' : 'desconectado'}
                    </span>
                    {host && holder.bot && <button onClick={() => run('removeBot', { playerId: holder.id })}>Quitar</button>}
                  </div>
                ) : (
                  <div className="holder">
                    <span className="muted">Trono vacante</span>
                    {!me.reino && <span>Toca para elegirlo</span>}
                    {me.reino && <button onClick={() => run('lobby', { reino: r })}>Elegir este reino</button>}
                    {host && room.players.length < 5 && (
                      <button onClick={() => run('addBot', { reino: r, level })}>Añadir máquina</button>
                    )}
                  </div>
                )}
              </ReinoTile>
            );
          })}
        </div>
        <div className="setup-foot">
          <label>
            Tu nombre{' '}
            <input defaultValue={me.name} maxLength={20} onBlur={(e) => e.target.value !== me.name && run('lobby', { name: e.target.value })} />
          </label>
          {host && (
            <label>
              Nivel de la máquina{' '}
              <select value={level} onChange={(e) => setLevel(e.target.value as BotLevel)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {BOT_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button disabled={!me.reino} onClick={() => run('lobby', { ready: !me.ready })}>
            {me.ready ? 'No estoy preparado' : 'Estoy preparado'}
          </button>
          {host && (
            <button className="start" disabled={!allReady} onClick={() => run('start')}>
              Iniciar la guerra
            </button>
          )}
        </div>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}

function OnlineGame({
  room,
  me,
  onExit,
  error,
  setError,
  connected,
}: {
  room: PublicRoom;
  me: RoomPlayer;
  onExit: () => void;
  error: string;
  setError: (e: string) => void;
  connected: boolean;
}) {
  const g = room.game!;
  const bySeat = [...room.players].filter((p) => p.seat !== null).sort((a, b) => a.seat! - b.seat!);
  const host = room.hostId === me.id;
  return (
    <>
      {!connected && <div className="banner">Reconectando…</div>}
      {error && <div className="banner error">{error}</div>}
      <Table
        game={g}
        mySeat={me.seat}
        seats={bySeat.map((p) => ({ name: p.name, bot: p.bot, online: p.online }))}
        send={async (a) => {
          const r = await call('action', a);
          setError('');
          return r.ok ? null : (r.error ?? 'Error');
        }}
        onExit={onExit}
        seatExtra={(s) => {
          const p = bySeat[s];
          if (!host || !p || p.bot || p.online || g.phase === 'GAME_OVER') return null;
          return (
            <button className="small" onClick={() => call('takeover', { playerId: p.id })}>
              Ceder a la máquina
            </button>
          );
        }}
      />
    </>
  );
}
