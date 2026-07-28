/**
 * Game.js
 * Clase principal del juego PokéRogue.
 *
 * Actúa como:
 * - Máquina de estados (TITLE → STARTER_SELECT → EXPLORING → ...)
 * - Coordinador central de todos los subsistemas
 * - Bucle de juego (requestAnimationFrame)
 *
 * Sistemas que posee:
 * - EventBus:        Comunicación desacoplada entre sistemas
 * - UIManager:       Gestor de interfaz HTML superpuesta
 * - InputHandler:    Entrada del teclado
 * - EntityManager:   Gestión de entidades y componentes
 * - TurnManager:     Turnos basados en energía
 * - MovementSystem:  Movimiento y colisiones
 * - FOVSystem:       Campo de visión shadowcasting
 * - DungeonGenerator: Generación procedural de mazmorras
 * - Renderer:        Renderizado en canvas
 * - TileMap:         Datos del mapa actual
 */

import { MAX_INVENTORY, GAME_STATES, TILE_SIZE, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, MAP_WIDTH, MAP_HEIGHT, FOV_RADIUS } from '../constants.js';
import { EventBus } from './EventBus.js';
import { TurnManager } from './TurnManager.js';
import { WeatherSystem } from '../systems/WeatherSystem.js';
import { InputHandler } from '../input/InputHandler.js';
import { EntityManager } from '../entities/EntityManager.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { DungeonGenerator } from '../map/DungeonGenerator.js';
import { FOVSystem } from '../systems/FOVSystem.js';
import { Camera } from '../render/Camera.js';
import { Renderer } from '../render/Renderer.js';
import { UIManager } from '../ui/UIManager.js';
import { saveGame, deleteSave } from './SaveManager.js';
import { revertTransform } from '../systems/CombatSystem.js';
import { saveLifetimeStats } from '../ui/menus/StatsMenu.js';
import { FloorManager } from '../map/FloorManager.js';
import { CombatHandler } from '../systems/ActionSystem.js';
import { setupGameEventListeners } from './GameEvents.js';
import { startNewGame as startNewGameSession, loadSavedGame as loadSavedGameSession } from './GameSession.js';
import { useInventoryItem as useInventoryItemHandler, throwInventoryItem } from '../systems/InventorySystem.js';
import { MessageLog } from '../ui/MessageLog.js';

