# REGIUM — versión digital

Juego de cartas de 2 a 5 jugadores: cinco reinos, diecinueve guerras y siete ciudades para reinar
sobre todos. El servidor (o el navegador, en las partidas locales) aplica todas las reglas.

- **Reglas:** [`docs/REGLAMENTO.md`](docs/REGLAMENTO.md) es la única fuente de verdad, con las aclaraciones del autor.
  El juego muestra ese mismo texto en el botón **Reglas**.
- **Arte:** `arte/originales/` contiene las cartas tal como salen de la plantilla de imprenta (sin recortar).
  `npm run cartas` las recorta por la línea de corte y genera las imágenes del juego en `public/cartas/`.

## Modos de juego

- **Online:** «Jugar online» → *Crear partida* y compartir el enlace (`…/?sala=CÓDIGO`) o el código de 5 letras.
  Cada jugador elige su reino tocando su regente y pulsa *Estoy preparado*. Quien crea la partida puede
  ocupar los reinos libres con **máquinas** y la inicia. Cada jugador solo recibe sus propias cartas.
  Si alguien se desconecta, al volver con el enlace recupera su sitio; mientras tanto, el anfitrión puede
  **cederlo a la máquina**.
- **En este dispositivo:** contra la máquina, por turnos entre varias personas o mezclando ambos. Con varias
  personas, la pantalla se tapa al pasar el turno («Turno de…») para que nadie vea las cartas ajenas.
  La partida se guarda en el navegador y se puede continuar desde la portada.

### Jugadores máquina

Nunca ven las cartas de los demás: imaginan repartos posibles con las cartas que no conocen, respetando
los reinos de los que cada rival ya ha demostrado no tener.

- **Fácil:** apuesta por intuición y a veces juega al azar.
- **Medio:** calcula su apuesta simulando repartos posibles.
- **Difícil:** simula también cada carta que puede jugar y elige la que más veces le hace acertar.

En simulación (`npx tsx scripts/simulate.ts 100 dificil,normal,normal`) la difícil gana unas 7 de cada 10
partidas contra dos medias, y la media gana a las fáciles.

## Probarlo en tu ordenador

1. Instala **Node.js** 20 o superior.
2. En la carpeta del proyecto:
   ```bash
   npm install
   npm run jugar
   ```
3. Abre **http://localhost:3001**.

Para desarrollar: `npm run dev:server` y `npm run dev:client` (Vite en el puerto 5173).
Pruebas: `npm test` (reglas) y, con el servidor en marcha, `npx tsx scripts/e2e.ts` (partida online completa).

## Publicarlo en Internet (Render)

El repositorio incluye `render.yaml`. En https://render.com: **New → Blueprint**, conectar el repositorio y aceptar.
En el plan gratuito el servidor se duerme tras un rato sin uso y las partidas online guardadas pueden perderse
al reiniciarse; con un disco persistente (`DATA_DIR`) se conservan.
