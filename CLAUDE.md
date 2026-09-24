# PokéRogue

Pokémon Mundo Misterioso con los 151 de primera generación: un equipo de exploración con base en un pueblo sale a mazmorras procedurales por turnos, cumple misiones y sube de rango. En producción: https://roguelike.javistudio.dev

JavaScript sin framework (módulos ES), Canvas 2D, arquitectura ECS y Vite 8. La única dependencia de runtime es `rot-js`. No es React ni una PWA, aunque alguna nota antigua lo diga.

## Comandos

- `npm run dev`: servidor de desarrollo en http://localhost:5173. Para comprobar cambios, ábrelo en el navegador integrado.
- `npm run build`: build de producción en `dist/`.
- `npm test`: tests unitarios y después E2E. Por separado: `npm run test:unit` y `npm run test:e2e`.
- `npm run test:unit`: Vitest sobre la lógica pura (`tests/unit/*.test.js`), sin navegador y en menos de un segundo. Incluye una regla de arquitectura: `Math.random` solo puede aparecer en `src/render/` y `src/audio/`.
- `npm run test:e2e`: Playwright (`tests/e2e/*.spec.js`). Playwright hace `vite build` y sirve el resultado con `vite preview` en el puerto 4317 (`E2E_PORT` lo cambia), así que prueba el build de producción. Usa `--strictPort`: si el puerto está ocupado falla con un error claro. Al acabar mata el servidor. La primera vez en una máquina nueva: `npx playwright install chromium`.
  - Un fichero o un test: `npm run test:e2e -- tests/e2e/save-load.spec.js`, `npm run test:e2e -- -g "mochila"`. Con navegador visible: `npm run test:e2e -- --headed`.
  - Las partidas de los tests usan una semilla fija (`?seed=` en la URL), así que son deterministas. `E2E_SEED=123 npm run test:e2e` prueba con otra.
  - `soak.spec.js` pone a jugar a un bot 300 turnos (combate, IA, experiencia, pisos) y comprueba que dos partidas con la misma semilla acaban idénticas: si algo del juego vuelve a depender del azar sin semilla o del tiempo real, falla.
  - `npm run test:report` abre el informe HTML de la última ejecución, con trazas de los fallos.
  - Cualquier `console.error` o excepción de la página hace fallar el test (`tests/e2e/fixtures.js`). Las peticiones a otros dominios (Google Fonts, sprites de PokeAPI) se responden en local.
  - Los tests no dependen del mapa de una semilla concreta: eligen casillas libres leyendo el mapa desde `window.game`, no dan pasos a ciegas.
- `build:ghpages` y `build:itch` solo cambian la `base` (ver `vite.config.js`). Producción no los usa.
- `npm run sprites:pmd`: vuelve a descargar de PMDCollab/SpriteCollab los sprites animados y los retratos (151 especies más Kecleon) y regenera `src/data/pmd-sprites.json` y `pmd-credits.json`. Los ficheros están en el repo (unos 13 MB), así que solo hace falta para actualizarlos o añadir especies (`EXTRA_SPECIES` en el script).
- `npm run story`: regenera `src/data/story.json` desde el guion (`docs/guion-historia.md`). Para cambiar un diálogo se edita el guion y se regenera; un test unitario falla si los dos no coinciden.

## CI y despliegue: `master` va a producción

`.github/workflows/ci.yml`:

- En cada PR y en cada push a `master`: `npm ci`, tests unitarios, `npm run build` y tests E2E. El informe de Playwright queda como artefacto de la ejecución.
- Solo en un push a `master` y solo si los tests pasan (`needs: test`): el job `deploy` hace `rsync --delete` al VPS del mismo `dist/` que se ha probado.

Trabaja en una rama y fusiona en `master` por PR con la CI en verde y el cambio probado en el navegador. `vercel.json` y `public/_redirects` son restos de despliegues anteriores (Vercel y Netlify). Producción es el VPS.

## Cómo se juega (estructura)