// Importar JSONs estáticos directamente para empaquetarlos con Vite
import pokemonData from '../data/pokemon.json';
import movesData from '../data/moves.json';
import typesData from '../data/types.json';
import evolutionsData from '../data/evolutions.json';
import itemsData from '../data/items.json';
import floorsData from '../data/floors.json';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas - Elemento canvas del DOM donde se dibuja el juego
   */
  constructor(canvas) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    /** @type {CanvasRenderingContext2D} */
    this.ctx = canvas.getContext('2d');

    // ── Estado del juego ──
    /** @type {string} Estado actual de la máquina de estados */
    this._state = GAME_STATES.TITLE;

    /** @type {string|null} Estado anterior (para transiciones) */
    this._previousState = null;

    /** @type {boolean} Bandera para controlar si se necesita redibujar */
    this.needsRender = true;

    /** @type {number} Piso actual de la mazmorra */
    this._currentFloor = 1;

    /** @type {number|null} ID de la entidad del jugador (líder del equipo) */
    this._playerId = null;

    /** @type {number} ID del frame de animación (para cancelar) */
    this._animFrameId = 0;

    /** @type {boolean} Si el juego está en ejecución */
    this._running = false;

    // Semilla para el piso actual
    this.seed = 0;

    // Estadísticas acumuladas
    this.stats = {
      pokemonDefeated: 0,
      pokemonCaptured: 0,
      floorsExplored: 0,
      itemsUsed: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      turnsPlayed: 0
    };

    // Pokédex de vistos
    this.pokedexSeen = new Set();

    // Inventario base (nueva partida lo sustituye en GameSession)
    this.inventory = [
      { itemId: 'potion', quantity: 3 },
      { itemId: 'pokeball', quantity: 5 },
      { itemId: 'apple', quantity: 4 },
      { itemId: 'ether', quantity: 1 },
      { itemId: 'oran_berry', quantity: 3 },
      { itemId: 'antidote', quantity: 1 },
      { itemId: 'paralyze_heal', quantity: 1 },
      { itemId: 'awakening', quantity: 1 },
      { itemId: 'reviver_seed', quantity: 2 },
      { itemId: 'escape_rope', quantity: 1 },
      { itemId: 'slumber_orb', quantity: 1 }
    ];
    this.maxInventorySize = MAX_INVENTORY;
    this.coins = 180;
    this.autoPickup = true;
    this._autoHealUsedThisFloor = false;
    this._autoStatusCureUsedThisFloor = false;
    try {
      const prefs = JSON.parse(localStorage.getItem('pokerogue_prefs') || 'null');
      if (prefs && typeof prefs.autoPickup === 'boolean') {
        this.autoPickup = prefs.autoPickup;
      }
      this._prefShowMinimap = prefs && typeof prefs.showMinimap === 'boolean' ? prefs.showMinimap : true;
    } catch (e) {
      this._prefShowMinimap = true;
    }

    // Historial de posiciones del jugador para seguidores
    this.playerPathHistory = [];

    // Bases de datos y sistemas compartidos──
    /** @type {EventBus} Bus de eventos global */
    this.eventBus = new EventBus();

    /** @type {InputHandler} Manejador de entrada */
    this.inputHandler = new InputHandler(this.eventBus);

    /** @type {EntityManager} Gestor de entidades */
    this.entityManager = new EntityManager(this.eventBus);

    /** @type {TurnManager} Sistema de turnos */
    this.turnManager = new TurnManager(this.eventBus);
    this.turnManager.setCanActCheck((entityId) => {
      const f = this.entityManager.getComponent(entityId, 'fighter');
      return !!(f && f.hp > 0);
    });

    /** @type {MovementSystem} Sistema de movimiento */
    this.movementSystem = new MovementSystem();

    /** @type {DungeonGenerator} Generador procedural de mazmorras */
    this.dungeonGenerator = new DungeonGenerator();

    /** @type {WeatherSystem} Sistema de clima */
    this.weatherSystem = new WeatherSystem();
    this.currentWeather = 'normal';

    /** @type {FOVSystem} Sistema de niebla de guerra */
    this.fovSystem = new FOVSystem();

    /** @type {Camera} Cámara del viewport */
    this.camera = new Camera(VIEWPORT_WIDTH, VIEWPORT_HEIGHT, TILE_SIZE);

    /** @type {Renderer} Orquestador de renderizado en canvas */
    this.renderer = new Renderer(canvas, this.eventBus, () => {
      this.needsRender = true;
    });
    if (this.renderer.hud) {
      this.renderer.hud.showMinimap = this._prefShowMinimap !== false;
    }

    /** @type {UIManager} Gestor de overlays HTML */
    this.uiManager = new UIManager(this);

    /** @type {FloorManager} Generación de pisos y spawn */
    this.floorManager = new FloorManager(this);

    /** @type {CombatHandler} Combate y acciones de entidades */
    this.combat = new CombatHandler(this);

    /**
     * Referencia al mapa de tiles actual.
     * @type {Object|null}
     */
    this.tileMap = null;

    /**
     * Cola de mensajes del log del juego.
     * @type {string[]}
     */
    this._messageLog = [];
    this.messageLog = new MessageLog(80);
    this._bellyWarned20 = false;
    this._bellyWarned10 = false;
    this._deathReason = null;
    this._lastStarterId = null;
    this._stairsAnnounced = false;

    // Selección de ataque rápido
    this._selectedMoveIndex = 0;

    // ── Suscripción a eventos ──
    this._setupEventListeners();
  }

  // ─── Inicialización ───────────────────────────────────────────────────────

  /**
   * Inicializar todos los sistemas y preparar el juego.
   * @returns {Promise<void>}
   */
  async init() {
    console.log('[Game] Inicializando PokéRogue...');

    this.pokemonData = pokemonData;
    this.movesData = movesData;
    this.typesData = typesData;
    this.evolutionsData = evolutionsData;
    this.itemsData = itemsData;
    this.floorsData = floorsData;

    const speciesDict = {};
    pokemonData.forEach(p => {
      speciesDict[p.id] = {
        name: p.name,
        types: p.types,
        ability: p.ability || 'none',
        baseStats: p.stats,
        learnset: p.moves,
        sprite: p.sprite,
        spriteUrl: p.sprite
      };
    });

    const movesDict = {};
    movesData.forEach(m => {
      movesDict[m.id] = m;
    });

    this.entityManager.loadData(speciesDict, movesDict);
    this.typeChart = typesData;
    
    console.log('[Game] Datos del juego enlazados localmente.');

    // Configurar el canvas
    this._setupCanvas();

    // Lanzar el estado inicial (pantalla de título)
    this.changeState(GAME_STATES.TITLE);

    console.log('[Game] Inicialización completada.');
  }

  /**
   * Configurar las dimensiones del canvas.
   * @private
   */
  _setupCanvas() {
    this.canvas.width = VIEWPORT_WIDTH * TILE_SIZE;  // 21 tiles * 24px = 504px
    this.canvas.height = VIEWPORT_HEIGHT * TILE_SIZE; // 15 tiles * 24px = 360px
    this.renderer.resize(this.canvas.width, this.canvas.height);
  }

  /**
   * Configurar los listeners de eventos internos.
   * @private
   */
  _setupEventListeners() {
    setupGameEventListeners(this);
  }

  // ─── Máquina de estados ───────────────────────────────────────────────────

  /**
   * Obtener el estado actual del juego.
   * @returns {string}
   */
  getState() {
    return this._state;
  }

  /**
   * Cambiar el estado del juego con validación de transiciones.
   * @param {string} newState - Nuevo estado
   */
  changeState(newState) {
    if (!Object.values(GAME_STATES).includes(newState)) {
      console.error(`[Game] Estado no válido: '${newState}'`);
      return;
    }

    const oldState = this._state;
    this._previousState = oldState;
    this._state = newState;

    this._onStateExit(oldState);
    this._onStateEnter(newState);

    this.needsRender = true;

    // Notificar al UIManager
    this.eventBus.emit('state_changed', { state: newState });
  }

  _onStateExit(state) {
    switch (state) {
      case GAME_STATES.MENU:
        this.inputHandler.setContext('exploration');
        break;
      case GAME_STATES.DIALOG:
        this.inputHandler.setContext('exploration');
        break;
    }
  }

  _onStateEnter(state) {
    switch (state) {
      case GAME_STATES.TITLE:
        this.inputHandler.setContext('menu');
        this.inputHandler.enabled = true;
        this.tileMap = null;
        this.entityManager.clear();
        this._playerId = null;
        this.turnManager.reset();
        break;
      case GAME_STATES.STARTER_SELECT:
        this.inputHandler.setContext('menu');
        this.inputHandler.enabled = true;
        break;
      case GAME_STATES.EXPLORING:
        this.inputHandler.setContext('exploration');
        this.inputHandler.enabled = true;
        break;
      case GAME_STATES.MENU:
        this.inputHandler.setContext('menu');
        this.inputHandler.enabled = true;
        break;
      case GAME_STATES.DIALOG:
        this.inputHandler.setContext('dialog');
        this.inputHandler.enabled = true;
        break;
      case GAME_STATES.GAME_OVER:
        this.inputHandler.setContext('menu');
        this.inputHandler.enabled = true;
        break;
      case GAME_STATES.VICTORY:
        this.inputHandler.setContext('menu');
        this.inputHandler.enabled = true;
        if (!this._lifetimeStatsSaved) {
          this._lifetimeStatsSaved = true;
          try { saveLifetimeStats(this, true); } catch (e) {}
        }
        try { deleteSave(); } catch (e) {}
        break;
    }
  }

  // ─── Gestión de partida ───────────────────────────────────────────────────

  /**
   * Iniciar una nueva partida con el Pokémon inicial seleccionado.
   * @param {string} starterPokemonId - ID de la especie inicial (ej. 'charmander')
   */
  startNewGame(starterPokemonId) {
    startNewGameSession(this, starterPokemonId);
  }

  /**
   * Guarda la partida en localStorage
   */
  saveGameData() {
    return saveGame(this);
  }

  /**
   * Carga la partida guardada
   */
  loadSavedGame() {
    return loadSavedGameSession(this);
  }

  /**
   * Finalizar la partida (derrota).
   */
  gameOver(reason = 'combate') {
    console.log('[Game] Game Over');
    this._deathReason = reason;
    try { deleteSave(); } catch (e) {}
    if (!this._lifetimeStatsSaved) {
      this._lifetimeStatsSaved = true;
      try { saveLifetimeStats(this, false); } catch (e) {}
    }
    this.changeState(GAME_STATES.GAME_OVER);
  }

  // ─── Generación de pisos ──────────────────────────────────────────────────

  /**
   * Cambiar de piso en la mazmorra.
   * @param {'up'|'down'} direction - Dirección
   */
  changeFloor(direction) {
    this.floorManager.changeFloor(direction);
  }

  _generateFloor() {
    this.floorManager.generateFloor();
  }

  _getZoneConfig() {
    return this.floorManager.getZoneConfig();
  }

  _spawnEnemies() {
    this.floorManager.spawnEnemies();
  }

  _preloadVisibleSprites() {
    this.floorManager.preloadVisibleSprites();
  }

  // ─── Bucle de juego ───────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    console.log('[Game] Bucle de juego iniciado.');
    this._gameLoop();
  }

  stop() {
    this._running = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = 0;
    }
    console.log('[Game] Bucle de juego detenido.');
  }

  _gameLoop() {
    if (!this._running) return;

    try {
      this.update();
      this.render();
    } catch (err) {
      console.error('[Game] Error en el bucle (recuperado):', err);
      try {
        if (this.inputHandler && this._state === GAME_STATES.EXPLORING) {
          this.inputHandler.setContext('exploration');
          this.inputHandler.enabled = true;
        }
        this.eventBus?.emit?.('message', {
          text: 'Se recuperó de un error. Prueba otra acción.',
          color: '#ffaa66'
        });
      } catch (_) {}
    }

    this._animFrameId = requestAnimationFrame(() => this._gameLoop());
  }

  /**
   * Lógica del juego en EXPLORING
   */
  update() {
    if (this._state !== GAME_STATES.EXPLORING) return;
    // Si el input quedó en "dialog" sin diálogo visible, recuperar exploración
    if (this.inputHandler && this.inputHandler._context === 'dialog' && !this.uiManager.hasOpenDialog()) {
      this.inputHandler.setContext('exploration');
    }
    if (this.uiManager.hasOpenDialog()) return;

    // Verificar si hay algún Pokémon con movimientos pendientes por aprender
    const pendingPoke = this.entityManager.getEntitiesWithComponents('partyMember', 'pokemonInfo').find(pid => {
      const info = this.entityManager.getComponent(pid, 'pokemonInfo');
      return info && info.pendingMovesToLearn && info.pendingMovesToLearn.length > 0;
    });

    if (pendingPoke) {
      const info = this.entityManager.getComponent(pendingPoke, 'pokemonInfo');
      const pendingMove = info.pendingMovesToLearn[0];
      if (pendingMove && this.uiManager && typeof this.uiManager.openLearnMoveMenu === 'function') {
        // No hacer shift aquí: LearnMoveMenu lo quita al confirmar/cancelar
        this.uiManager.openLearnMoveMenu(pendingPoke, pendingMove);
      }
      return;
    }

    // Aviso suave si el líder está crítico (una vez por piso)
    if (!this._critHpWarnedThisFloor) {
      const lf = this.entityManager.getComponent(this._playerId, 'fighter');
      if (lf && lf.hp > 0 && lf.hp / Math.max(1, lf.maxHp) <= 0.2) {
        this._critHpWarnedThisFloor = true;
        this.eventBus.emit('message', {
          text: '¡PS críticos! Usa pociones o Esc → Guardar.',
          color: '#ff6666'
        });
      }
    }

    // Evoluciones pendientes (confirmación del jugador)
    const evoPoke = this.entityManager.getEntitiesWithComponents('partyMember', 'pokemonInfo').find(pid => {
      const info = this.entityManager.getComponent(pid, 'pokemonInfo');
      return info && info.pendingEvolution;
    });
    if (evoPoke && this.uiManager && typeof this.uiManager.openEvolutionMenu === 'function') {
      const info = this.entityManager.getComponent(evoPoke, 'pokemonInfo');
      const evo = info.pendingEvolution;
      // Mantener pendingEvolution hasta Sí/No (así un guardado a mitad conserva la oferta)
      this.uiManager.openEvolutionMenu(evoPoke, evo);
      return;
    }

    let action = this.inputHandler.getAction();
    
    if (!action && this.inputHandler.enabled) {
      action = this.inputHandler.getHeldMovementAction();
    }

    if (!action) return;

    if (action.type === 'swap_leader') {
      this.swapLeader();
      return;
    }

    this._processPlayerAction(action);
  }

  /**
   * Procesa el turno completo
   * @param {Object} action - Acción del jugador
   * @private
   */
  _processPlayerAction(action) {
    this._syncAbilitySpeeds();
    const results = this.turnManager.processTurn(
      action,
      (entityId, act) => this.combat.executeEntityAction(entityId, act),
      (entityId) => this.combat.getEnemyAIAction(entityId)
    );

    if (results.playerResult && results.playerResult.success) {
      this.stats.turnsPlayed++;
      // Alinear con TurnManager (incluye fallos previos de bump)
      if (typeof this.turnManager.getTurnCount === 'function') {
        this.stats.turnsPlayed = Math.max(this.stats.turnsPlayed, this.turnManager.getTurnCount());
      }

      const fighter = this.entityManager.getComponent(this._playerId, 'fighter');
      if (fighter && fighter.belly !== undefined) {
        // Consumir tripa (0.2 por turno = 1 tripa cada 5 turnos)
        const fl = this._currentFloor || 1;
        const bellyDrain = fl <= 3 ? 0.08 : (fl <= 12 ? 0.10 : (fl <= 30 ? 0.12 : 0.13));
        fighter.belly = Math.max(0, fighter.belly - bellyDrain);

        if (fighter.belly <= 20 && fighter.belly > 10 && !this._bellyWarned20) {
          this._bellyWarned20 = true;
          this.eventBus.emit('message', { text: '¡Tu tripa está baja! Come algo pronto.', color: '#ffaa00' });
          this._tryAutoEat(fighter);
        }
        if (fighter.belly <= 10 && fighter.belly > 0 && !this._bellyWarned10) {
          this._bellyWarned10 = true;
          this.eventBus.emit('message', { text: '¡Vas a desfallecer de hambre!', color: '#ff4444' });
          this._tryAutoEat(fighter);
        }
        if (fighter.belly > 20) {
          this._bellyWarned20 = false;
          this._bellyWarned10 = false;
        }

        // Auto-cura con bayas si el líder está muy herido
        if (fighter.hp > 0 && fighter.hp / fighter.maxHp <= 0.25) {
          this._tryAutoHeal(fighter);
        }

        // Auto-cura de estados (1 vez por piso)
        if (fighter.hp > 0 && fighter.statusEffects && fighter.statusEffects.length > 0) {
          this._tryAutoStatusCure(fighter);
        }

        // Aviso de PP bajos (una vez por piso)
        if (!this._lowPpWarnedThisFloor) {
          const info = this.entityManager.getComponent(this._playerId, 'pokemonInfo');
          const moves = info?.currentMoves || [];
          const usable = moves.filter(m => m && m.enabled !== false && m.maxPP > 0);
          if (usable.length && usable.every(m => m.currentPP <= 1)) {
            this._lowPpWarnedThisFloor = true;
            this.eventBus.emit('message', {
              text: '¡PP muy bajos! Usa un Éter o busca una Baldosa Mágica.',
              color: '#88aaff'
            });
          }
        }

        // Aliados heridos: auto-cura ocasional (1 vez por piso, compartida)
        if (!this._autoHealUsedThisFloor) {
          const allies = this.entityManager.getEntitiesWithComponents('partyMember', 'fighter');
          for (const aid of allies) {
            if (aid === this._playerId) continue;
            const af = this.entityManager.getComponent(aid, 'fighter');
            if (af && af.hp > 0 && af.hp / af.maxHp <= 0.2) {
              this._tryAutoHeal(af, aid);
              break;
            }
          }
        }

        // Aliados: tripa más lenta + auto-comer
        {
          const allies = this.entityManager.getEntitiesWithComponents('partyMember', 'fighter');
          for (const aid of allies) {
            if (aid === this._playerId) continue;
            const af = this.entityManager.getComponent(aid, 'fighter');
            if (!af || af.hp <= 0 || af.belly === undefined) continue;
            af.belly = Math.max(0, af.belly - 0.06);
            if (af.belly <= 12) {
              this._tryAutoEat(af, aid);
            }
            if (af.belly <= 0 && this.stats.turnsPlayed % 4 === 0 && af.hp > 1) {
              af.hp = Math.max(1, af.hp - 1); // no KO por hambre de aliado
            }
            this.entityManager.setComponent(aid, 'fighter', af);
          }
        }

        const starvingLeaderId = this._playerId;
        if (fighter.belly === 0) {
          // Daño por inanición (cada 2 turnos)
          if (this.stats.turnsPlayed % 2 === 0) {
            fighter.hp = Math.max(0, fighter.hp - 1);
          }
          if (this.stats.turnsPlayed % 10 === 0) {
            this.eventBus.emit('message', { text: '¡Estás desfalleciendo de hambre!', color: '#ff4444' });
          }
          if (fighter.hp <= 0) {
            // Misma lógica de Semilla Revivir que en combate
            const invIndex = this.inventory.findIndex(item => item.itemId === 'reviver_seed' && item.quantity > 0);
            if (invIndex !== -1) {
              this.inventory[invIndex].quantity--;
              if (this.inventory[invIndex].quantity <= 0) {
                this.inventory.splice(invIndex, 1);
              }
              fighter.hp = fighter.maxHp;
              fighter.belly = fighter.maxBelly || 100;
              fighter.statusEffects = [];
              this._bellyWarned20 = false;
              this._bellyWarned10 = false;
              const info = this.entityManager.getComponent(starvingLeaderId, 'pokemonInfo');
              this.eventBus.emit('message', `¡${info ? info.name : 'Tu Pokémon'} revivió gracias a la Semilla Revivir!`);
              this.entityManager.setComponent(starvingLeaderId, 'fighter', fighter);
            } else {
              this.entityManager.setComponent(starvingLeaderId, 'fighter', fighter);
              // Puede cambiar de líder: no reescribir fighter del nuevo líder
              this.eventBus.emit('pokemon_fainted', {
                entityId: starvingLeaderId,
                attackerId: null,
                reason: 'hambre'
              });
            }
          } else {
            this.entityManager.setComponent(starvingLeaderId, 'fighter', fighter);
          }
        } else {
        // Regeneración lenta de PP (cada 20 turnos) si hay tripa — todo el equipo
        if (fighter.belly > 30 && this.stats.turnsPlayed % 20 === 0) {
          let any = false;
          for (const pid of this.entityManager.getEntitiesWithComponents('partyMember', 'pokemonInfo')) {
            const pf = this.entityManager.getComponent(pid, 'fighter');
            if (!pf || pf.hp <= 0 || (pf.belly != null && pf.belly <= 10)) continue;
            const pinfo = this.entityManager.getComponent(pid, 'pokemonInfo');
            if (!pinfo?.currentMoves) continue;
            let restored = false;
            for (const m of pinfo.currentMoves) {
              if (m && m.currentPP < m.maxPP) {
                m.currentPP++;
                restored = true;
              }
            }
            if (restored) {
              this.entityManager.setComponent(pid, 'pokemonInfo', pinfo);
              any = true;
            }
          }
          if (any) {
            this.eventBus.emit('message', { text: 'El equipo recupera un poco de PP...', color: '#aaddff' });
          }
        }
        if (fighter.hp < fighter.maxHp) {
          // Regeneración natural solo si hay tripa
          if (this.stats.turnsPlayed % 4 === 0) {
            fighter.hp = Math.min(fighter.maxHp, fighter.hp + 1);
          }
          this.entityManager.setComponent(starvingLeaderId, 'fighter', fighter);
        } else {
          this.entityManager.setComponent(starvingLeaderId, 'fighter', fighter);
        }
        } // fin belly > 0
      } // fin fighter.belly

      // Clima ahora se maneja en CombatHandler por eventos

      // Actualizar historial de posiciones para los seguidores
      const pos = this.entityManager.getComponent(this._playerId, 'position');
      if (pos && (pos.x !== pos.prevX || pos.y !== pos.prevY)) {
        this.playerPathHistory.unshift({ x: pos.prevX, y: pos.prevY });
        if (this.playerPathHistory.length > 10) {
          this.playerPathHistory.pop();
        }

        // Comprobar si entramos en una habitación especial
        if (this.tileMap && this.tileMap.rooms) {
          const currentRoom = this.tileMap.rooms.find(r => 
            pos.x >= r.x && pos.x < r.x + r.w &&
            pos.y >= r.y && pos.y < r.y + r.h
          );

          // Monster house se gestiona en ActionSystem (flag monsterHouseTriggered)
          if (currentRoom && currentRoom.type === 'rest' && !currentRoom.triggered) {
            currentRoom.triggered = true;
            this._triggerRestRoom(currentRoom);
          }
          if (currentRoom && currentRoom.type === 'treasure' && !currentRoom.triggered) {
            currentRoom.triggered = true;
            this.eventBus.emit('message', {
              text: '¡Esta sala brilla con tesoros escondidos!',
              color: '#ffd700'
            });
          }
        }
      }

      const invLen = (this.inventory || []).length;
      const invMax = this.maxInventorySize || 24;
      if (invLen < invMax - 2) this._bagAlmostFullWarned = false;
      if (!this._bagAlmostFullWarned && invLen >= invMax - 2) {
        this._bagAlmostFullWarned = true;
        this.eventBus.emit('message', {
          text: 'Bolsa casi llena: vende en Kecleon o tira objetos (X).',
          color: '#ffaa66'
        });
      }

      if (this.stats.turnsPlayed % 5 === 0) {
        this.saveGameData();
      }
    }

    this._updateCamera();
    this._updateFOV();
    this.needsRender = true;
  }

  /**
   * Invoca enemigos aleatorios en una sala de nido de monstruos
   * @param {Object} room - Habitación del nido
   */
  _triggerMonsterHouse(room) {
    // Delegar al path canónico (pool de zona + balance)
    if (this.floorManager && typeof this.floorManager.spawnMonsterHouse === 'function') {
      this.floorManager.spawnMonsterHouse(room);
      return;
    }
    this.eventBus.emit('message', '¡ES UN NIDO DE MONSTRUOS!');
    this.needsRender = true;
  }

  /**
   * Cura al equipo y muestra diálogo al entrar en una habitación de descanso
   * @param {Object} room - Habitación de descanso
   */
  _triggerRestRoom(room) {
    const partyEntities = this.entityManager.getEntitiesWithComponents('partyMember', 'fighter');
    
    partyEntities.forEach(pid => {
      const fighter = this.entityManager.getComponent(pid, 'fighter');
      const pokemonInfo = this.entityManager.getComponent(pid, 'pokemonInfo');
      if (fighter && pokemonInfo) {
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + Math.floor(fighter.maxHp * 0.55));
        if (fighter.belly !== undefined) {
          fighter.belly = Math.min(fighter.maxBelly || 100, fighter.belly + 35);
        }
        fighter.statusEffects = [];
        if (pokemonInfo.currentMoves) {
          pokemonInfo.currentMoves.forEach(m => {
            m.currentPP = m.maxPP;
            m.enabled = true;
            delete m._disableTurns;
          });
          this.entityManager.setComponent(pid, 'pokemonInfo', pokemonInfo);
        }
        fighter.charging = null;
        fighter.biding = null;
        fighter.mustRecharge = false;
        fighter.rage = false;
        fighter.focusEnergy = false;
        fighter.protectStats = 0;
        const _spr = this.entityManager.getComponent(pid, 'sprite');
        if (revertTransform(fighter, pokemonInfo, _spr)) {
          if (_spr) this.entityManager.setComponent(pid, 'sprite', _spr);
          this.entityManager.setComponent(pid, 'pokemonInfo', pokemonInfo);
        }
        this.entityManager.setComponent(pid, 'fighter', fighter);
      }
    });

    try {
      if (this.uiManager?.sfx?.playHealSound) this.uiManager.sfx.playHealSound();
    } catch (e) {}
    this.eventBus.emit('show_dialog', {
      text: '¡Habitación de Descanso!\n\nTu equipo recupera PS, PP, tripa y se cura de estados.'
    });

    this.needsRender = true;
  }

  _executeEntityAction(entityId, action) {
    return this.combat.executeEntityAction(entityId, action);
  }

  _getEnemyAIAction(entityId) {
    return this.combat.getEnemyAIAction(entityId);
  }

  useInventoryItem(itemId, targetPokemonId) {
    useInventoryItemHandler(this, itemId, targetPokemonId);
  }

  throwInventoryItem(itemId) {
    throwInventoryItem(this, itemId);
  }

  // ─── Renderizado ──────────────────────────────────────────────────────────

  render() {
    if (this.renderer) {
      this.renderer.update(performance.now());
    }

    // Actualizar cámara (lerp) siempre que estemos corriendo
    if (this.camera && this._state === GAME_STATES.EXPLORING) {
      this.camera.update(performance.now());
    }

    const animating = (this.renderer && this.renderer.hasActiveAnimations()) || 
                      (this.camera && Math.abs(this.camera.currentX - this.camera.x) > 0.01) || 
                      (this.camera && Math.abs(this.camera.currentY - this.camera.y) > 0.01);
                      
    if (!this.needsRender && !animating) return;
    this.needsRender = false;

    if (this.renderer) {
      this.renderer.render(this);
    }
  }

  // ─── Cámara y FOV ─────────────────────────────────────────────────────────

  _updateCamera() {
    if (this._playerId) {
      const pos = this.entityManager.getComponent(this._playerId, 'position');
      if (pos) {
        this.camera.follow(pos.x, pos.y, MAP_WIDTH, MAP_HEIGHT);
      }
    }
  }

  _updateFOV() {
    if (this.fovSystem && this._playerId && this.tileMap) {
      const pos = this.entityManager.getComponent(this._playerId, 'position');
      if (pos) {
        let fovRad = FOV_RADIUS + (this.fovRadiusModifier || 0);
        const zone = this._getZoneConfig();
        if (zone && zone.theme === 'dark' && fovRad > 6) {
          fovRad -= 1;
        }
        this.fovSystem.update(pos.x, pos.y, this.tileMap, fovRad);

        // Anunciar escaleras la primera vez que entran en el FOV del piso
        if (!this._stairsAnnounced && this._stairsPos && this.tileMap.getVisibility) {
          const vis = this.tileMap.getVisibility(this._stairsPos.x, this._stairsPos.y);
          if (vis > 0) {
            this._stairsAnnounced = true;
            this.eventBus.emit('message', {
              text: '¡Escaleras encontradas! Camina encima o pulsa Z para bajar.',
              color: '#ffd700'
            });
            if (this.renderer && this.renderer.hud && this._prefShowMinimap !== false) {
              this.renderer.hud.showMinimap = true;
            }
          }
        }
      }
    }
  }

  // ─── Getters de Estado para UIs ───────────────────────────────────────────

  /**
   * Devuelve los Pokémon del equipo formateados
   */
  get party() {
    const partyEntities = this.entityManager.getEntitiesWithComponents('partyMember', 'pokemonInfo', 'fighter');
    partyEntities.sort((a, b) => {
      const aMem = this.entityManager.getComponent(a, 'partyMember');
      const bMem = this.entityManager.getComponent(b, 'partyMember');
      return aMem.slot - bMem.slot;
    });

    return partyEntities.map(id => {
      const info = this.entityManager.getComponent(id, 'pokemonInfo');
      const fighter = this.entityManager.getComponent(id, 'fighter');
      const member = this.entityManager.getComponent(id, 'partyMember');
      const pos = this.entityManager.getComponent(id, 'position');
      const sprite = this.entityManager.getComponent(id, 'sprite');
        return {
        id,
        facing: pos?.facing || 'down',
        facingDx: pos?.facingDx ?? 0,
        facingDy: pos?.facingDy ?? 0,
        charging: !!(fighter.charging),
        biding: !!(fighter.biding),
        chargingState: fighter.charging || null,
        bidingState: fighter.biding || null,
        mustRecharge: !!fighter.mustRecharge,
        reflect: fighter.reflect || 0,
        lightScreen: fighter.lightScreen || 0,
        substitute: fighter.substitute || 0,
        rage: !!fighter.rage,
        focusEnergy: !!fighter.focusEnergy,
        _preTransform: fighter._preTransform || null,
        spriteUrl: sprite?.url || null,
        lastPhysicalDamageTaken: fighter.lastPhysicalDamageTaken || 0,
        _intimidatedBy: fighter._intimidatedBy || [],
        protectStats: fighter.protectStats || 0,
        _rageTurns: fighter._rageTurns,
        _focusTurns: fighter._focusTurns,
        _traced: !!(info._traced),
        speciesId: info.speciesId,
        name: info.name,
        level: info.level,
        xp: info.xp,
        ability: info.ability || null,
        currentLevelXp: Math.floor(Math.pow(info.level, 3)),
        nextLevelXp: Math.floor(Math.pow(info.level + 1, 3)),
        currentMoves: info.currentMoves,
        pendingMovesToLearn: info.pendingMovesToLearn || [],
        pendingEvolution: info.pendingEvolution || null,
        evolutionDeclinedAtLevel: info.evolutionDeclinedAtLevel ?? null,
        types: info.types,
        hp: fighter.hp,
        maxHp: fighter.maxHp,
        belly: fighter.belly,
        maxBelly: fighter.maxBelly,
        attack: fighter.attack,
        defense: fighter.defense,
        spAtk: fighter.spAtk,
        spDef: fighter.spDef,
        speed: fighter.speed,
        statusEffects: fighter.statusEffects,
        statModifiers: fighter.statModifiers || {},
        bonusStats: fighter.bonusStats || null,
        _statusTick: fighter._statusTick || 0,
        isLeader: member.isLeader,
        tactic: member.tactic || 'follow'
      };
    });
  }

  get playerPos() {
    if (!this._playerId) return null;
    const pos = this.entityManager.getComponent(this._playerId, 'position');
    return pos ? { x: pos.x, y: pos.y } : null;
  }

  get stairsPos() {
    return this._stairsPos || null;
  }

  get zoneName() {
    const zone = this._getZoneConfig();
    return zone ? zone.name : 'Mazmorra';
  }

  getCurrentFloor() {
    return this._currentFloor;
  }

  // Getter floor adicional para Renderer.js
  get floor() {
    return this._currentFloor;
  }

  // Getter messages adicional para Renderer.js
  get messages() {
    return this._messageLog;
  }

  // Getter player adicional para Renderer.js
  get player() {
    if (!this._playerId) return null;
    const info = this.entityManager.getComponent(this._playerId, 'pokemonInfo');
    const fighter = this.entityManager.getComponent(this._playerId, 'fighter');
    return info && fighter ? {
      name: info.name,
      hp: fighter.hp,
      maxHp: fighter.maxHp
    } : null;
  }

  getPlayerId() {
    return this._playerId;
  }

  getMessageLog() {
    return this._messageLog;
  }

  /**
   * Usa automáticamente una baya/poción si el líder tiene PS críticos.
   * @param {Object} fighter
   */
  _tryAutoHeal(fighter, entityId = null) {
    if (this._autoHealUsedThisFloor) return;
    const healOrder = ['oran_berry', 'sitrus_berry', 'potion', 'super_potion'];
    let slotIdx = -1;
    let itemData = null;
    for (const id of healOrder) {
      slotIdx = this.inventory.findIndex(s => s.itemId === id && s.quantity > 0);
      if (slotIdx !== -1) {
        itemData = this.itemsData.find(i => i.id === id);
        break;
      }
    }
    if (slotIdx === -1 || !itemData) return;

    const slot = this.inventory[slotIdx];
    let healed = 0;
    if (itemData.type === 'heal_percent') {
      healed = Math.floor(fighter.maxHp * ((itemData.value || 25) / 100));
    } else {
      healed = itemData.value || 10;
    }
    const before = fighter.hp;
    fighter.hp = Math.min(fighter.maxHp, fighter.hp + healed);
    const targetId = entityId != null ? entityId : this._playerId;
    if (targetId != null) {
      this.entityManager.setComponent(targetId, 'fighter', fighter);
    }
    slot.quantity--;
    if (slot.quantity <= 0) this.inventory.splice(slotIdx, 1);
    this._autoHealUsedThisFloor = true;
    const info = targetId != null ? this.entityManager.getComponent(targetId, 'pokemonInfo') : null;
    const who = info ? info.name : 'Tu Pokémon';
    this.eventBus.emit('message', {
      text: `¡${who} usó ${itemData.name} automáticamente! (+${fighter.hp - before} PS)`,
      color: '#66ff99'
    });
  }

  /**
   * Come automáticamente manzana si la tripa está baja.
   * @param {Object} fighter
   */
  _tryAutoStatusCure(fighter) {
    if (this._autoStatusCureUsedThisFloor) return;
    const statuses = fighter.statusEffects || [];
    if (!statuses.length) return;

    const cureMap = {
      poison: ['antidote', 'full_heal'],
      burn: ['burn_heal', 'full_heal'],
      paralyze: ['paralyze_heal', 'full_heal'],
      sleep: ['awakening', 'full_heal'],
      freeze: ['full_heal'],
      confuse: ['full_heal']
    };

    for (const st of statuses) {
      const candidates = cureMap[st.type] || ['full_heal'];
      for (const itemId of candidates) {
        const slotIdx = this.inventory.findIndex(s => s.itemId === itemId && s.quantity > 0);
        if (slotIdx === -1) continue;
        const itemData = this.itemsData.find(i => i.id === itemId);
        if (!itemData) continue;

        if (itemData.cures === 'all') {
          fighter.statusEffects = [];
        } else {
          fighter.statusEffects = statuses.filter(s => s.type !== (itemData.cures || st.type));
        }
        this.entityManager.setComponent(this._playerId, 'fighter', fighter);
        const slot = this.inventory[slotIdx];
        slot.quantity--;
        if (slot.quantity <= 0) this.inventory.splice(slotIdx, 1);
        this._autoStatusCureUsedThisFloor = true;
        this.eventBus.emit('message', {
          text: `¡Usaste ${itemData.name} automáticamente para curar estados!`,
          color: '#aaddff'
        });
        return;
      }
    }
  }

  _tryAutoEat(fighter, entityId = null) {
    // Solo comida real (type food). No gastar bayas de curación como Aranja.
    const foodOrder = ['apple', 'big_apple', 'golden_apple'];
    let slotIdx = -1;
    for (const id of foodOrder) {
      slotIdx = this.inventory.findIndex(s => s.itemId === id && s.quantity > 0);
      if (slotIdx !== -1) break;
    }
    if (slotIdx === -1) {
      slotIdx = this.inventory.findIndex(s => {
        const d = this.itemsData.find(i => i.id === s.itemId);
        return d && d.type === 'food' && s.quantity > 0;
      });
    }
    if (slotIdx === -1) return;

    const slot = this.inventory[slotIdx];
    const itemData = this.itemsData.find(i => i.id === slot.itemId);
    if (!itemData || itemData.type !== 'food') return;

    const value = itemData.value || 20;
    if (itemData.maxBellyBonus) {
      fighter.maxBelly = (fighter.maxBelly || 100) + itemData.maxBellyBonus;
    }
    const before = fighter.belly;
    fighter.belly = Math.min(fighter.maxBelly || 100, fighter.belly + value);
    slot.quantity--;
    if (slot.quantity <= 0) this.inventory.splice(slotIdx, 1);

    const eid = entityId != null ? entityId : this._playerId;
    const pname = this.entityManager.getComponent(eid, 'pokemonInfo')?.name;
    const who = (eid === this._playerId || !pname) ? 'Comiste' : `${pname} comió`;
    this.eventBus.emit('message', {
      text: `¡${who} ${itemData.name} automáticamente! (+${Math.floor(fighter.belly - before)} tripa)`,
      color: '#88cc66'
    });
    if (eid === this._playerId) {
      this._bellyWarned20 = fighter.belly <= 20;
      this._bellyWarned10 = fighter.belly <= 10;
    }
  }

  /**
   * Intercambia el líder actual del equipo por el siguiente miembro del equipo.
   */
  swapLeader() {
    const partyEntities = this.entityManager.getEntitiesWithComponents('partyMember', 'fighter');
    if (partyEntities.length <= 1) {
      this.eventBus.emit('message', {
        text: '¡Necesitas más Pokémon en el equipo para cambiar de líder!',
        color: '#ffcc88'
      });
      return;
    }

    // Ordenar por slot
    partyEntities.sort((a, b) => {
      const memA = this.entityManager.getComponent(a, 'partyMember');
      const memB = this.entityManager.getComponent(b, 'partyMember');
      return memA.slot - memB.slot;
    });

    const oldLeaderId = this._playerId;
    const oldLeaderIdx = partyEntities.indexOf(oldLeaderId);
    
    if (oldLeaderIdx === -1) return;

    // Siguiente aliado vivo (saltar debilitados)
    let newLeaderId = null;
    for (let step = 1; step <= partyEntities.length; step++) {
      const cand = partyEntities[(oldLeaderIdx + step) % partyEntities.length];
      const f = this.entityManager.getComponent(cand, 'fighter');
      if (f && f.hp > 0) {
        newLeaderId = cand;
        break;
      }
    }
    if (newLeaderId == null || newLeaderId === oldLeaderId) {
      this.eventBus.emit('message', '¡No hay otro Pokémon en condiciones de liderar!');
      return;
    }

    // Intercambiar isLeader y reasignar slots: líder = 0, seguidores = 1..n
    const oldMem = this.entityManager.getComponent(oldLeaderId, 'partyMember');
    const newMem = this.entityManager.getComponent(newLeaderId, 'partyMember');
    
    oldMem.isLeader = false;
    newMem.isLeader = true;
    this.entityManager.setComponent(oldLeaderId, 'partyMember', oldMem);
    this.entityManager.setComponent(newLeaderId, 'partyMember', newMem);

    // Reordenar: nuevo líder en slot 0, resto en orden relativo
    const reordered = [newLeaderId, ...partyEntities.filter(id => id !== newLeaderId)];
    reordered.forEach((id, idx) => {
      const mem = this.entityManager.getComponent(id, 'partyMember');
      if (mem) {
        mem.slot = idx;
        mem.isLeader = idx === 0;
        this.entityManager.setComponent(id, 'partyMember', mem);
      }
    });

    // Intercambiar posiciones físicas en el mapa
    const oldPos = this.entityManager.getComponent(oldLeaderId, 'position');
    const newPos = this.entityManager.getComponent(newLeaderId, 'position');
    if (oldPos && newPos) {
      const tempX = oldPos.x;
      const tempY = oldPos.y;
      const tempFacing = oldPos.facing;

      oldPos.x = newPos.x;
      oldPos.y = newPos.y;
      oldPos.facing = newPos.facing;

      newPos.x = tempX;
      newPos.y = tempY;
      newPos.facing = tempFacing;

      this.entityManager.setComponent(oldLeaderId, 'position', oldPos);
      this.entityManager.setComponent(newLeaderId, 'position', newPos);
    }

    // Roles: solo el viejo líder vivo actúa como seguidor
    const oldFighter = this.entityManager.getComponent(oldLeaderId, 'fighter');
    if (oldFighter && oldFighter.hp > 0) {
      const oldAi = this.entityManager.getComponent(oldLeaderId, 'aiControlled') || {};
      oldAi.behavior = 'follower';
      this.entityManager.setComponent(oldLeaderId, 'aiControlled', oldAi);
    } else if (this.entityManager.hasComponent(oldLeaderId, 'aiControlled')) {
      this.entityManager.removeComponent(oldLeaderId, 'aiControlled');
    }

    // El nuevo líder deja de estar controlado por IA
    this.entityManager.removeComponent(newLeaderId, 'aiControlled');

    // Actualizar IDs en Game y TurnManager
    this._playerId = newLeaderId;
    this.turnManager.setPlayerEntityId(newLeaderId);

    // Limpiar historial de posiciones para evitar saltos en los seguidores
    this.playerPathHistory = [];

    const newLeaderInfo = this.entityManager.getComponent(newLeaderId, 'pokemonInfo');
    this.eventBus.emit('message', `¡${newLeaderInfo.name} es ahora el líder del equipo!`);
    
    this.needsRender = true;
  }

  /**
   * Ajusta velocidad efectiva por clima + habilidades (Clorofila, Velo Arena).
   * @private
   */
  _syncAbilitySpeeds() {
    const weather = this.currentWeather || 'normal';
    const entities = this.entityManager.getEntitiesWithComponents('fighter', 'pokemonInfo');
    for (const id of entities) {
      const fighter = this.entityManager.getComponent(id, 'fighter');
      const info = this.entityManager.getComponent(id, 'pokemonInfo');
      if (!fighter || !info) continue;
      const ability = info.ability ? String(info.ability).toLowerCase().replace(/-/g, '_') : '';
      let speed = fighter.speed || 50;
      // Etapas de Velocidad (X Attack/Speed, trampas, orbes…)
      const stage = Math.max(-6, Math.min(6, fighter.statModifiers?.speed || 0));
      if (stage >= 0) speed = Math.floor(speed * (2 + stage) / 2);
      else speed = Math.floor(speed * 2 / (2 - stage));
      if (ability === 'chlorophyll' && weather === 'sol') speed = Math.floor(speed * 2);
      if (ability === 'swift_swim' && weather === 'lluvia') speed = Math.floor(speed * 2);
      this.turnManager.updateSpeed(id, Math.max(1, speed));
    }
  }

  destroy() {
    this.stop();
    this.inputHandler.destroy();
    this.eventBus.clear();
    this.entityManager.clear();
    this.turnManager.reset();
    console.log('[Game] Juego destruido.');
  }
}
