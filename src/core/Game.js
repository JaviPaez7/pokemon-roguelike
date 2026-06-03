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

import { GAME_STATES, ACTIONS, TILE_SIZE, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, MAP_WIDTH, MAP_HEIGHT, MAX_INVENTORY, FOV_RADIUS } from '../constants.js';
import { EventBus } from './EventBus.js';
import { TurnManager } from './TurnManager.js';
import { InputHandler } from '../input/InputHandler.js';
import { EntityManager } from '../entities/EntityManager.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { DungeonGenerator } from '../map/DungeonGenerator.js';
import { FOVSystem } from '../systems/FOVSystem.js';
import { Camera } from '../render/Camera.js';
import { Renderer } from '../render/Renderer.js';
import { UIManager } from '../ui/UIManager.js';

// Importar lógica de subsistemas
import { executeMove, processStatusEffects, selectBestMove } from '../combat/CombatSystem.js';
import { spawnItems, pickupItem, useItem } from '../systems/ItemSystem.js';
import { attemptCapture } from '../combat/CaptureSystem.js';
import { grantExperience } from '../systems/ExperienceSystem.js';
import { checkEvolution, evolve } from '../systems/EvolutionSystem.js';
import { saveGame, loadGame, deleteSave, hasSave } from './SaveManager.js';

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
      { itemId: 'potion', quantity: 2 },
      { itemId: 'pokeball', quantity: 5 }
    ];

    // ── Subsistemas ──
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
    // Escuchar mensajes para el log
    this.eventBus.on('message', (data) => {
      const text = data.text || String(data);
      this._messageLog.push(text);
      if (this._messageLog.length > 50) {
        this._messageLog.shift();
      }
      this.needsRender = true;
    });

    // Escuchar cuando un Pokémon es derrotado
    this.eventBus.on('pokemon_fainted', (data) => {
      if (data.entityId === this._playerId) {
        this.gameOver();
      } else {
        // Aumentar contador de derrotados si era enemigo
        if (this.entityManager.hasComponent(data.entityId, 'aiControlled')) {
          this.stats.pokemonDefeated++;
        }
        // Eliminar del sistema de turnos y del mapa
        this.turnManager.removeEntity(data.entityId);
        this.entityManager.destroyEntity(data.entityId);
        this.needsRender = true;
      }
    });

    // Escuchar cambio de piso
    this.eventBus.on('floor_change', (data) => {
      this.changeFloor(data.direction || 'down');
    });

    // Escuchar recogida de items
    this.eventBus.on('item_picked_up', (data) => {
      const result = pickupItem(
        data.entityId,
        data.itemEntity,
        this.entityManager,
        this.inventory,
        MAX_INVENTORY
      );
      this.eventBus.emit('message', result.message);
      this.needsRender = true;
    });

    // Escuchar acciones de UI
    this.eventBus.on('ui_action', (data) => {
      switch (data.action) {
        case 'pause_menu':
          if (this._state === GAME_STATES.EXPLORING) {
            this.changeState(GAME_STATES.MENU);
          } else if (this._state === GAME_STATES.MENU) {
            this.changeState(GAME_STATES.EXPLORING);
          }
          break;
        case 'select_move':
          if (this._playerId) {
            const info = this.entityManager.getComponent(this._playerId, 'pokemonInfo');
            if (info && info.currentMoves && info.currentMoves[data.index]) {
              this._selectedMoveIndex = data.index;
              const move = this.movesData.find(m => m.id === info.currentMoves[data.index].moveId);
              if (move) {
                this.eventBus.emit('message', `Ataque listo: ${move.name} (${info.currentMoves[data.index].currentPP}/${info.currentMoves[data.index].maxPP} PP)`);
              }
            }
          }
          break;
      }
    });
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
    console.log(`[Game] Iniciando nueva partida con: ${starterPokemonId}`);

    // Limpiar estado anterior
    this.entityManager.clear();
    this.turnManager.reset();
    this._messageLog = [];
    this._currentFloor = 1;
    this.inventory = [
      { itemId: 'potion', quantity: 3 },
      { itemId: 'pokeball', quantity: 5 }
    ];
    this.stats = {
      pokemonDefeated: 0,
      pokemonCaptured: 0,
      floorsExplored: 1,
      itemsUsed: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      turnsPlayed: 0
    };
    this.pokedexSeen = new Set([starterPokemonId]);

    // Generar el primer piso
    this._generateFloor();

    // Encontrar posición de inicio
    const startPos = genStartPos(this.tileMap);

    // Crear el Pokémon del jugador
    this._playerId = this.entityManager.createPokemon(
      starterPokemonId,
      5, // Nivel inicial
      startPos.x,
      startPos.y,
      false // No es enemigo
    );

    // Marcar como miembro del equipo y líder
    this.entityManager.setComponent(this._playerId, 'partyMember', {
      slot: 0,
      isLeader: true
    });

    // Registrar en el sistema de turnos
    const fighterData = this.entityManager.getComponent(this._playerId, 'fighter');
    this.turnManager.addEntity(
      this._playerId,
      fighterData ? fighterData.speed : 50,
      true // Es el jugador
    );

    // Generar enemigos para el piso
    this._spawnEnemies();

    // Actualizar cámara y FOV
    this._updateCamera();
    this._updateFOV();

    // Pre-cargar sprites visibles en el piso
    this._preloadVisibleSprites();

    // Diálogo de bienvenida — usar estado DIALOG para que el input funcione
    this.changeState(GAME_STATES.DIALOG);
    this.eventBus.emit('show_dialog', {
      text: `¡Bienvenido a la mazmorra de PokéRogue!\n\nEstás en el Piso 1: ${this.zoneName}. ¡Encuentra las escaleras descendentes para avanzar!`,
      instant: true,
      callback: () => {
        this.changeState(GAME_STATES.EXPLORING);
      }
    });

    this.needsRender = true;
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
    const data = loadGame();
    if (!data) return;

    this.seed = data.seed;
    this._currentFloor = data.currentFloor;
    this.inventory = data.inventory;
    this.stats = data.stats;
    this.pokedexSeen = data.pokedexSeen;

    this.entityManager.clear();
    this.turnManager.reset();

    // Recrear party a partir del save
    this._playerId = null;
    data.party.forEach((p, idx) => {
      const id = this.entityManager.createEntity();
      
      this.entityManager.setComponent(id, 'position', {
        x: 0, // Se reposiciona al cargar
        y: 0,
        facing: 'down'
      });

      this.entityManager.setComponent(id, 'pokemonInfo', {
        speciesId: p.speciesId,
        name: p.name,
        level: p.level,
        xp: p.xp,
        currentMoves: p.currentMoves,
        types: p.types
      });

      this.entityManager.setComponent(id, 'fighter', {
        hp: p.hp,
        maxHp: p.maxHp,
        attack: p.attack,
        defense: p.defense,
        spAtk: p.spAtk,
        spDef: p.spDef,
        speed: p.speed,
        statusEffects: p.statusEffects || []
      });

      // Sprite URL
      const pokeRef = this.pokemonData.find(poke => poke.id === p.speciesId || poke.name.toLowerCase() === p.speciesId);
      this.entityManager.setComponent(id, 'sprite', {
        url: pokeRef ? pokeRef.sprite : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.speciesId}.png`,
        image: null,
        loaded: false
      });

      this.entityManager.setComponent(id, 'partyMember', {
        slot: idx,
        isLeader: p.isLeader
      });

      if (p.isLeader) {
        this._playerId = id;
      }

      this.turnManager.addEntity(id, p.speed, true);
    });

    // Cargar mapa
    this._currentFloor--; // Para que al hacer changeFloor suba al piso correcto
    this.changeFloor('down');
    this._preloadVisibleSprites();
    this.changeState(GAME_STATES.EXPLORING);
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
    if (direction === 'down') {
      this._currentFloor++;
      this.stats.floorsExplored = Math.max(this.stats.floorsExplored, this._currentFloor);
    } else if (direction === 'up' && this._currentFloor > 1) {
      this._currentFloor--;
    }

    console.log(`[Game] Cambiando al piso ${this._currentFloor}`);

    // Limpiar entidades (mantener equipo)
    this.entityManager.clear(true);

    // Resetear turnos y re-registrar la party
    this.turnManager.reset();
    const partyEntities = this.entityManager.getEntitiesWithComponents('partyMember', 'fighter');
    
    partyEntities.forEach(pid => {
      const fighter = this.entityManager.getComponent(pid, 'fighter');
      const mem = this.entityManager.getComponent(pid, 'partyMember');
      this.turnManager.addEntity(pid, fighter ? fighter.speed : 50, mem.isLeader);
      if (mem.isLeader) {
        this._playerId = pid;
      }
    });

    // Generar nuevo piso
    this._generateFloor();

    // Reposicionar equipo
    const startPos = genStartPos(this.tileMap);
    partyEntities.forEach(pid => {
      this.entityManager.setComponent(pid, 'position', {
        x: startPos.x,
        y: startPos.y,
        facing: 'down'
      });
    });

    // Generar nuevos enemigos
    this._spawnEnemies();
    this._preloadVisibleSprites();

    // Actualizar cámara y FOV
    this._updateCamera();
    this._updateFOV();

    // Auto-save al cambiar de piso
    this.saveGameData();

    // Mensaje de cambio de piso
    this.eventBus.emit('message', {
      text: `Entrando a ${this.zoneName} (Piso ${this._currentFloor})`
    });

    // Si es el piso 50 y se ha spawneado el jefe Mewtwo, mostrar diálogo de advertencia
    const zone = this._getZoneConfig();
    if (zone && zone.boss && this._currentFloor === zone.floors[1] && zone.boss.name === 'Mewtwo') {
      this.eventBus.emit('show_dialog', {
        text: '¡Una presencia abrumadora te acecha en este laboratorio!\n\n¡Mewtwo bloquea el camino de salida!'
      });
    }

    this.needsRender = true;
  }

  /**
   * Genera el piso actual
   * @private
   */
  _generateFloor() {
    this.seed = Math.floor(Math.random() * 1000000);
    const genResult = this.dungeonGenerator.generate(MAP_WIDTH, MAP_HEIGHT, this.seed);
    this.tileMap = genResult.tileMap;
    this._stairsPos = genResult.stairsPos;
    this._spawnPoints = genResult.spawnPoints;
    this._itemPoints = genResult.itemPoints;

    // Colocar las escaleras físicamente en el TileMap
    this.tileMap.setTile(this._stairsPos.x, this._stairsPos.y, 3); // 3 = STAIRS_DOWN

    // Spawnear objetos
    const zone = this._getZoneConfig();
    const minItems = zone ? zone.itemsPerFloor[0] : 3;
    const maxItems = zone ? zone.itemsPerFloor[1] : 5;
    const count = minItems + Math.floor(Math.random() * (maxItems - minItems + 1));
    spawnItems(this._itemPoints, count, this.itemsData, this.entityManager);
  }

  _getZoneConfig() {
    if (!this.floorsData || !this.floorsData.zones) return null;
    return this.floorsData.zones.find(z => this._currentFloor >= z.floors[0] && this._currentFloor <= z.floors[1]);
  }

  /**
   * Spawn de Pokémon enemigos
   * @private
   */
  _spawnEnemies() {
    if (!this.tileMap || !this._spawnPoints) return;
    const zone = this._getZoneConfig();
    if (!zone) return;

    const minEnemies = zone.enemiesPerFloor[0];
    const maxEnemies = zone.enemiesPerFloor[1];
    const enemyCount = minEnemies + Math.floor(Math.random() * (maxEnemies - minEnemies + 1));

    const points = [...this._spawnPoints];
    // Mezclar puntos de spawn
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }

    const actualCount = Math.min(enemyCount, points.length);
    for (let i = 0; i < actualCount; i++) {
      const point = points[i];
      const speciesId = this._selectRandomEnemySpecies(zone.pokemon);
      const minLvl = zone.levelRange[0];
      const maxLvl = zone.levelRange[1];
      const level = minLvl + Math.floor(Math.random() * (maxLvl - minLvl + 1));

      // Crear enemigo
      const enemyId = this.entityManager.createPokemon(speciesId, level, point.x, point.y, true);
      const fighter = this.entityManager.getComponent(enemyId, 'fighter');
      
      // Registrar en turnos
      this.turnManager.addEntity(enemyId, fighter ? fighter.speed : 50, false);
      
      // Registrar en Pokédex
      this.pokedexSeen.add(speciesId);
    }

    // Spawnear boss de zona si estamos en el último piso de esa zona
    if (zone.boss && this._currentFloor === zone.floors[1]) {
      const bossPoint = points[actualCount] || this._stairsPos;
      const bossId = this.entityManager.createPokemon(zone.boss.id, zone.boss.level, bossPoint.x, bossPoint.y, true);
      
      // Sobrescribir nombre a su nombre de Jefe
      const info = this.entityManager.getComponent(bossId, 'pokemonInfo');
      if (info) {
        info.name = `JEFE: ${zone.boss.name}`;
        this.entityManager.setComponent(bossId, 'pokemonInfo', info);
      }

      const fighter = this.entityManager.getComponent(bossId, 'fighter');
      // Subir HP del jefe a 2x para más dificultad
      if (fighter) {
        fighter.maxHp = fighter.maxHp * 2;
        fighter.hp = fighter.maxHp;
        this.entityManager.setComponent(bossId, 'fighter', fighter);
      }

      this.turnManager.addEntity(bossId, fighter ? fighter.speed : 60, false);
      this.pokedexSeen.add(zone.boss.id);
      
      this.eventBus.emit('message', `¡Alerta! ¡${zone.boss.name} ha aparecido!`);
    }
  }

  _selectRandomEnemySpecies(pokemonList) {
    if (!pokemonList || pokemonList.length === 0) return 19; // Rattata por defecto
    const totalWeight = pokemonList.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const p of pokemonList) {
      roll -= p.weight;
      if (roll <= 0) return p.id;
    }
    return pokemonList[0].id;
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

    const action = this.inputHandler.getAction();
    if (!action) return;

    this._processPlayerAction(action);
  }

  /**
   * Procesa el turno completo
   * @param {Object} action - Acción del jugador
   * @private
   */
  _processPlayerAction(action) {
    this.stats.turnsPlayed++;

    const executeAction = (entityId, act) => {
      return this._executeEntityAction(entityId, act);
    };

    const getEnemyAction = (entityId) => {
      return this._getEnemyAIAction(entityId);
    };

    // Procesar turno
    const results = this.turnManager.processTurn(action, executeAction, getEnemyAction);

    // Actualizar cámara y FOV
    this._updateCamera();
    this._updateFOV();

    this.needsRender = true;
  }

  /**
   * Lógica de ejecución de acciones de cualquier entidad
   * @private
   */
  _executeEntityAction(entityId, action) {
    switch (action.type) {
      case ACTIONS.MOVE: {
        if (!this.tileMap) {
          return { success: false, type: 'blocked' };
        }
        
        const result = this.movementSystem.tryMove(
          entityId, action.dx, action.dy,
          this.tileMap, this.entityManager
        );

        if (result.type === 'bump_attack') {
          // Iniciar combate
          return this._handleCombat(entityId, result.targetEntity);
        } else if (result.type === 'stairs') {
          if (entityId === this._playerId) {
            // Si es Mewtwo el jefe final y está vivo, bloquear salida
            const MewtwoFighter = this.entityManager.getEntitiesWithComponents('aiControlled').find(id => {
              const info = this.entityManager.getComponent(id, 'pokemonInfo');
              return info && info.name.includes('Mewtwo');
            });
            if (MewtwoFighter) {
              this.eventBus.emit('message', '¡Mewtwo te bloquea las escaleras!');
              return { success: false, type: 'blocked' };
            }
            
            // Si estamos en el piso 50 y Mewtwo ha muerto, ¡has ganado!
            if (this._currentFloor === 50) {
              this.changeState(GAME_STATES.VICTORY);
              return { success: true, type: 'victory' };
            }

            this.eventBus.emit('floor_change', { direction: 'down' });
          }
          return result;
        } else if (result.type === 'pickup') {
          if (entityId === this._playerId) {
            this.eventBus.emit('item_picked_up', {
              entityId: entityId,
              itemEntity: result.itemEntity
            });
          }
          return result;
        }

        return result;
      }

      case ACTIONS.WAIT:
        // Procesar curación pasiva muy sutil
        const fighter = this.entityManager.getComponent(entityId, 'fighter');
        if (fighter && fighter.hp > 0 && fighter.hp < fighter.maxHp && Math.random() < 0.1) {
          fighter.hp = Math.min(fighter.maxHp, fighter.hp + 1);
          this.entityManager.setComponent(entityId, 'fighter', fighter);
        }
        return { success: true, type: 'waited' };

      case ACTIONS.ATTACK:
        return this._handleCombat(entityId, action.targetId);

      case 'confirm':
        return this._handleConfirmAction(entityId);

      default:
        return { success: false, type: 'unknown_action' };
    }
  }

  /**
   * Acción Z (confirmar) sobre las escaleras o un item
   * @private
   */
  _handleConfirmAction(entityId) {
    const pos = this.entityManager.getComponent(entityId, 'position');
    if (!pos) return { success: false, type: 'no_position' };

    // Si hay escaleras en la posición actual
    const tile = this.tileMap.getTile(pos.x, pos.y);
    if (tile && tile.id === 3) { // 3 = STAIRS_DOWN
      if (entityId === this._playerId) {
        // Verificar si es el jefe final en el piso 50
        if (this._currentFloor === 50) {
          this.changeState(GAME_STATES.VICTORY);
          return { success: true, type: 'victory' };
        }
        this.eventBus.emit('floor_change', { direction: 'down' });
      }
      return { success: true, type: 'stairs_used' };
    }

    // Si hay un item
    const item = this.entityManager.getItemAt(pos.x, pos.y);
    if (item !== null) {
      this.eventBus.emit('item_picked_up', {
        entityId: entityId,
        itemEntity: item
      });
      return { success: true, type: 'picked_up' };
    }

    return { success: false, type: 'nothing_here' };
  }

  /**
   * Resuelve el combate por turnos
   * @private
   */
  _handleCombat(attackerId, defenderId) {
    const attackerInfo = this.entityManager.getComponent(attackerId, 'pokemonInfo');
    const defenderInfo = this.entityManager.getComponent(defenderId, 'pokemonInfo');

    if (!attackerInfo || !defenderInfo) return { success: false };

    // Procesar efectos de estado primero
    const status = processStatusEffects(attackerId, this.entityManager);
    if (status.messages) {
      for (const msg of status.messages) {
        this.eventBus.emit('message', msg);
      }
    }

    if (!status.canAct) {
      return { success: false, type: 'status_blocked' };
    }

    // Seleccionar movimiento
    let moveSelected = null;
    if (attackerId === this._playerId) {
      const idx = this._selectedMoveIndex;
      const moveSlot = attackerInfo.currentMoves[idx] || attackerInfo.currentMoves[0];
      
      if (moveSlot && moveSlot.currentPP > 0) {
        moveSelected = this.movesData.find(m => m.id === moveSlot.moveId);
      } else {
        // Intentar otro movimiento con PP
        const validSlot = attackerInfo.currentMoves.find(m => m.currentPP > 0);
        if (validSlot) {
          moveSelected = this.movesData.find(m => m.id === validSlot.moveId);
        }
      }
    } else {
      // Enemigo usa IA para elegir mejor movimiento
      moveSelected = selectBestMove(attackerInfo, defenderInfo, this.movesData, this.typeChart);
    }

    // Si no quedan movimientos utilizables, usar Force (Struggle)
    if (!moveSelected) {
      moveSelected = {
        id: 165,
        name: 'Struggle',
        type: 'normal',
        power: 50,
        pp: 1,
        damageClass: 'physical',
        effect: 'recoil',
        description: 'Force'
      };
    }

    // Ejecutar combate real
    const combatResult = executeMove({
      attackerId,
      defenderId,
      move: moveSelected,
      entityManager: this.entityManager,
      typeChart: this.typeChart,
      eventBus: this.eventBus
    });

    // Enviar diálogos/mensajes
    if (combatResult.messages) {
      for (const msg of combatResult.messages) {
        this.eventBus.emit('message', msg);
      }
    }

    // Sumar estadísticas de daño
    if (attackerId === this._playerId) {
      this.stats.totalDamageDealt += combatResult.damage;
    } else if (defenderId === this._playerId) {
      this.stats.totalDamageTaken += combatResult.damage;
    }

    // Si el defensor es derrotado y el atacante es del jugador, dar experiencia
    if (combatResult.defenderFainted) {
      if (attackerId === this._playerId || this.entityManager.hasComponent(attackerId, 'partyMember')) {
        const baseExp = defenderInfo.baseExp || 50;
        const xpGained = Math.max(1, Math.floor((baseExp * defenderInfo.level) / 5));
        
        const fighter = this.entityManager.getComponent(attackerId, 'fighter');
        const xpResult = grantExperience(attackerInfo, fighter, xpGained, this.pokemonData, this.movesData);
        
        if (xpResult.messages) {
          for (const msg of xpResult.messages) {
            this.eventBus.emit('message', msg);
          }
        }

        // Subida de nivel
        if (xpResult.levelsGained > 0) {
          this.eventBus.emit('level_up', { entityId: attackerId, newLevel: attackerInfo.level });
          
          // Verificar evolución al subir de nivel
          const evo = checkEvolution(attackerInfo, this.evolutionsData);
          if (evo) {
            // Ejecutar evolución
            const evoResult = evolve(attackerId, evo, this.entityManager, this.pokemonData, this.movesData);
            if (evoResult.messages) {
              for (const msg of evoResult.messages) {
                // Diálogo tipo RPG para evolución
                this.eventBus.emit('show_dialog', { text: evoResult.messages.join('\n') });
              }
            }
          }
        }
      }
    }

    this.needsRender = true;
    return { success: true, type: 'attacked' };
  }

  /**
   * Obtiene la acción de IA de un enemigo
   * @private
   */
  _getEnemyAIAction(entityId) {
    if (!this.tileMap || !this._playerId) return null;
    const playerPos = this.entityManager.getComponent(this._playerId, 'position');
    if (!playerPos) return null;

    // Ejecuta comportamiento real
    const action = getEnemyAction(entityId, this.entityManager, this.tileMap, playerPos, this._playerId);
    
    // Si la acción es ataque, re-mapear para que use el CombatSystem
    if (action && action.type === 'attack') {
      return { type: ACTIONS.ATTACK, targetId: action.targetId };
    }

    return action;
  }

  /**
   * Ejecuta objetos de inventario
   */
  useInventoryItem(itemId, targetPokemonId) {
    const itemData = this.itemsData.find(i => i.id === itemId);
    if (!itemData) return;

    this.stats.itemsUsed++;

    if (itemData.type === 'capture') {
      const targetFighter = this.entityManager.getComponent(targetPokemonId, 'fighter');
      const targetInfo = this.entityManager.getComponent(targetPokemonId, 'pokemonInfo');

      if (!targetFighter || !targetInfo) {
        this.eventBus.emit('message', 'No hay ningún Pokémon objetivo cerca.');
        return;
      }

      const captureResult = attemptCapture(targetFighter, targetInfo, itemData, this.pokemonData);

      this.eventBus.emit('capture_attempt', {
        targetId: targetPokemonId,
        shakes: captureResult.shakes,
        success: captureResult.success,
      });
      
      // Consumir ball
      const slot = this.inventory.find(s => s.itemId === itemId);
      if (slot) {
        slot.quantity--;
        if (slot.quantity <= 0) {
          const idx = this.inventory.indexOf(slot);
          if (idx > -1) this.inventory.splice(idx, 1);
        }
      }

      // Mostrar diálogos secuenciales del lanzamiento
      this.eventBus.emit('show_dialog', {
        text: captureResult.messages.join('\n\n'),
        callback: () => {
          if (captureResult.success) {
            this.stats.pokemonCaptured++;
            
            // Añadir al equipo
            const party = this.entityManager.getEntitiesWithComponents('partyMember');
            if (party.length < 4) {
              this.entityManager.setComponent(targetPokemonId, 'partyMember', {
                slot: party.length,
                isLeader: false
              });
              // Quitar IA enemiga
              this.entityManager.removeComponent(targetPokemonId, 'aiControlled');
              // Quitar del turn manager como enemigo
              this.turnManager.removeEntity(targetPokemonId);
              
              this.eventBus.emit('message', `¡${targetInfo.name} se ha unido a tu equipo!`);
            } else {
              this.eventBus.emit('message', `¡El equipo está lleno! ${targetInfo.name} fue liberado.`);
              this.entityManager.destroyEntity(targetPokemonId);
            }
          }
        }
      });
    } else {
      // Usar objeto curativo o escape rope
      const result = useItem(itemId, targetPokemonId, this.entityManager, this.inventory, this.itemsData);
      for (const msg of result.messages) {
        this.eventBus.emit('message', msg);
      }

      if (itemData.type === 'escape' && result.success) {
        // Escapar: volver a la pantalla de título
        this.saveGameData();
        this.changeState(GAME_STATES.TITLE);
      }
    }

    // El uso de un objeto consume el turno del jugador (esperar)
    this.turnManager.processTurn(
      { type: ACTIONS.WAIT },
      (id, act) => this._executeEntityAction(id, act),
      (id) => this._getEnemyAIAction(id)
    );
    this.needsRender = true;
  }

  // ─── Renderizado ──────────────────────────────────────────────────────────

  /**
   * Pre-carga sprites de todas las entidades con componente sprite.
   * @private
   */
  _preloadVisibleSprites() {
    if (!this.renderer?.spriteManager) return;

    const entityIds = this.entityManager.getEntitiesWithComponents('sprite');
    for (const entityId of entityIds) {
      const sprite = this.entityManager.getComponent(entityId, 'sprite');
      if (sprite?.url) {
        this.renderer.spriteManager.loadSprite(sprite.url).then(() => {
          this.needsRender = true;
        });
      }
    }
  }

  render() {
    if (this.renderer) {
      this.renderer.update(performance.now());
    }

    const animating = this.renderer && this.renderer.hasActiveAnimations();
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
        this.fovSystem.update(pos.x, pos.y, this.tileMap, FOV_RADIUS);
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
        currentMoves: info.currentMoves,
        types: info.types,
        hp: fighter.hp,
        maxHp: fighter.maxHp,
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

  destroy() {
    this.stop();
    this.inputHandler.destroy();
    this.eventBus.clear();
    this.entityManager.clear();
    this.turnManager.reset();
    console.log('[Game] Juego destruido.');
  }
}

// Helper para encontrar una posición de inicio walkable para el jugador
function genStartPos(tileMap) {
  if (!tileMap) return { x: 5, y: 5 };
  // Intentar encontrar un tile de floor al principio del mapa
  for (let y = 1; y < tileMap.height - 1; y++) {
    for (let x = 1; x < tileMap.width - 1; x++) {
      const tile = tileMap.getTile(x, y);
      if (tile && tile.id === 1) { // 1 = FLOOR
        return { x, y };
      }
    }
  }
  return { x: 5, y: 5 };
}