- **Título → nueva aventura** (`STARTER_SELECT`, `ui/menus/QuizMenu.js`): test de personalidad (`core/Personality.js`, `data/personality.json`), protagonista, compañero que no comparte tipo y nombre del equipo. Crea el perfil y entra en el pueblo.
- **Pueblo** (`TOWN`, `core/TownSession.js`, mapa en `data/town.json`): sin turnos ni enemigos; el equipo sigue al líder en fila. Kecleon (tienda, `core/Shop.js`), Kangaskhan (almacén), Persian (banco), base (formación, dormir = día siguiente, guardar), tablón de misiones y la salida del sur hacia las mazmorras. Menús en `ui/menus/TownMenus.js` y `MissionMenus.js`.
- **Expedición** (`EXPLORING`, `core/Expedition.js`): del pueblo a una mazmorra y vuelta con uno de estos finales: `cleared` (abre la siguiente mazmorra y da rango), `defeated` (se pierden el dinero y la mochila; el banco y el almacén no), `escaped` (Cuerda Huida) `mission` (volver tras cumplir una misión) o `blown` (el viento expulsa al equipo: como caer). Al volver se cobran las misiones cumplidas, los reclutados pasan a la base, el equipo se cura y pasa un día. `Game.endExpedition()` lo aplaza al siguiente fotograma para no vaciar entidades en mitad de un turno.
- **Mazmorras** (`core/Dungeons.js`, `data/dungeons.json`): cada una es un tramo de los 50 pisos globales de `floors.json`. `game._currentFloor` es el piso global (decide zona, enemigos, jefe y dificultad) y `game.getCurrentFloor()` el que ve el jugador. La Torre del Desafío recorre los 50 con reglas roguelike: copias de nivel 5, kit fijo y lo de fuera guardado en `profile.stash`.
- **Misiones** (`core/Missions.js`, `systems/MissionSystem.js`): tablón diario determinista (rescate, buscar objeto, entrega). El cliente o el objeto aparece en su piso; al cumplir se pregunta si volver.
- **En la mazmorra:** cada movimiento tiene alcance (`range` en `moves.json`: delante, en línea, alrededor, sala, uno mismo o equipo; `systems/MoveTargeting.js`). Ctrl + dirección gira sin gastar turno y Mayús + dirección corre hasta que pasa algo. Cada piso da `wind.limit` turnos (`dungeons.json`): el viento avisa y al final expulsa al equipo. No hay Poké Balls: si el líder derrota a un salvaje, a veces se levanta y pide unirse (`core/Recruitment.js`, `data/recruitment.json`, `systems/RecruitSystem.js`); con el equipo completo se va a la base, salvo en la Torre. Cada Pokémon puede llevar un objeto equipable (`type: "held"` en `items.json`, efectos en su campo `held`, lógica en `core/HeldItems.js`); va en su ficha y en la Torre no se lleva. Las gominolas suben el CI (`pokemonInfo.iq`, más con las de su tipo favorito) y el CI desbloquea habilidades (Ojo Trampas, Autocura, Gran Lanzador, Esquivador), con los números en `data/iq.json` y la lógica en `core/IQ.js`.
- **Perfil** (`core/Profile.js`): plantilla de Pokémon (fichas de `core/PokemonSnapshot.js` con `uid`), formación (protagonista y compañero siempre), banco, almacén, rango, día, mazmorras completadas, misiones y escenas de la historia vistas. La mochila y la cartera en juego son `game.inventory` y `game.coins`.
- **Historia** («El Eco del Norte», H4): el guion está en `docs/guion-historia.md` y el juego lo lee de `data/story.json` (se genera con `npm run story`). Prólogo, un capítulo por mazmorra (del Bosque Verde, con Pidgeotto de jefe, al Laboratorio Final), final con créditos y frases de los vecinos por capítulo.
  - `core/Story.js` (lógica pura) decide qué escena toca. Cada escena tiene disparadores: `adventure_start`, `dungeon_enter`, `floor_enter`, `boss_floor`, `boss_defeated`, `town_return`, `board_open`, `dungeon_select`, `new_day` y `credits_end`. Sale una sola vez: las vistas se apuntan en `profile.story.seen`.
  - El capítulo no se guarda: es 1 más las mazmorras de la historia completadas (8 tras el final).
  - `core/StorySession.js` las muestra con `showDialog` y retrato. Lo llaman `TownSession` (prólogo, vecinos, tablón), `Expedition` (entrada y vuelta), `FloorManager` (pisos), `GameEvents` (jefe derrotado) y `TownMenus` (elegir mazmorra, dormir).
  - Variantes por especie en las líneas (`{"species": id}`), la misión de historia del sobre (`story: true`: no se abandona y su cliente no aparece en el piso), Slowpoke fuera del pueblo en el capítulo 5 y los créditos finales (`openEndingCredits`, que también citan a PMDCollab).

