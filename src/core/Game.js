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

import { GAME_STATES, TILE_SIZE, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, MAP_WIDTH, MAP_HEIGHT, FOV_RADIUS } from '../constants.js';
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
import { saveGame } from './SaveManager.js';
import { FloorManager } from './game/FloorManager.js';
import { CombatHandler } from './game/CombatHandler.js';
import { setupGameEventListeners } from './game/setupGameEventListeners.js';
import { startNewGame as startNewGameSession, loadSavedGame as loadSavedGameSession } from './game/GameSession.js';
import { useInventoryItem as useInventoryItemHandler, throwInventoryItem } from './game/InventoryHandler.js';

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

    // Inventario del jugador
    this.inventory = [
      { itemId: 'potion', quantity: 3 },
      { itemId: 'pokeball', quantity: 5 },
      { itemId: 'reviver_seed', quantity: 3 },
      { itemId: 'max_elixir', quantity: 1 },
      { itemId: 'slumber_orb', quantity: 1 },
      { itemId: 'petrify_orb', quantity: 1 },
      { itemId: 'apple', quantity: 3 },
      { itemId: 'thunder_stone', quantity: 1 },
      { itemId: 'red_gummi', quantity: 1 }
    ];
    this.maxInventorySize = 20;

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
    saveGame(this);
  }

  /**
   * Carga la partida guardada
   */
  loadSavedGame() {
    loadSavedGameSession(this);
  }

  /**
   * Finalizar la partida (derrota).
   */
  gameOver() {
    console.log('[Game] Game Over');
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

    this.update();
    this.render();

    this._animFrameId = requestAnimationFrame(() => this._gameLoop());
  }

  /**
   * Lógica del juego en EXPLORING
   */
  update() {
    if (this._state !== GAME_STATES.EXPLORING) return;
    if (this.uiManager.hasOpenDialog()) return;

    // Verificar si hay algún Pokémon con movimientos pendientes por aprender
    const pendingPoke = this.entityManager.getEntitiesWithComponents('partyMember', 'pokemonInfo').find(pid => {
      const info = this.entityManager.getComponent(pid, 'pokemonInfo');
      return info && info.pendingMovesToLearn && info.pendingMovesToLearn.length > 0;
    });

    if (pendingPoke) {
      const info = this.entityManager.getComponent(pendingPoke, 'pokemonInfo');
      const pendingMove = info.pendingMovesToLearn.shift();
      this.ui.openLearnMoveMenu(pendingPoke, pendingMove);
      this.changeState(GAME_STATES.MENU);
      return;
    }

    const action = this.inputHandler.getAction();
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
    const results = this.turnManager.processTurn(
      action,
      (entityId, act) => this.combat.executeEntityAction(entityId, act),
      (entityId) => this.combat.getEnemyAIAction(entityId)
    );

    if (results.playerResult && results.playerResult.success) {
      this.stats.turnsPlayed++;

      const fighter = this.entityManager.getComponent(this._playerId, 'fighter');
      if (fighter && fighter.belly !== undefined) {
        // Consumir tripa (0.2 por turno = 1 tripa cada 5 turnos)
        fighter.belly = Math.max(0, fighter.belly - 0.2);

        if (fighter.belly === 0) {
          // Daño por inanición
          fighter.hp = Math.max(0, fighter.hp - 1);
          if (this.stats.turnsPlayed % 10 === 0) {
            this.eventBus.emit('message', '¡Estás desfalleciendo de hambre!');
          }
          if (fighter.hp <= 0) {
            this.changeState(GAME_STATES.GAME_OVER);
          }
        } else if (fighter.hp < fighter.maxHp) {
          // Regeneración natural solo si hay tripa
          if (this.stats.turnsPlayed % 4 === 0) {
            fighter.hp = Math.min(fighter.maxHp, fighter.hp + 1);
          }
        }
        this.entityManager.setComponent(this._playerId, 'fighter', fighter);
      }

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

          if (currentRoom && currentRoom.type === 'monster_house' && !currentRoom.triggered) {
            this._triggerMonsterHouse(currentRoom);
          } else if (currentRoom && currentRoom.type === 'rest' && !currentRoom.triggered) {
            currentRoom.triggered = true;
            this._triggerRestRoom(currentRoom);
          }
        }
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
    room.triggered = true;
    
    // Diálogo y evento para UI
    this.eventBus.emit('show_dialog', { text: '¡ES UN NIDO DE MONSTRUOS!' });
    this.eventBus.emit('message', '¡ES UN NIDO DE MONSTRUOS!');
    
    // Si tenemos renderizador, podemos añadir un efecto de destello rojo
    if (this.renderer && this.renderer.screenFlash) {
      this.renderer.screenFlash('rgba(255, 0, 0, 0.5)', 300);
    }
    
    // Spawnear 6 a 10 enemigos
    const numEnemies = 6 + Math.floor(Math.random() * 5);
    let spawned = 0;
    
    // Crear lista de posiciones válidas en la habitación
    const validPositions = [];
    for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
      for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
        // Asegurarse de que es caminable y está vacío
        if (this.tileMap.getTile(x, y).id === 1) { // 1 = FLOOR
          if (!this.entityManager.getEntityAt(x, y)) {
            validPositions.push({ x, y });
          }
        }
      }
    }
    
    // Barajar posiciones
    for (let i = validPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]];
    }
    
    // Instanciar enemigos
    for (let i = 0; i < Math.min(numEnemies, validPositions.length); i++) {
      const pos = validPositions[i];
      // Elegir un pokemon aleatorio que no sea legendario (id < 144)
      const validPokemon = this.pokemonData.filter(p => p.id < 144);
      const randMon = validPokemon[Math.floor(Math.random() * validPokemon.length)];
      
      const level = Math.max(1, Math.min(100, Math.floor(this._currentFloor * 1.5) + Math.floor(Math.random() * 3)));
      const enemyId = this.entityManager.createPokemon(randMon.id, level, pos.x, pos.y, true);
      
      // Despertarlos y alertarlos instantáneamente hacia el jugador
      const aiComponent = this.entityManager.getComponent(enemyId, 'aiControlled');
      if (aiComponent) {
        aiComponent.behavior = 'chase';
        aiComponent.alertedTo = this._playerId;
        this.entityManager.setComponent(enemyId, 'aiControlled', aiComponent);
      }
      
      const fighter = this.entityManager.getComponent(enemyId, 'fighter');
      this.turnManager.addEntity(enemyId, fighter ? fighter.speed : 50, false);

      spawned++;
    }
    
    console.log(`[Game] Nido de monstruos activado: ${spawned} enemigos generados.`);
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
        const oldHp = fighter.hp;
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + Math.floor(fighter.maxHp * 0.5));
        const healed = fighter.hp - oldHp;
        this.entityManager.setComponent(pid, 'fighter', fighter);
        console.log(`[Game] ${pokemonInfo.name} recuperó ${healed} PS en la habitación de descanso.`);
      }
    });

    this.eventBus.emit('show_dialog', {
      text: '¡Habitación de Descanso!\n\nTu equipo descansa unos momentos y recupera el 50% de sus PS.'
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
        const fovRad = FOV_RADIUS + (this.fovRadiusModifier || 0);
        this.fovSystem.update(pos.x, pos.y, this.tileMap, fovRad);
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
      return {
        id,
        speciesId: info.speciesId,
        name: info.name,
        level: info.level,
        xp: info.xp,
        currentLevelXp: Math.floor(Math.pow(info.level, 3)),
        nextLevelXp: Math.floor(Math.pow(info.level + 1, 3)),
        currentMoves: info.currentMoves,
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
        isLeader: member.isLeader
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
   * Intercambia el líder actual del equipo por el siguiente miembro del equipo.
   */
  swapLeader() {
    const partyEntities = this.entityManager.getEntitiesWithComponents('partyMember', 'fighter');
    if (partyEntities.length <= 1) {
      this.eventBus.emit('message', '¡No tienes otros Pokémon en el equipo para cambiar de líder!');
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

    // El siguiente en slot
    const newLeaderIdx = (oldLeaderIdx + 1) % partyEntities.length;
    const newLeaderId = partyEntities[newLeaderIdx];

    // Intercambiar isLeader en partyMember
    const oldMem = this.entityManager.getComponent(oldLeaderId, 'partyMember');
    const newMem = this.entityManager.getComponent(newLeaderId, 'partyMember');
    
    oldMem.isLeader = false;
    newMem.isLeader = true;
    this.entityManager.setComponent(oldLeaderId, 'partyMember', oldMem);
    this.entityManager.setComponent(newLeaderId, 'partyMember', newMem);

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

    // Cambiar roles de control (IA vs Jugador)
    // El viejo líder ahora es seguidor controlado por IA
    const oldAi = this.entityManager.getComponent(oldLeaderId, 'aiControlled') || {};
    oldAi.behavior = 'follower';
    this.entityManager.setComponent(oldLeaderId, 'aiControlled', oldAi);

    // El nuevo líder deja de estar controlado por IA
    this.entityManager.removeComponent(newLeaderId, 'aiControlled');

    // Actualizar IDs en Game y TurnManager
    this._playerId = newLeaderId;
    this.turnManager._playerId = newLeaderId;

    // Limpiar historial de posiciones para evitar saltos en los seguidores
    this.playerPathHistory = [];

    const newLeaderInfo = this.entityManager.getComponent(newLeaderId, 'pokemonInfo');
    this.eventBus.emit('message', `¡${newLeaderInfo.name} es ahora el líder del equipo!`);
    
    this.needsRender = true;
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
