// Salas: jugadores, lobby y persistencia en disco para poder reconectar sin perder la partida.
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyAction,
  chooseAction,
  createGame,
  legalBids,
  legalCards,
  imperial,
  pendingSeats,
  REINO_INFO,
  REINOS,
  RuleError,
  viewFor,
  type Action,
  type BotLevel,
  type GameState,
  type Reino,
} from '../engine';

export const MAX_PLAYERS = 5;

export interface LobbyPlayer {
  id: number;
  token: string;
  name: string;
  reino: Reino | null;
  ready: boolean;
  /** Jugador máquina (o humano cuyo sitio se ha cedido a la máquina). */
  bot?: BotLevel | null;
  /** Sitio de un humano cedido a la máquina: lo recupera al volver. */
  takeover?: boolean;
  /** Asiento en la partida (orden alrededor de la mesa). */
  seat?: number;
}

export interface ChatMessage {
  n: number;
  playerId: number;
  text: string;
  ts: number;
}

export interface Room {
  code: string;
  createdAt: number;
  updatedAt?: number;
  hostId: number;
  players: LobbyPlayer[];
  game: GameState | null;
  version: number;
  chat?: ChatMessage[];
}

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data', 'rooms');
mkdirSync(DATA_DIR, { recursive: true });

const rooms = new Map<string, Room>();

export class RoomError extends Error {}

function save(room: Room) {
  room.version++;
  room.updatedAt = Date.now();
  const file = join(DATA_DIR, `${room.code}.json`);
  writeFileSync(file + '.tmp', JSON.stringify(room));
  renameSync(file + '.tmp', file);
}

/** Borrado automático: partidas terminadas tras 3 días y cualquier sala sin actividad durante 14 días. */
const DAY = 24 * 60 * 60 * 1000;
export function purgeOldRooms(now = Date.now()) {
  let n = 0;
  for (const room of [...rooms.values()]) {
    const last = room.updatedAt ?? room.createdAt;
    const finished = room.game?.phase === 'GAME_OVER';
    if (now - last > (finished ? 3 * DAY : 14 * DAY)) {
      rooms.delete(room.code);
      try {
        unlinkSync(join(DATA_DIR, `${room.code}.json`));
      } catch {
        /* ya no existía */
      }
      n++;
    }
  }
  return n;
}

export function loadRooms() {
  for (const f of readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const room = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')) as Room;
      rooms.set(room.code, room);
    } catch {
      /* archivo dañado: se ignora */
    }
  }
  return rooms.size;
}

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('');
    if (!rooms.has(code) && !existsSync(join(DATA_DIR, `${code}.json`))) return code;
  }
}

const cleanName = (name: unknown) => String(name ?? '').trim().slice(0, 20) || 'Regente';
const freeReino = (room: Room) => REINOS.find((r) => !room.players.some((p) => p.reino === r)) ?? null;

export function getRoom(code: string): Room {
  const room = rooms.get(String(code ?? '').toUpperCase().trim());
  if (!room) throw new RoomError('Esa partida no existe.');
  return room;
}

export function playerByToken(room: Room, token: string) {
  const p = room.players.find((x) => x.token === token);
  if (!p) throw new RoomError('No perteneces a esta partida.');
  return p;
}

const nextId = (room: Room) => room.players.reduce((m, x) => Math.max(m, x.id), -1) + 1;

function addPlayer(room: Room, name: string): LobbyPlayer {
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  if (room.players.length >= MAX_PLAYERS) throw new RoomError(`La partida está completa (${MAX_PLAYERS} jugadores).`);
  const p: LobbyPlayer = {
    id: nextId(room),
    token: randomBytes(16).toString('hex'),
    name: cleanName(name),
    reino: freeReino(room),
    ready: false,
  };
  room.players.push(p);
  return p;
}

export function createRoom(name: string) {
  const room: Room = { code: newCode(), createdAt: Date.now(), hostId: 0, players: [], game: null, version: 0 };
  const p = addPlayer(room, name);
  room.hostId = p.id;
  rooms.set(room.code, room);
  save(room);
  return { room, player: p };
}

export function joinRoom(code: string, name: string) {
  const room = getRoom(code);
  const p = addPlayer(room, name);
  save(room);
  return { room, player: p };
}

export function updateLobby(room: Room, token: string, patch: { name?: string; reino?: Reino; ready?: boolean }) {
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  const p = playerByToken(room, token);
  if (patch.name !== undefined) p.name = cleanName(patch.name);
  if (patch.reino !== undefined) {
    if (!REINOS.includes(patch.reino)) throw new RoomError('Reino no válido.');
    if (room.players.some((o) => o !== p && o.reino === patch.reino)) throw new RoomError('Ese reino ya tiene regente.');
    p.reino = patch.reino;
    p.ready = false;
  }
  if (patch.ready !== undefined) p.ready = !!patch.ready;
  save(room);
}

export function leaveLobby(room: Room, token: string) {
  if (room.game) return;
  const p = playerByToken(room, token);
  room.players = room.players.filter((x) => x !== p);
  const human = room.players.find((x) => !x.bot);
  if (room.hostId === p.id && human) room.hostId = human.id;
  save(room);
}