## Arquitectura (`src/`)

- `main.js` crea `Game` sobre `#game-canvas`. `window.game` queda expuesto para depurar desde la consola (los E2E lo usan). `game.debug` tiene ganchos para los tests, como `forceRecruit`.
- `core/`: `Game` (máquina de estados `GAME_STATES` y bucle), `EventBus`, `GameEvents`, `GameSession` (cargar partida), `TurnManager`, `SaveManager`, `Random`, más los módulos de la estructura MM de arriba.
- `entities/`: `EntityManager`, `Components` (ECS; un componente nuevo hay que declararlo ahí o se descarta) y `EnemyAI`.
- `systems/`: sistemas ECS (combate, alcance de movimientos, movimiento, FOV, habilidades, reclutamiento, evolución, experiencia, inventario, objetos, trampas, clima, acciones, estadísticas, eventos de piso y misiones).
- `map/`: generación de mazmorras (`DungeonGenerator`), `FloorManager`, `TileMap`, `TileTypes` (las casillas del pueblo son los ids 20+), `Biomes` y `Town`.
- `render/`: `Renderer`, `MapRenderer`, `EntityRenderer`, `Camera`, `SpriteManager` y `ParticleSystem`, más:
  - `PmdSprites.js`: hojas animadas de PMDCollab (8 direcciones; Idle, Walk, Attack, Shoot, Hurt y Sleep) y retratos. `EntityRenderer` elige la animación según lo que pasa (andar, `move_used`, `damage_dealt`, dormido) y, si una hoja aún no ha cargado, dibuja el sprite estático local.
  - `TilesetPainter.js`: casillas procedurales con el tema de cada mazmorra (`data/tilesets.json`; cada mazmorra dice el suyo en `dungeons.json`). `MapRenderer` pinta el piso una vez en un lienzo aparte y solo lo rehace si cambia una casilla (`TileMap.setTile` sube `tileMap.version`): no modifiques `tileMap.tiles` a mano.
- `ui/`: `UIManager` más `ui/menus/*` (menús en HTML sobre el canvas), `HUD`, `MessageLog` y `DialogController`. `showDialog(texto, callback, instantáneo, { speaker, portrait: { speciesId, emotion } })` pone el nombre y el retrato de quien habla. `CreditsMenu` (desde el título y al final de la historia) cita a PMDCollab y a sus artistas: la licencia lo exige. La opción `backdrop: 'black'` de `showDialog` pone el fondo negro (la voz del prólogo).
- `audio/`: `MusicManager` y `SfxManager` (sonido sintetizado).
- `data/`: JSON de Pokémon, movimientos, objetos, tipos, evoluciones, pisos, mazmorras, pueblo y test de personalidad.
- `public/sprites/`: `pmd/` (PMDCollab, con su `LICENSE.md` y `CREDITS.txt`) y `pokemon/` (sprites estáticos locales, de reserva mientras cargan las hojas; `download_sprites.cjs` los bajó de PokeAPI). El juego ya no pide nada a PokeAPI en tiempo de ejecución.

Flujo de estados: `Game.changeState(nuevo)` ejecuta `_onStateExit` y `_onStateEnter`, y emite `state_changed`. `UIManager.handleStateChange` reacciona: abre el título o la nueva aventura, y cierra la UI al volver a `EXPLORING` o `TOWN`. `closeMenu()` vuelve a `game.homeState` (el pueblo o la mazmorra, según el mapa). **`MENU` no abre nada:** cada menú llama a `changeState(MENU)` al abrirse, y quien quiere un menú llama a su función `open*` (Escape, X, C y el botón táctil emiten `ui_action` y `UIManager` abre el menú). Quien reacciona a `state_changed` no puede llamar a `changeState`: `Game` lo ignora y registra un `console.error`, que hace fallar los tests.

`changeState` es idempotente: pedir el estado en el que ya se está no hace nada. Para volver a mostrar una pantalla del mismo estado, llama a su función `open*`. `showMenu(type, html, { onCancel })` da el teclado al menú; `onCancel` dice qué hace Escape (si no, lo decide `handleCancelAction` según `type`).

