import { useEffect, useRef, useState } from 'react';
import {
  applyAction,
  chooseAction,
  createGame,
  REINO_INFO,
  REINOS,
  RuleError,
  viewFor,
  type Action,
  BOT_LABEL,
  type BotLevel,
  type GameState,
  type Reino,
} from '../engine';
import { PORTADA, pergaminoImg, preloadCards, RegenteCard, regenteImg, escudoImg } from './cards';
import { Rules } from './Rules';
import { EN, L, playerName, reinoName, setLang, trError } from './i18n';
import { call, forgetSession, lastCode, loadSessions, saveSession, socket, tabSessions, type PublicRoom } from './socket';
import { CoinButton, Table, TEXTO_REINO, type SeatMeta } from './Table';

/** «Bot fácil» / «Easy bot». */
const botLabel = (b: BotLevel) => L(`Bot ${BOT_LABEL[b]}`, `${b === 'facil' ? 'Easy' : b === 'dificil' ? 'Hard' : 'Medium'} bot`);

type Screen = 'home' | 'local-setup' | 'local' | 'online' | 'rules';
const codeFromUrl = () => new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? null;

export function App() {
  const [screen, setScreen] = useState<Screen>(() => (codeFromUrl() ? 'online' : loadLocal() ? 'local' : 'home'));
  useEffect(() => preloadCards(REINOS), []);
  if (screen === 'local-setup') return <LocalSetup onBack={() => setScreen('home')} onStart={() => setScreen('local')} />;
  if (screen === 'local') return <LocalGame onExit={() => setScreen('home')} />;
  if (screen === 'online') return <Online onExit={() => setScreen('home')} />;
  if (screen === 'rules')
    return (
      <div className="setup">
        <SetupHead title={L('Reglas', 'Rules')} onBack={() => setScreen('home')} />
        <div className="sheet">
          <Rules />
        </div>
      </div>
    );
  return (
    <div className="home">
      <div className="home-bg" style={{ backgroundImage: `url(${PORTADA})` }} />
      <img className="cover solo-movil" src={PORTADA} alt="REGIUM" />
      <img className="titulo-pc solo-pc" src="/ui/titulo.webp" alt="REGIUM" />
      <div className="home-content">
        <div className="menu">
          <button className="start" onClick={() => setScreen('online')}>
            {L('Jugar online', 'Play online')}
          </button>
          <button className="start" onClick={() => setScreen('local-setup')}>
            {L('Jugar aquí', 'Play here')}
          </button>
          {loadLocal() && (
            <button className="link" onClick={() => setScreen('local')}>
              {L('Continuar la partida guardada', 'Continue saved game')}
            </button>
          )}
          <div className="langs" role="group" aria-label="Idioma / Language">
            <button className={!EN ? 'on' : ''} onClick={() => EN && setLang('es')} aria-pressed={!EN}>
              Español
            </button>
            <span aria-hidden>·</span>
            <button className={EN ? 'on' : ''} onClick={() => !EN && setLang('en')} aria-pressed={EN}>
              English
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Elegir reino (se usa en las dos configuraciones)
// ---------------------------------------------------------------------------------------------
/** Trono de un reino: el retrato del regente; se toca para elegirlo o cambiarlo. */
function Trono({
  reino,
  state,
  caption,
  sub,
  onClick,
  children,
}: {
  reino: Reino;
  state: 'libre' | 'ocupado' | 'mio';
  caption: string;
  sub?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`trono ${state}`} style={{ ['--rc' as string]: REINO_INFO[reino].color, ['--tc' as string]: TEXTO_REINO[reino] }}>
      <button className="trono-img" onClick={onClick} disabled={!onClick} aria-label={reinoName(reino)}>
        <img src={state === 'libre' ? escudoImg(reino) : regenteImg(reino)} alt="" draggable={false} />
      </button>
      <div className="trono-caption">{caption}</div>
      <div className="trono-sub">{sub ?? '\u00a0'}</div>
      <div className="trono-extra">{children}</div>
    </div>
  );
}

/** Cabecera de las pantallas de preparación: volver a la izquierda y título centrado. */
function SetupHead({ title, onBack, children }: { title: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <header className="setup-head">
      <CoinButton glyph="←" label={L('Volver', 'Back')} onClick={onBack} />
      <h1>{title}</h1>
      <div className="setup-head-right">{children}</div>
    </header>
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
    rojo: { reino: 'rojo', kind: 'human', name: L('Jugador 1', 'Player 1') },
    verde: { reino: 'verde', kind: 'dificil', name: '' },
    amarillo: { reino: 'amarillo', kind: 'dificil', name: '' },
    azul: null,
    morado: null,
  }));
  const chosen = REINOS.map((r) => seats[r]).filter(Boolean) as LocalSeat[];
  const humans = chosen.filter((s) => s.kind === 'human').length;
  const set = (r: Reino, v: LocalSeat | null) => setSeats({ ...seats, [r]: v });
  const start = () => {
    const players = chosen.map((s, i) => ({
      name: s.kind === 'human' ? s.name.trim() || `${L('Jugador', 'Player')} ${i + 1}` : REINO_INFO[s.reino].nombre,
      reino: s.reino,
    }));
    const game = createGame(players, Math.floor(Math.random() * 2 ** 31));
    saveLocal({ game, seats: chosen.map((s, i) => ({ name: players[i].name, bot: s.kind === 'human' ? null : s.kind })) });
    onStart();
  };
  const CYCLE: (LocalSeat['kind'] | null)[] = [null, 'human', 'facil', 'dificil'];
  const cycle = (r: Reino) => {
    const cur = seats[r]?.kind ?? null;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    set(r, next ? { reino: r, kind: next, name: seats[r]?.name || (next === 'human' ? `${L('Jugador', 'Player')} ${humans + 1}` : '') } : null);
  };
  return (
    <div className="setup">
      <SetupHead title={L('Jugar aquí', 'Play here')} onBack={onBack} />
      <div className="tronos">
        {REINOS.map((r) => {
          const s = seats[r];
          return (
            <Trono
              key={r}
              reino={r}
              state={!s ? 'libre' : s.kind === 'human' ? 'mio' : 'ocupado'}
              caption={!s ? L('Libre', 'Free') : s.kind === 'human' ? L('Persona', 'Human') : botLabel(s.kind)}
              onClick={() => cycle(r)}
            >
              {s?.kind === 'human' && (
                <input value={s.name} maxLength={20} placeholder={L('Nombre', 'Name')} onChange={(e) => set(r, { ...s, name: e.target.value })} />
              )}
            </Trono>
          );
        })}
      </div>
      <div className="setup-foot">
        <button className="start" disabled={chosen.length < 2 || humans < 1} onClick={start}>
          {L('Empezar la guerra', 'Start the war')}
        </button>
      </div>
    </div>
  );
}


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
      return trError(e instanceof RuleError ? e.message : 'Error inesperado.');
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
          <h2>
            {L('Turno de', 'Turn of')} {playerName(g.players[g.turn])}
          </h2>
          <button className="start" onClick={() => setRevealed(g.turn)}>
            {L('Ver mis cartas', 'Show my cards')}
          </button>
          <button className="link" onClick={exit}>
            {L('Salir', 'Exit')}
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
      <div className="setup">
        <SetupHead title="Online" onBack={exit} />
        <div className="online-entry">
          <input className="big-input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder={L('Tu nombre', 'Your name')} />
          <button
            className="start"
            disabled={!connected}
            onClick={async () => {
              rememberName();
              entered(await call('createRoom', { name }));
            }}
          >
            {L('Crear partida', 'Create game')}
          </button>
          <div className="join-row">
            <input className="big-input code" value={code} maxLength={5} placeholder={L('CÓDIGO', 'CODE')} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button
              className="start"
              disabled={code.trim().length < 5 || !connected}
              onClick={async () => {
                rememberName();
                entered(await call('joinRoom', { code, name }));
              }}
            >
              {L('Unirse', 'Join')}
            </button>
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
  const link = `${location.origin}/?sala=${room.code}`;
  const [copied, setCopied] = useState(false);
  const run = async (ev: string, data?: unknown) => {
    const r = await call(ev, data);
    setError(r.ok ? '' : (r.error ?? 'Error'));
    return r.ok;
  };
  const allReady = room.players.length >= 2 && room.players.every((p) => p.reino);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'REGIUM', url: link });
      else await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* cancelado */
    }
  };
  return (
    <div className="setup">
      <SetupHead title={room.code} onBack={() => run('leave').then(onExit)}>
        <CoinButton glyph="⤴" label={copied ? L('Copiado', 'Copied') : L('Invitar', 'Invite')} onClick={share} />
      </SetupHead>
      <div className="tronos">
        {REINOS.map((r) => {
          const holder = room.players.find((p) => p.reino === r);
          if (!holder)
            return (
              <Trono key={r} reino={r} state="libre" caption={L('Libre', 'Free')} onClick={() => run('lobby', { reino: r, ready: true })}>
                {host && room.players.length < 5 && (
                  <CoinButton glyph="+" label="Bot" onClick={() => run('addBot', { reino: r, level: 'facil' })} />
                )}
              </Trono>
            );
          const mine = holder.id === me.id;
          return (
            <Trono
              key={r}
              reino={r}
              state={mine ? 'mio' : 'ocupado'}
              caption={holder.bot ? botLabel(holder.bot) : holder.name}
              sub={!holder.bot && !holder.online ? L('desconectado', 'offline') : undefined}
              onClick={
                host && holder.bot
                  ? () => run('botLevel', { playerId: holder.id, level: holder.bot === 'facil' ? 'dificil' : 'facil' })
                  : undefined
              }
            >
              {host && holder.bot && <CoinButton glyph="✕" label={L('Quitar', 'Remove')} onClick={() => run('removeBot', { playerId: holder.id })} />}
            </Trono>
          );
        })}
      </div>
      <div className="setup-foot">
        <input
          className="big-input"
          defaultValue={me.name}
          maxLength={20}
          placeholder={L('Tu nombre', 'Your name')}
          onBlur={(e) => e.target.value !== me.name && run('lobby', { name: e.target.value })}
        />
        {host && (
          <button className="start" disabled={!allReady} onClick={() => run('start')}>
            {L('Iniciar la guerra', 'Start the war')}
          </button>
        )}
      </div>
      {error && <div className="error center">{error}</div>}
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
      {!connected && <div className="banner">{L('Reconectando…', 'Reconnecting…')}</div>}
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
              {L('Ceder al bot', 'Hand over to bot')}
            </button>
          );
        }}
      />
    </>
  );
}