export function startGame(room: Room, token: string) {
  const p = playerByToken(room, token);
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  if (p.id !== room.hostId) throw new RoomError('Solo quien creó la partida puede iniciarla.');
  if (room.players.length < 2) throw new RoomError('Hacen falta al menos 2 regentes.');
  if (room.players.some((x) => !x.ready || !x.reino)) throw new RoomError('Todos los regentes deben estar preparados.');
  // El orden de la mesa es el de los reinos (rojo, verde, amarillo, azul, morado)
  const order = [...room.players].sort((a, b) => REINOS.indexOf(a.reino!) - REINOS.indexOf(b.reino!));
  order.forEach((x, i) => (x.seat = i));
  room.game = createGame(
    order.map((x) => ({ name: x.name, reino: x.reino! })),
    randomInt(2 ** 31),
  );
  save(room);
}

export function act(room: Room, token: string, action: Action) {
  if (!room.game) throw new RoomError('La partida no ha empezado.');
  const p = playerByToken(room, token);
  if (p.seat === undefined) throw new RoomError('No juegas en esta partida.');
  try {
    room.game = applyAction(room.game, p.seat, action);
  } catch (e) {
    if (e instanceof RuleError) throw new RoomError(e.message);
    throw e;
  }
  save(room);
}

export function addChat(room: Room, token: string, text: unknown) {
  const p = playerByToken(room, token);
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!clean) throw new RoomError('Mensaje vacío.');
  const chat = (room.chat ??= []);
  chat.push({ n: (chat.at(-1)?.n ?? 0) + 1, playerId: p.id, text: clean, ts: Date.now() });
  if (chat.length > 200) chat.splice(0, chat.length - 200);
  save(room);
}

/** Estado que ve un jugador: sin tokens, sin semilla y sin las manos de los demás. */
export function publicRoom(room: Room, online: Set<number>, viewerId: number | null) {
  const viewer = room.players.find((p) => p.id === viewerId);
  return {
    code: room.code,
    hostId: room.hostId,
    version: room.version,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      reino: p.reino,
      ready: p.ready,
      online: online.has(p.id),
      bot: p.bot ?? null,
      seat: p.seat ?? null,
    })),
    game: room.game ? viewFor(room.game, viewer?.seat ?? null) : null,
    chat: room.chat ?? [],
  };
}
export type PublicRoom = ReturnType<typeof publicRoom>;

// ---------------------------------------------------------------------------------------------
// Jugadores máquina
// ---------------------------------------------------------------------------------------------

function requireHost(room: Room, token: string) {
  const p = playerByToken(room, token);
  if (p.id !== room.hostId) throw new RoomError('Solo quien creó la partida puede hacerlo.');
  return p;
}

const validLevel = (l: unknown): l is BotLevel => l === 'facil' || l === 'normal' || l === 'dificil';

export function addBot(room: Room, token: string, reino: Reino, level: BotLevel) {
  requireHost(room, token);
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  if (!REINOS.includes(reino)) throw new RoomError('Reino no válido.');
  if (!validLevel(level)) throw new RoomError('Nivel no válido.');
  if (room.players.some((p) => p.reino === reino)) throw new RoomError('Ese reino ya tiene regente.');
  if (room.players.length >= MAX_PLAYERS) throw new RoomError('La partida está completa.');
  room.players.push({
    id: nextId(room),
    token: randomBytes(16).toString('hex'),
    name: REINO_INFO[reino].nombre,
    reino,
    ready: true,
    bot: level,
  });
  save(room);
}

export function removeBot(room: Room, token: string, playerId: number) {
  requireHost(room, token);
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  const p = room.players.find((x) => x.id === playerId);
  if (!p?.bot) throw new RoomError('Ese jugador no es una máquina.');
  room.players = room.players.filter((x) => x !== p);
  save(room);
}

/** El anfitrión cede a la máquina el sitio de un jugador desconectado (lo recupera al volver). */
export function takeover(room: Room, token: string, playerId: number, online: Set<number>) {
  requireHost(room, token);
  if (!room.game) throw new RoomError('La partida no ha empezado.');
  const p = room.players.find((x) => x.id === playerId);
  if (!p) throw new RoomError('Jugador desconocido.');
  if (p.bot) throw new RoomError('Ese sitio ya lo juega la máquina.');
  if (online.has(p.id)) throw new RoomError('Ese jugador está conectado.');
  p.bot = 'normal';
  p.takeover = true;
  save(room);
}

/** Al volver, el humano recupera su sitio. */
export function releaseTakeover(room: Room, token: string) {
  const p = playerByToken(room, token);
  if (!p.takeover) return false;
  p.bot = null;
  p.takeover = false;
  save(room);
  return true;
}

export function pendingBot(room: Room) {
  const g = room.game;
  if (!g || g.phase === 'GAME_OVER') return null;
  const seats = pendingSeats(g);
  return room.players.find((p) => p.bot && p.seat !== undefined && seats.includes(p.seat)) ?? null;
}

/** La máquina pendiente hace una acción; si fallase, juega cualquier acción legal para no parar. */
export function botStep(room: Room) {
  const bot = pendingBot(room);
  if (!bot || !room.game) return false;
  const g = room.game;
  const seat = bot.seat!;
  const tries: Action[] = [];
  const choice = chooseAction(g, seat, bot.bot!);
  if (choice) tries.push(choice);
  if (g.phase === 'BID') tries.push({ type: 'bid', n: legalBids(g)[0] });
  if (g.phase === 'PLAY') tries.push({ type: 'play', card: legalCards(g.players[seat].hand, g.trick, imperial(g))[0] });
  if (g.phase === 'RESOLVE') tries.push({ type: 'pass' });
  for (const a of tries) {
    try {
      act(room, bot.token, a);
      return true;
    } catch (e) {
      console.error(`Máquina ${bot.name} en ${room.code}:`, (e as Error).message, JSON.stringify(a));
    }
  }
  return false;
}

export const allRooms = () => [...rooms.values()];
