# PokéRogue

Roguelike por turnos estilo Mystery Dungeon con los 151 Pokémon de primera generación. En producción: https://roguelike.javistudio.dev

JavaScript sin framework (módulos ES), Canvas 2D, arquitectura ECS y Vite 8. La única dependencia de runtime es `rot-js`. No es React ni una PWA, aunque alguna nota antigua lo diga.

## Comandos

- `npm run dev`: servidor de desarrollo en http://localhost:5173. Para comprobar cambios, ábrelo en el navegador integrado.
- `npm run build`: build de producción en `dist/`.
- `npm test`: test E2E con Puppeteer (`tests/test_play.js`). Arranca su propio `npm run dev` y abre el 5173, así que ese puerto tiene que estar libre: si Vite arranca en otro, el test prueba el servidor equivocado. Si el test falla, sale sin cerrar Vite; hay que parar a mano el proceso que queda en el 5173.
- `tests/test_click.js` y `tests/test_pickup.js` no están en `npm test`; se lanzan con `node tests/<fichero>`.
- `build:ghpages` y `build:itch` solo cambian la `base` (ver `vite.config.js`). Producción no los usa.

## Despliegue: cada push a `master` va a producción

`.github/workflows/deploy.yml` hace `npm ci`, `npm run build` y `rsync --delete` de `dist/` al VPS. **No ejecuta los tests.** Por tanto:

- Trabaja en una rama y fusiona en `master` solo con `npm run build` y `npm test` en verde, y el cambio probado en el navegador.
- `vercel.json` y `public/_redirects` son restos de despliegues anteriores (Vercel y Netlify). Producción es el VPS.

## Arquitectura (`src/`)

- `main.js` crea `Game` sobre `#game-canvas`. `window.game` queda expuesto para depurar desde la consola.
- `core/`: `Game` (máquina de estados `GAME_STATES` y bucle), `EventBus`, `GameEvents`, `GameSession`, `TurnManager`, `SaveManager`.
- `entities/`: `EntityManager`, `Components` (ECS) y `EnemyAI`.
- `systems/`: sistemas ECS (combate, movimiento, FOV, habilidades, captura, evolución, experiencia, inventario, objetos, trampas, clima, acciones, estadísticas y eventos de piso).
- `map/`: generación de mazmorras (`DungeonGenerator`), `FloorManager`, `TileMap`, `TileTypes` y `Biomes`.
- `render/`: `Renderer`, `MapRenderer`, `EntityRenderer`, `Camera`, `SpriteManager` y `ParticleSystem`.
- `ui/`: `UIManager` más `ui/menus/*` (menús en HTML sobre el canvas), `HUD`, `MessageLog` y `DialogController`.
- `audio/`: `MusicManager` y `SfxManager`.
- `data/`: JSON de Pokémon, movimientos, objetos, tipos, evoluciones y pisos, más `starterData.js`.
- `public/sprites/`: sprites. `download_sprites.cjs` baja los 151 de PokeAPI a `public/sprites/pokemon/`.

Flujo de estados: `Game.changeState(nuevo)` ejecuta `_onStateExit` y `_onStateEnter`, y emite `state_changed`. `UIManager.handleStateChange` abre o cierra el menú que toque. Si un menú llama a `changeState` al abrirse, puede provocar una recursión (ver «Estado conocido»).

La estructura del README está desactualizada (menciona `src/utils` y un sistema de carga en `src/assets` que no existen así). Manda el código.

## Reglas

- **Partidas guardadas:** se guardan en `localStorage` con la clave `pokerogue_save` y `SAVE_VERSION` (`core/SaveManager.js`). Si la versión no coincide, **se borra la partida del jugador**. Para cambiar el formato, mejor añadir campos con valor por defecto al cargar. Sube `SAVE_VERSION` solo si no hay alternativa, y dilo.
- El balance y el contenido van en `src/data/*.json`, no metidos en el código.
- No añadas dependencias sin un motivo claro: el juego solo depende de `rot-js`.

## Estado conocido (2026-09-23)

- **Bug en producción desde `75eebf4` (28 de julio):** abrir el menú de pausa (Escape) provoca una recursión infinita ("Maximum call stack size exceeded"). `openPauseMenu` (`ui/menus/PauseMenu.js`) llama a `game.changeState(MENU)`, que emite `state_changed`. `UIManager.handleStateChange(MENU)` ve `currentMenuType` aún en `null` y vuelve a llamar a `openPauseMenu`. `npm test` falla por esto en el paso 4, y producción sirve ese mismo build.

## Plan de mejora

Hay un plan por fases en la nota del vault. Se mantienen el motor y la arquitectura; se añaden tipos, tests, CI con barrera antes de desplegar, RNG con semilla y migraciones de guardado. Mientras no esté aplicado, en el código nuevo o tocado:

- Aleatoriedad solo con el RNG de rot-js, nunca `Math.random` (hoy conviven los dos y las partidas no se pueden reproducir).
- Tipos en JSDoc en las funciones que toques.
- Un menú no llama a `changeState` desde la reacción a `state_changed`.
- Todo cambio de comportamiento lleva un test que lo cubra.

## Contexto y registro

El contexto del proyecto y el registro de trabajo están en el vault de Obsidian, en la nota `Proyectos/PokéRogue`. Las instrucciones globales dicen cuándo y cómo escribir ahí.
