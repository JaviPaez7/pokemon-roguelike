# PokéRogue

Juego de fans gratuito, al estilo de **Pokémon Mundo Misterioso**, con los 151 Pokémon de la primera generación. Se juega en el navegador: https://roguelike.javistudio.dev

Un test de personalidad decide tu Pokémon; eliges compañero y fundáis un equipo de exploración con base en Pueblo Raíz. Desde allí salís a mazmorras que se generan cada vez, cumplís encargos del tablón, reclutáis Pokémon y subís de rango, mientras sigue la historia original «El Eco del Norte».

## Cómo se juega

- **El pueblo**: sin turnos ni enemigos. Kecleon vende y compra, Kangaskhan guarda objetos, Persian guarda el dinero, en la base se forma el equipo, se duerme (pasa el día) y se guarda la partida, y el tablón tiene encargos nuevos cada día. La salida del sur lleva a las mazmorras.
- **Las mazmorras**: siete de historia (del Bosque Verde al Laboratorio Final, cada una con su jefe) y la Torre del Desafío, 50 pisos con reglas roguelike. Se juega por turnos: cada paso o ataque es un turno y los enemigos se mueven a la vez.
- **Combate**: cada movimiento tiene su alcance (delante, en línea, alrededor, toda la sala, uno mismo o el equipo), con tipos, estados, clima y habilidades.
- **El equipo**: hasta cuatro Pokémon. Los compañeros siguen al líder con la táctica que les pongas. Si el líder derrota a un salvaje, a veces este se levanta y pide unirse. Cada uno puede llevar un objeto equipado, y las Gominolas le suben el CI, que desbloquea habilidades.
- **Riesgos**: la tripa baja al andar, el viento expulsa al equipo si pasa demasiado tiempo en un piso y, si el equipo cae, vuelve al pueblo sin el dinero ni la mochila (el banco y el almacén se conservan). Con una Cuerda Huida se vuelve con todo.

### Controles

| Tecla | Acción |
| --- | --- |
| Flechas / WASD / HJKL | Moverse (chocar con un enemigo es un ataque básico) |
| Teclado numérico / YUBN | Diagonales |
| Mayús + dirección | Correr hasta que pase algo |
| Ctrl + dirección | Girarse sin gastar turno |
| 1-4 | Usar un movimiento |
| Z / Intro | Hablar, recoger, examinar, escaleras |
| X | Mochila |
| C | Equipo |
| Tab | Cambiar de líder (en la mazmorra) |
| M | Mapa |
| Esc | Pausa y guardar |

En el móvil salen una cruceta y botones táctiles.

## Desarrollo

Hace falta Node.js 22.12 o superior (lo pide Vitest 5).

```bash
npm ci            # dependencias
npm run dev       # servidor de desarrollo en http://localhost:5173
npm run build     # build de producción en dist/
npm test          # tests unitarios (Vitest) y después E2E (Playwright)
```

- `npm run test:unit`: lógica pura, en menos de un segundo.
- `npm run test:e2e`: Playwright sobre el build de producción servido con `vite preview` (puerto 4317; `E2E_PORT` lo cambia). La primera vez: `npx playwright install chromium`. Las partidas usan semilla fija (`?seed=` en la URL), así que son deterministas.
- `npm run story`: regenera `src/data/story.json` desde el guion (`docs/guion-historia.md`).
- `npm run sprites:pmd`: vuelve a descargar los sprites y retratos de PMDCollab (ya están en el repo).

La CI (`.github/workflows/ci.yml`) pasa los tests en cada PR y cada push a `master`; si pasan, un push a `master` despliega en producción.

## Estructura

JavaScript sin framework (módulos ES), Canvas 2D, arquitectura ECS y Vite. La única dependencia del juego es [rot-js](https://ondras.github.io/rot.js/) (RNG con semilla, campo de visión y rutas).

```text
src/
├── core/       # Game (estados y bucle), turnos, guardado, pueblo, expediciones, misiones, historia, RNG
├── entities/   # EntityManager, componentes ECS e IA de enemigos y aliados
├── systems/    # Sistemas ECS: combate, movimiento, objetos, trampas, clima, reclutamiento…
├── map/        # Generación de mazmorras, pisos, casillas y el pueblo
├── render/     # Canvas: mapa, entidades, sprites animados, partículas, cámara
├── ui/         # Menús HTML sobre el canvas, HUD, registro y diálogos
├── audio/      # Música y efectos sintetizados
├── input/      # Teclado y controles táctiles
└── data/       # Contenido y balance en JSON: Pokémon, movimientos, objetos, mazmorras, historia, consejos…
tests/
├── unit/       # Vitest
└── e2e/        # Playwright
```

El detalle técnico (flujo de estados, reglas del guardado, aleatoriedad, convenciones) está en [`CLAUDE.md`](CLAUDE.md).

## Licencia y créditos

PokéRogue es un juego de fans, **gratuito y sin ánimo de lucro**. Pokémon y sus personajes son © Nintendo, Creatures Inc. y GAME FREAK inc.; Pokémon Mundo Misterioso es de Spike Chunsoft. Este proyecto no tiene relación con ellos.

- **Sprites y retratos**: [PMDCollab / SpriteCollab](https://sprites.pmdcollab.org/). El arte de base de la 1.ª generación es el oficial de **Chunsoft**; las animaciones y emociones que ha añadido la comunidad se usan con licencia [CC BY-NC 4.0](public/sprites/pmd/LICENSE.md), que no permite el uso comercial. La lista de artistas está en [`public/sprites/pmd/CREDITS.txt`](public/sprites/pmd/CREDITS.txt) y en la pantalla de créditos del juego, que no se puede quitar. Por eso el juego tiene que seguir siendo gratuito y sin anuncios.
- **Sprites estáticos de reserva** (`public/sprites/pokemon/`): descargados de PokeAPI.
- **Tipografía**: Press Start 2P, de CodeMan38 (SIL Open Font License).
- **Motor**: rot-js (licencia BSD). La música y los efectos se sintetizan en el propio juego.
- **Historia**: «El Eco del Norte», guion y desarrollo de JaviStudio.
