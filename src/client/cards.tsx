// Imágenes de las cartas y piezas visuales reutilizables.
import { L, reinoName } from './i18n';
import { REINO_INFO, type Card, type Player, type Reino, type WarChanges } from '../engine';

const img = (name: string) => `/cartas/${name}.webp`;
export const tropaImg = (c: Card) => img(`tropa-${c.reino}-${String(c.valor).padStart(2, '0')}`);
export const regenteImg = (r: Reino) => img(`regente-${r}`);
export const escudoImg = (r: Reino) => img(`escudo-${r}`);
export const pergaminoImg = (r: Reino) => img(`pergamino-${r}`);
export const fondoImg = (r: Reino) => img(`fondo-${r}`);
export const lugarImg = (r: Reino, tipo: 'ciudad' | 'territorio', i: number) => img(`lugar-${r}-${tipo}-${i}`);
export const DORSO_TROPA = img('dorso-hierro');
export const PORTADA = '/ui/portada.webp';

/** Precarga todas las imágenes para que no parpadeen al aparecer. */
export function preloadCards(reinos: readonly Reino[]) {
  const urls: string[] = [DORSO_TROPA, PORTADA];
  for (const r of reinos) {
    urls.push(regenteImg(r), escudoImg(r), pergaminoImg(r));
    for (let v = 1; v <= 10; v++) urls.push(tropaImg({ reino: r, valor: v }));
    for (let i = 1; i <= 7; i++) urls.push(lugarImg(r, 'ciudad', i), lugarImg(r, 'territorio', i));
  }
  for (const u of urls) new Image().src = u;
}

export function Tropa({
  card,
  onClick,
  disabled,
  dim,
  className = '',
  title,
}: {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  dim?: boolean;
  className?: string;
  title?: string;
}) {
  const label = title ?? L(`${card.valor} del ${reinoName(card.reino)}`, `${card.valor} of the ${reinoName(card.reino)}`);
  const cls = `tropa ${dim ? 'dim' : ''} ${onClick && !disabled ? 'playable' : ''} ${className}`;
  if (onClick)
    return (
      <button className={cls} onClick={onClick} disabled={disabled} aria-label={label} title={label}>
        <img src={tropaImg(card)} alt="" draggable={false} />
      </button>
    );
  return (
    <div className={cls} title={label}>
      <img src={tropaImg(card)} alt={label} draggable={false} />
    </div>
  );
}

/** Carta de regente que se gira al pasar por encima para mostrar su escudo. */
export function RegenteCard({ reino, flipped, small }: { reino: Reino; flipped?: boolean; small?: boolean }) {
  return (
    <div className={`regente ${flipped ? 'flipped' : ''} ${small ? 'small' : ''}`}>
      <div className="regente-inner">
        <img className="front" src={regenteImg(reino)} alt={L(`Regente del ${reinoName(reino)}`, `Regent of the ${reinoName(reino)}`)} draggable={false} />
        <img className="back" src={escudoImg(reino)} alt={`Escudo: ${REINO_INFO[reino].escudo}`} draggable={false} />
      </div>
    </div>
  );
}

export type LugarClick = (tipo: 'ciudad' | 'territorio') => void;

/** Los 7 lugares de un jugador: ciudades, territorios y huecos de la reserva. */
export function Lugares({
  player,
  size = 'md',
  onClick,
  targetCity,
  targetTerritory,
  cambios,
}: {
  player: Player;
  size?: 'sm' | 'md' | 'lg';
  /** Si se da, marca lo nuevo de esta guerra y lo perdido. */
  cambios?: WarChanges;
  onClick?: LugarClick;
  targetCity?: boolean;
  targetTerritory?: boolean;
}) {
  const slots: { tipo: 'ciudad' | 'territorio' | 'reserva'; i: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const tipo = i < player.ciudades ? 'ciudad' : i < player.ciudades + player.territorios ? 'territorio' : 'reserva';
    slots.push({ tipo, i: i + 1 });
  }
  const C = player.ciudades;
  const T = player.territorios;
  // nuevo: ciudades levantadas y territorio ganado; arrasada: ciudad que volvió a territorio; perdido: territorio conquistado
  const marca = (k: number): string => {
    if (!cambios) return '';
    if (k < C) return k >= C - cambios.ciudades ? ' nuevo' : '';
    if (k < C + T) {
      if (k < C + cambios.ciudadesPerdidas) return ' arrasada';
      return k >= C + T - cambios.territorio ? ' nuevo' : '';
    }
    return k < C + T + cambios.territoriosPerdidos ? ' perdido' : '';
  };
  return (
    <div className={`lugares ${size}`} style={{ ['--nl' as string]: Math.max(1, player.ciudades + player.territorios) }} aria-label={L(`${player.ciudades} ciudades y ${player.territorios} territorios`, `${player.ciudades} cities and ${player.territorios} territories`)}>
      {slots.map((s) =>
        s.tipo === 'reserva' ? (
          marca(s.i - 1) ? (
            <span key={s.i} className="lugar territorio perdido" title={L('Territorio conquistado', 'Conquered territory')}>
              <img src={lugarImg(player.reino, 'territorio', s.i)} alt="" draggable={false} />
            </span>
          ) : (
            <span key={s.i} className="lugar reserva" />
          )
        ) : (
          (() => {
            const target = (s.tipo === 'ciudad' && targetCity) || (s.tipo === 'territorio' && targetTerritory);
            const title = s.tipo === 'ciudad' ? L('Ciudad', 'City') : L('Territorio', 'Territory');
            const im = <img src={lugarImg(player.reino, s.tipo, s.i)} alt="" draggable={false} />;
            return target && onClick ? (
              <button
                key={s.i}
                className={`lugar ${s.tipo} target`}
                onClick={() => onClick(s.tipo as 'ciudad' | 'territorio')}
                title={s.tipo === 'ciudad' ? L('Arrasar esta ciudad (1 victoria)', 'Raze this city (1 victory)') : L('Conquistar este territorio (2 victorias)', 'Conquer this territory (2 victories)')}
              >
                {im}
              </button>
            ) : (
              <span key={s.i} className={`lugar ${s.tipo}${marca(s.i - 1)}`} title={title}>
                {im}
              </span>
            );
          })()
        ),
      )}
    </div>
  );
}

export function CityCount({ player }: { player: Player }) {
  return (
    <span className="city-count" title={L(`${player.ciudades} ciudades · ${player.territorios} territorios`, `${player.ciudades} cities · ${player.territorios} territories`)}>
      <b>{player.ciudades}</b>
      <small>/7</small>
    </span>
  );
}
