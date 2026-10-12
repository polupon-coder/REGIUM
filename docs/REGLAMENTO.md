# REGIUM — Reglamento

Juego de cartas de 2 a 5 jugadores. Cada jugador es el regente de un reino y compite por levantar
**7 ciudades** antes que nadie. Este documento es la única fuente de verdad de la versión digital;
incluye las aclaraciones del autor.

## Componentes

| Componente | Cantidad |
|---|---|
| Regentes (retrato y escudo de madera en el reverso) | 5, uno por reino |
| Tropas (valores del 1 al 10) | 50, diez por reino |
| Lugares (territorio por una cara, ciudad por la otra) | 35, siete por reino |

Reinos: **Rojo** (dragón), **Verde** (águila), **Amarillo** (serpiente), **Azul** (cráneo astado) y
**Morado** (elefante). Solo se usan las tropas de los reinos que están en juego.

En la mesa los jugadores marcaban la guerra en curso y su apuesta con pergaminos indicadores; en la
versión digital la pantalla lo muestra siempre.

## Preparación

- Cada jugador elige un reino y empieza con **1 territorio** en juego. Sus otros 6 lugares forman su reserva.
- Se sortea quién es el primer **Emperador**. En cada guerra siguiente el trono pasa al jugador de la izquierda.
- Las tropas del reino del Emperador son **imperiales** durante esa guerra: son el triunfo.

## Las guerras

La partida tiene 10 guerras. La 1.ª tiene 1 batalla, la 2.ª 2 batallas… y la 10.ª, 10 batallas. En cada guerra se reparten a cada jugador tantas tropas como batallas tiene.

### 1. Estrategia (apuesta)

Empezando por el Emperador y siguiendo hacia la izquierda, cada jugador anuncia cuántas batallas va a
ganar (de 0 al número de batallas). Cada uno puede apostar lo que quiera.

### 2. Batallas

- El Emperador sale en la primera batalla; quien gana una batalla sale en la siguiente.
- Quien sale juega la tropa que quiera. Los demás, por orden:
  - Deben jugar una tropa del **reino de salida** y, **siempre que puedan, superar** a la que va ganando.
    Si ya gana una imperial (y el reino de salida no es el imperial), basta con jugar cualquiera del reino de salida.
  - Si no tienen del reino de salida, deben jugar una **imperial**, superando a la imperial que vaya ganando si pueden.
  - Si no tienen ni del reino de salida ni imperiales, juegan cualquier tropa (y pierden).
- Gana la batalla la imperial más alta; si no hay imperiales, la tropa más alta del reino de salida.

### 3. Resultado

Se resuelve por orden, empezando por el Emperador. Quien **acierta** su apuesta:

1. Gana **1 territorio** (de su reserva, si le queda alguno). Apostar 0 y acertar también lo da.
2. Puede usar sus **victorias** (batallas ganadas), y puede combinarlas:
   - **1 victoria**: convierte uno de sus territorios en ciudad (incluido el que acaba de ganar).
   - **1 victoria**: arrasa una ciudad de un rival, que vuelve a ser territorio.
   - **2 victorias**: conquista un territorio de un rival, que vuelve a su reserva.

Las victorias que no se puedan o no se quieran usar se pierden. Quien **falla** su apuesta no gana nada.

## Final

- Gana quien levanta su **7.ª ciudad**, en ese mismo momento (aunque otros no hayan resuelto todavía).
- Si nadie lo consigue al terminar la 10.ª guerra, gana quien tenga más ciudades; si empatan, quien tenga
  más territorios. Si aún empatan, comparten la victoria.

## Modos de la versión digital

- **Online**: cada jugador en su dispositivo; se comparte el enlace de la partida. Los reinos libres se
  pueden ocupar con bots.
- **En este dispositivo**: contra bots, por turnos entre varias personas en el mismo dispositivo
  (la pantalla se oculta al pasar el turno para que nadie vea las cartas ajenas), o mezclando ambos.
- **Bots**: imaginan repartos posibles de las cartas que no ven (nunca miran las cartas de los demás) para decidir su estrategia y cada tropa; al repartir victorias levantan ciudades y frenan a quien está cerca de ganar.
