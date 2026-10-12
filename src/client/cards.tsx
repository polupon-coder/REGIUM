// Imágenes de las cartas y piezas visuales reutilizables.
import { REINO_INFO, type Card, type Player, type Reino } from '../engine';

const img = (name: string) => `/cartas/${name}.webp`;
export const tropaImg = (c: Card) => img(`tropa-${c.reino}-${String(c.valor).padStart(2, '0')}`);
export const regenteImg = (r: Reino) => img(`regente-${r}`);
export const escudoImg = (r: Reino) => img(`escudo-${r}`);
export const pergaminoImg = (r: Reino) => img(`pergamino-${r}`);
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
  const label = title ?? `${card.valor} del ${REINO_INFO[card.reino].nombre}`;
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
        <img className="front" src={regenteImg(reino)} alt={`Regente del ${REINO_INFO[reino].nombre}`} draggable={false} />
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
}: {
  player: Player;
  size?: 'sm' | 'md' | 'lg';
  onClick?: LugarClick;
  targetCity?: boolean;
  targetTerritory?: boolean;
}) {
  const slots: { tipo: 'ciudad' | 'territorio' | 'reserva'; i: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const tipo = i < player.ciudades ? 'ciudad' : i < player.ciudades + player.territorios ? 'territorio' : 'reserva';
    slots.push({ tipo, i: i + 1 });
  }
  return (
    <div className={`lugares ${size}`} aria-label={`${player.ciudades} ciudades y ${player.territorios} territorios`}>
      {slots.map((s) =>
        s.tipo === 'reserva' ? (
          <span key={s.i} className="lugar reserva" />
        ) : (
          (() => {
            const target = (s.tipo === 'ciudad' && targetCity) || (s.tipo === 'territorio' && targetTerritory);
            const title = s.tipo === 'ciudad' ? 'Ciudad' : 'Territorio';
            const im = <img src={lugarImg(player.reino, s.tipo, s.i)} alt="" draggable={false} />;
            return target && onClick ? (
              <button
                key={s.i}
                className={`lugar ${s.tipo} target`}
                onClick={() => onClick(s.tipo as 'ciudad' | 'territorio')}
                title={s.tipo === 'ciudad' ? 'Arrasar esta ciudad (1 victoria)' : 'Conquistar este territorio (2 victorias)'}
              >
                {im}
              </button>
            ) : (
              <span key={s.i} className={`lugar ${s.tipo}`} title={title}>
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
    <span className="city-count" title={`${player.ciudades} ciudades · ${player.territorios} territorios`}>
      <b>{player.ciudades}</b>
      <small>/7</small>
    </span>
  );
}
