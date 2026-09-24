# PokéRogue

Un Pokémon Mundo Misterioso hecho por fans, con los 151 Pokémon de la primera generación, que se juega en el navegador. Formas un equipo de exploración con base en Pueblo Raíz y sales a mazmorras procedurales por turnos. Por el camino cumples misiones, reclutas Pokémon, subes de rango y sigues una historia original, «El Eco del Norte».

**Juega en https://roguelike.javistudio.dev**

## Cómo se juega

- **Empezar.** Un test de personalidad decide qué Pokémon eres. Eliges compañero (de otro tipo) y el nombre del equipo, y empieza el prólogo.
- **Pueblo Raíz.** Es la base, sin turnos ni enemigos:
  - Kecleon vende provisiones, Kangaskhan guarda objetos y Persian guarda el dinero.
  - En la base se forma el equipo, se duerme hasta el día siguiente, se guarda la partida y está el Diario para volver a ver escenas.
  - El tablón tiene encargos nuevos cada día.
- **Mazmorras.** Hay siete, del Bosque Verde al Laboratorio Final, cada una con su jefe.
  - Los pisos se generan al entrar y se juega por turnos.
  - Cada movimiento tiene su alcance: delante, en línea, alrededor, la sala entera, uno mismo o el equipo.
  - Si pasáis demasiado tiempo en un piso, el viento os expulsa.
  - Al caer se pierde el dinero y la mochila; lo del banco y el almacén no se pierde.
- **Reclutar.** No hay Poké Balls. A veces, el Pokémon que derrota el líder se levanta y pide unirse.
- **Objetos equipables y CI.** Cada Pokémon puede llevar un objeto. Las gominolas suben su CI (el cociente intelectual de Mundo Misterioso), y el CI desbloquea habilidades.
- **Historia.** Cada mazmorra es un capítulo, con escenas y retratos. La Torre del Desafío (50 pisos seguidos a nivel 5) espera tras el final.

### Controles

| Tecla | Acción |
|---|---|
| Flechas, WASD o teclado numérico | Moverse (también en diagonal) |
| Ctrl + dirección | Girarse sin gastar turno |
| Mayús + dirección | Correr hasta que pase algo |
| Z o Intro | Atacar, hablar, confirmar |
| 1 a 4 | Usar un movimiento |
| Espacio | Esperar un turno |
| X | Mochila |
| C | Equipo |
| Tab o Q | Cambiar de líder |
| M | Minimapa |
| Escape | Pausa, volver |

En el móvil hay controles táctiles.

## Tecnología

- JavaScript sin framework (módulos ES), Canvas 2D y arquitectura ECS.
- Vite 8 para el desarrollo y el build.
- La única dependencia en tiempo de ejecución es [rot-js](https://ondras.github.io/rot.js/): mazmorras, campo de visión y el generador aleatorio con semilla.
- Sprites animados y retratos de [PMDCollab](https://sprites.pmdcollab.org/).
- Música y efectos sintetizados en el propio juego.

## Estructura

```text
src/
├── main.js        Punto de entrada: crea el juego sobre el canvas
├── core/          Bucle y estados (Game), pueblo, expediciones, mazmorras, misiones,
│                  perfil, guardado, historia (Story, StorySession) y azar con semilla
├── entities/      ECS: EntityManager, componentes e IA de los enemigos
├── systems/       Combate, alcance, movimiento, campo de visión, objetos, trampas,
│                  reclutamiento, experiencia, evolución, clima, misiones…
├── map/           Generación de mazmorras, pisos, pueblo y tipos de casilla
├── render/        Canvas: mapa, entidades, sprites de PMDCollab, cámara, partículas
├── ui/            Menús en HTML sobre el canvas, HUD, diálogos con retrato
├── audio/         Música y efectos sintetizados
├── input/         Teclado y controles táctiles
└── data/          Contenido y balance en JSON: Pokémon, movimientos, objetos,
                   pisos, mazmorras, pueblo, historia…
docs/              El guion de la historia (fuente de src/data/story.json)
scripts/           Sprites de PMDCollab y generación de la historia
tests/unit/        Vitest: lógica pura
tests/e2e/         Playwright: el juego en el navegador, sobre el build de producción
```

## Desarrollo

Hace falta [Node.js](https://nodejs.org/) 22.

```bash
npm ci                  # dependencias
npm run dev             # servidor de desarrollo en http://localhost:5173
npm run build           # build de producción en dist/
npm test                # tests unitarios y después E2E
npm run test:unit       # solo unitarios (menos de un segundo)
npm run test:e2e        # solo E2E (la primera vez: npx playwright install chromium)
npm run story           # regenera src/data/story.json desde docs/guion-historia.md
npm run sprites:pmd     # vuelve a descargar los sprites de PMDCollab
```

Las partidas de los tests usan una semilla fija (`?seed=` en la URL), así que son deterministas. Más detalles para quien desarrolle, en [CLAUDE.md](CLAUDE.md).

## Despliegue

`master` va a producción. En cada PR y en cada push a `master`, la CI pasa los tests unitarios, el build y los E2E. En un push a `master`, si todo pasa, el mismo `dist/` que se ha probado se sube al servidor. Se trabaja en ramas y se fusiona por PR con la CI en verde.

## Partidas guardadas

Se guardan en el navegador (`localStorage`). Cuando cambia el formato, la partida se migra a la versión nueva y antes se guarda una copia de la original: nunca se borra la partida de nadie por una actualización.

## Créditos y licencia

- **Juego de fans, gratuito y sin ánimo de lucro.** Pokémon y sus personajes son © Nintendo, Creatures Inc. y GAME FREAK inc.; Pokémon Mundo Misterioso es de Spike Chunsoft. Este proyecto no tiene relación con ellos.
- **Sprites y retratos:** [PMDCollab / SpriteCollab](https://github.com/PMDCollab/SpriteCollab). El arte de base es el oficial de CHUNSOFT; las animaciones y emociones que ha añadido la comunidad se usan con licencia CC BY-NC 4.0. La lista de artistas está en `public/sprites/pmd/CREDITS.txt` y en la pantalla de créditos del juego. Por esa licencia, el juego no puede cobrarse ni llevar anuncios, y los créditos no se pueden quitar.
- **Motor y recursos:** rot-js (licencia BSD) y la tipografía Press Start 2P, de CodeMan38 (SIL Open Font License).
- **Historia:** «El Eco del Norte», original de este proyecto.