Aleatoriedad (`core/Random.js`): todo lo que afecta a la partida usa `random()`, `randomInt()`, `chance()`, `pick()` o `shuffle()`, que salen del RNG de rot-js con semilla. Cada partida tiene `runSeed` (`?seed=N` en la URL la fija) y la semilla de cada piso se deriva de ella con `floorSeed()`. Solo render y audio pueden usar `Math.random`.

La estructura del README está desactualizada (menciona `src/utils` y un sistema de carga en `src/assets` que no existen así). Manda el código.

## Reglas

- **Partidas guardadas:** se guardan en `localStorage` con la clave `pokerogue_save` y `SAVE_VERSION` (`core/SaveManager.js`). Formato v5: `profile`, `bag`, `wallet` y `run` (la expedición en curso o `null`). La v4 quitó las Poké Balls (se cambiaron por dinero) y la v5 añadió `profile.story`; las partidas de antes de la historia siguen desde su capítulo, con las escenas anteriores como vistas. **Nunca se borra la partida de un jugador por cambiar el formato:** añade a `MIGRATIONS` la función pura que pasa de la versión actual a la siguiente, sube `SAVE_VERSION` y añade su caso a `tests/unit/save.test.js`. Al cargar una partida antigua se guarda la original en `pokerogue_save_backup_v<n>`. Una partida ilegible se aparta a `pokerogue_save_backup_corrupt_<fecha>` y una de una versión más nueva no se toca.
- El balance y el contenido van en `src/data/*.json`, no metidos en el código.
- No añadas dependencias sin un motivo claro: el juego solo depende de `rot-js`.

## Estado conocido (2026-09-24)

- **Arreglado en la fase 1 del plan:** desde `75eebf4` (28 de julio), abrir la pausa, la mochila o el equipo desde exploración entraba en una recursión (`openPauseMenu` → `changeState(MENU)` → `state_changed` → `openPauseMenu`…). El `EventBus` se tragaba el `RangeError` y el menú salía tras más de mil repintados. Lo cubre `tests/e2e/menu-state.spec.js`.
- **Arreglados en el hito H0:** el diálogo «se ha unido a tu equipo» que se borraba al reclutar (con `changeState` idempotente) y los diálogos animados que pedían dos Z con el texto ya terminado. Los cubre `tests/e2e/dialogs.spec.js`.
- **H4 · Historia** implementada en la rama `claude/charming-dirac-edcydf`, pendiente de revisión y de fusionar. Decisiones tomadas con los valores recomendados del guion (sección 9): Pidgeotto como jefe del Bosque Verde, Clefable en el Monte Lunar, final sin elección y «Guion y desarrollo: JaviStudio» en los créditos (`STORY_AUTHOR` en `CreditsMenu.js`).
- **Licencia de los sprites:** para la 1.ª generación, todo el arte de base de PMDCollab es el oficial de Chunsoft (los 151 figuran con crédito `CHUNSOFT`); lo de la comunidad (animaciones y emociones añadidas) es CC BY-NC 4.0. El juego debe seguir siendo gratuito y sin anuncios, y la pantalla de créditos no se puede quitar.
- El bundle principal pasa de 500 kB (unos 620 kB; 160 kB con gzip) por los datos del juego, el manifiesto de sprites y el guion. Dividir el código es tarea pendiente.
- En el pueblo, el equipo son copias de las fichas de la plantilla. Lo que cambie ahí y deba durar hay que apuntarlo también en `profile.roster` (como hace `syncRosterHeldItem` al equipar); cambiar la táctica o el líder en el pueblo aún no se guarda.
- La batería E2E completa tarda alrededor de un minuto en local (4 workers): mientras trabajas, ejecuta solo los ficheros afectados.

## Plan de mejora

Hay dos planes en la nota del vault: el técnico por fases y el de convertir el juego en un Mundo Misterioso completo (hitos H0 a H5: estructura con pueblo, misiones y varias mazmorras; mecánicas de mazmorra; sprites de PMDCollab; historia original). Se mantienen el motor y la arquitectura. Mientras no esté aplicado, en el código nuevo o tocado:

- Tipos en JSDoc en las funciones que toques.
- Todo cambio de comportamiento lleva un test: unitario si es lógica pura, E2E si pasa por la interfaz.

## Contexto y registro

El contexto del proyecto y el registro de trabajo están en el vault de Obsidian, en la nota `Proyectos/PokéRogue`. Las instrucciones globales dicen cuándo y cómo escribir ahí.
