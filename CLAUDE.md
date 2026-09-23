# PokéRogue

Roguelike por turnos estilo Mystery Dungeon con los 151 Pokémon de primera generación. En producción: https://roguelike.javistudio.dev

JavaScript sin framework (módulos ES), Canvas 2D, arquitectura ECS y Vite 8. La única dependencia de runtime es `rot-js`. No es React ni una PWA, aunque alguna nota antigua lo diga.

## Comandos

- `npm run dev`: servidor de desarrollo en http://localhost:5173. Para comprobar cambios, ábrelo en el navegador integrado.
- `npm run build`: build de producción en `dist/`.
- `npm test`: tests E2E con Playwright (`tests/e2e/*.spec.js`). Playwright hace `vite build` y sirve el resultado con `vite preview` en el puerto 4317 (`E2E_PORT` lo cambia), así que prueba el build de producción. Usa `--strictPort`: si el puerto está ocupado falla con un error claro. Al acabar mata el servidor. La primera vez en una máquina nueva: `npx playwright install chromium`.
  - Un fichero o un test: `npm test -- tests/e2e/save-load.spec.js`, `npm test -- -g "mochila"`. Con navegador visible: `npm test -- --headed`.
  - `npm run test:report` abre el informe HTML de la última ejecución, con trazas de los fallos.
  - Cualquier `console.error` o excepción de la página hace fallar el test (`tests/e2e/fixtures.js`). Las peticiones a otros dominios (Google Fonts, sprites de PokeAPI) se responden en local.
  - La mazmorra aún es aleatoria: los tests eligen casillas libres leyendo el mapa desde `window.game`, no dan pasos a ciegas.
- `build:ghpages` y `build:itch` solo cambian la `base` (ver `vite.config.js`). Producción no los usa.

## CI y despliegue: `master` va a producción

`.github/workflows/ci.yml`:

- En cada PR y en cada push a `master`: `npm ci`, `npm run build` y `npm test`. El informe de Playwright queda como artefacto de la ejecución.
- Solo en un push a `master` y solo si los tests pasan (`needs: test`): el job `deploy` hace `rsync --delete` al VPS del mismo `dist/` que se ha probado.

Trabaja en una rama y fusiona en `master` por PR con la CI en verde y el cambio probado en el navegador. `vercel.json` y `public/_redirects` son restos de despliegues anteriores (Vercel y Netlify). Producción es el VPS.

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

Flujo de estados: `Game.changeState(nuevo)` ejecuta `_onStateExit` y `_onStateEnter`, y emite `state_changed`. `UIManager.handleStateChange` reacciona: abre el título, la selección de inicial o las pantallas finales, y cierra la UI al volver a `EXPLORING`. **`MENU` no abre nada:** cada menú llama a `changeState(MENU)` al abrirse, y quien quiere un menú llama a su función `open*` (Escape, X, C y el botón táctil emiten `ui_action` y `UIManager` abre el menú). Quien reacciona a `state_changed` no puede llamar a `changeState`: `Game` lo ignora y registra un `console.error`, que hace fallar los tests.

`changeState` todavía no es idempotente: pasar a un estado en el que ya se está vuelve a ejecutar la entrada y a emitir el evento (ver «Estado conocido»).

La estructura del README está desactualizada (menciona `src/utils` y un sistema de carga en `src/assets` que no existen así). Manda el código.

## Reglas

- **Partidas guardadas:** se guardan en `localStorage` con la clave `pokerogue_save` y `SAVE_VERSION` (`core/SaveManager.js`). Si la versión no coincide, **se borra la partida del jugador**. Para cambiar el formato, mejor añadir campos con valor por defecto al cargar. Sube `SAVE_VERSION` solo si no hay alternativa, y dilo.
- El balance y el contenido van en `src/data/*.json`, no metidos en el código.
- No añadas dependencias sin un motivo claro: el juego solo depende de `rot-js`.

## Estado conocido (2026-09-23)

- **Arreglado en la fase 1 del plan:** desde `75eebf4` (28 de julio), abrir la pausa, la mochila o el equipo desde exploración entraba en una recursión (`openPauseMenu` → `changeState(MENU)` → `state_changed` → `openPauseMenu`…). El `EventBus` se tragaba el `RangeError` y el menú salía tras más de mil repintados. Lo cubre `tests/e2e/menu-state.spec.js`.
- **Al reclutar, el diálogo «se ha unido a tu equipo» se borra al instante.** `RecruitMenu` hace `closeMenu()`, emite `recruit_pokemon` (que abre el diálogo) y luego `changeState(EXPLORING)`; como ya se está en `EXPLORING`, el evento vuelve a llamar a `closeMenu()`, que vacía los diálogos. Varios menús repiten `closeMenu()` + `changeState(EXPLORING)`. Se arregla haciendo `changeState` idempotente, pero antes hay que cambiar dos flujos que dependen de repetir estado: volver al título desde la selección de inicial con Escape (el estado sigue en `STARTER_SELECT`) y el fallo al cargar partida (pide `TITLE` estando en `TITLE`).
- **Los diálogos animados piden dos pulsaciones de Z aunque el texto ya haya terminado.** `DialogController.animateText` no pone `dialogTimer` a `null` al acabar, así que la primera Z se gasta en «saltar» una animación terminada.

## Plan de mejora

Hay un plan por fases en la nota del vault. Se mantienen el motor y la arquitectura; se añaden tipos, tests, CI con barrera antes de desplegar, RNG con semilla y migraciones de guardado. Mientras no esté aplicado, en el código nuevo o tocado:

- Aleatoriedad solo con el RNG de rot-js, nunca `Math.random` (hoy conviven los dos y las partidas no se pueden reproducir).
- Tipos en JSDoc en las funciones que toques.
- Todo cambio de comportamiento lleva un test E2E que lo cubra (hasta que llegue Vitest para la lógica pura).

## Contexto y registro

El contexto del proyecto y el registro de trabajo están en el vault de Obsidian, en la nota `Proyectos/PokéRogue`. Las instrucciones globales dicen cuándo y cómo escribir ahí.
