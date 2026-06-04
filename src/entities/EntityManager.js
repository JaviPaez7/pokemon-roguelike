/**
 * EntityManager.js
 * Gestor de entidades ECS-lite para PokéRogue.
 *
 * Responsabilidades:
 * - Crear y destruir entidades con IDs únicos
 * - Asignar y consultar componentes
 * - Crear entidades preconfiguradas (Pokémon, objetos)
 * - Calcular estadísticas según las fórmulas de Pokémon
 *
 * Fórmulas de estadísticas (simplificadas de la Generación III+):
 *   HP = Math.floor(((2 * baseHP * level) / 100) + level + 10)
 *   Otra = Math.floor(((2 * baseStat * level) / 100) + level + 5)
 *     (nota: nivel + 5 como simplificación, sin IVs/EVs/naturaleza)
 */

import { createComponentStore } from './Components.js';
import { ENEMY_DETECT_RANGE } from '../constants.js';
import { calculateAllStats } from '../systems/StatCalculator.js';

export class EntityManager {
  /**
   * @param {import('../core/EventBus.js').EventBus} eventBus - Bus de eventos del juego
   */
  constructor(eventBus) {
    /** @type {import('../core/EventBus.js').EventBus} */
    this._eventBus = eventBus;

    /** Almacén de componentes (un Map por tipo) */
    this._components = createComponentStore();

    /** Contador auto-incremental para generar IDs únicos */
    this._nextId = 1;

    /** Conjunto de IDs de entidades activas */
    this._activeEntities = new Set();

    /**
     * Datos de especies de Pokémon cargados desde JSON.
     * Se inicializan con loadSpeciesData().
     * @type {Object|null}
     */
    this._speciesData = null;

    /**
     * Datos de movimientos cargados desde JSON.
     * @type {Object|null}
     */
    this._movesData = null;
  }

  /**
   * Cargar datos de especies y movimientos desde archivos JSON.
   * Debe llamarse antes de crear Pokémon.
   * @param {Object} speciesData - Datos de especies { id: { name, types, baseStats, moves, ... } }
   * @param {Object} movesData - Datos de movimientos { id: { name, type, power, pp, ... } }
   */
  loadData(speciesData, movesData) {
    this._speciesData = speciesData;
    this._movesData = movesData;
  }

  // ─── Gestión básica de entidades ──────────────────────────────────────────

  /**
   * Crear una nueva entidad vacía.
   * @returns {number} ID único de la nueva entidad
   */
  createEntity() {
    const id = this._nextId++;
    this._activeEntities.add(id);
    return id;
  }

  /**
   * Destruir una entidad, eliminándola de todos los Maps de componentes.
   * @param {number} entityId - ID de la entidad a destruir
   */
  destroyEntity(entityId) {
    if (!this._activeEntities.has(entityId)) return;

    // Eliminar de todos los almacenes de componentes
    for (const componentMap of Object.values(this._components)) {
      componentMap.delete(entityId);
    }

    this._activeEntities.delete(entityId);
  }

  /**
   * Verificar si una entidad existe y está activa.
   * @param {number} entityId
   * @returns {boolean}
   */
  entityExists(entityId) {
    return this._activeEntities.has(entityId);
  }

  // ─── Acceso a componentes ─────────────────────────────────────────────────

  /**
   * Obtener los datos de un componente para una entidad.
   * @param {number} entityId - ID de la entidad
   * @param {string} componentName - Nombre del componente (ej. 'position', 'fighter')
   * @returns {Object|undefined} Datos del componente, o undefined si no existe
   */
  getComponent(entityId, componentName) {
    const store = this._components[componentName];
    if (!store) {
      console.warn(`[EntityManager] Componente desconocido: '${componentName}'`);
      return undefined;
    }
    return store.get(entityId);
  }

  /**
   * Asignar datos de un componente a una entidad.
   * Si la entidad ya tiene ese componente, se sobrescribe.
   * @param {number} entityId - ID de la entidad
   * @param {string} componentName - Nombre del componente
   * @param {Object} data - Datos del componente
   */
  setComponent(entityId, componentName, data) {
    const store = this._components[componentName];
    if (!store) {
      console.warn(`[EntityManager] Componente desconocido: '${componentName}'`);
      return;
    }
    store.set(entityId, data);
  }

  /**
   * Verificar si una entidad tiene un componente específico.
   * @param {number} entityId
   * @param {string} componentName
   * @returns {boolean}
   */
  hasComponent(entityId, componentName) {
    const store = this._components[componentName];
    return store ? store.has(entityId) : false;
  }

  /**
   * Eliminar un componente de una entidad.
   * @param {number} entityId
   * @param {string} componentName
   */
  removeComponent(entityId, componentName) {
    const store = this._components[componentName];
    if (store) {
      store.delete(entityId);
    }
  }

  // ─── Consultas ────────────────────────────────────────────────────────────

  /**
   * Obtener todos los IDs de entidades que poseen TODOS los componentes indicados.
   * @param {...string} componentNames - Nombres de componentes requeridos
   * @returns {number[]} Array de IDs de entidades que cumplen la condición
   */
  getEntitiesWithComponents(...componentNames) {
    if (componentNames.length === 0) return [...this._activeEntities];

    // Empezar con el componente que tenga menos entidades (optimización)
    const stores = componentNames.map(name => this._components[name]).filter(Boolean);
    if (stores.length !== componentNames.length) {
      // Algún nombre de componente no existe
      return [];
    }

    // Usar el Map más pequeño como base
    let smallest = stores[0];
    for (const store of stores) {
      if (store.size < smallest.size) {
        smallest = store;
      }
    }

    const result = [];
    for (const entityId of smallest.keys()) {
      // Verificar que la entidad tenga TODOS los componentes
      let hasAll = true;
      for (const store of stores) {
        if (!store.has(entityId)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll && this._activeEntities.has(entityId)) {
        result.push(entityId);
      }
    }

    return result;
  }

  /**
   * Obtener la entidad que ocupa una posición específica en la cuadrícula.
   * Ignora entidades que son objetos en el suelo (itemDrop) por defecto.
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @param {boolean} [includeItems=false] - Si incluir entidades con itemDrop
   * @returns {number|null} ID de la entidad, o null si la posición está vacía
   */
  getEntityAt(x, y, includeItems = false) {
    for (const [entityId, pos] of this._components.position) {
      if (pos.x === x && pos.y === y && this._activeEntities.has(entityId)) {
        // Saltar objetos si no se solicitan
        if (!includeItems && this._components.itemDrop.has(entityId)) {
          continue;
        }
        return entityId;
      }
    }
    return null;
  }

  /**
   * Obtener el objeto (itemDrop) en una posición específica.
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @returns {number|null} ID de la entidad objeto, o null
   */
  getItemAt(x, y) {
    for (const [entityId, pos] of this._components.position) {
      if (pos.x === x && pos.y === y && this._activeEntities.has(entityId)) {
        if (this._components.itemDrop.has(entityId)) {
          return entityId;
        }
      }
    }
    return null;
  }

  /**
   * Obtener la trampa (trap) en una posición específica.
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @returns {number|null} ID de la entidad trampa, o null
   */
  getTrapAt(x, y) {
    for (const [entityId, pos] of this._components.position) {
      if (pos.x === x && pos.y === y && this._activeEntities.has(entityId)) {
        if (this._components.trap.has(entityId)) {
          return entityId;
        }
      }
    }
    return null;
  }


  // ─── Fábricas de entidades preconfiguradas ────────────────────────────────

  /**
   * Seleccionar los movimientos que un Pokémon conoce a un nivel dado.
   * Prioriza los movimientos de nivel más alto (máximo 4).
   * @param {Array} learnset - Lista de { moveId, level } de la especie
   * @param {number} currentLevel - Nivel actual del Pokémon
   * @returns {Array<{moveId: number, currentPP: number, maxPP: number}>}
   * @private
   */
  _selectMoves(learnset, currentLevel) {
    if (!learnset || learnset.length === 0) {
      // Movimiento por defecto si no hay learnset: Placaje / Tackle
      return [{
        moveId: 'tackle',
        currentPP: 35,
        maxPP: 35
      }];
    }

    // Filtrar movimientos aprendidos hasta el nivel actual
    const available = learnset
      .filter(entry => entry.level <= currentLevel)
      // Ordenar por nivel descendente (priorizar los más recientes)
      .sort((a, b) => b.level - a.level)
      // Tomar máximo 4
      .slice(0, 4);

    return available.map(entry => {
      // Buscar datos del movimiento para obtener los PP
      const moveData = this._movesData
        ? this._movesData[entry.moveId]
        : null;

      const maxPP = moveData ? moveData.pp : 20; // PP por defecto: 20
      return {
        moveId: entry.moveId,
        currentPP: maxPP,
        maxPP: maxPP
      };
    });
  }

  /**
   * Crear una entidad Pokémon completamente configurada.
   *
   * @param {string} speciesId - ID de la especie (ej. 'pikachu', 'charmander')
   * @param {number} level - Nivel del Pokémon
   * @param {number} x - Posición X inicial
   * @param {number} y - Posición Y inicial
   * @param {boolean} [isEnemy=false] - Si es un Pokémon enemigo (controlado por IA)
   * @returns {number} ID de la entidad creada
   */
  createPokemon(speciesId, level, x, y, isEnemy = false) {
    const id = this.createEntity();

    // Obtener datos de la especie
    const species = this._speciesData ? this._speciesData[speciesId] : null;

    if (!species) {
      console.warn(
        `[EntityManager] Especie no encontrada: '${speciesId}'. Usando valores por defecto.`
      );
    }

    // Estadísticas base (valores por defecto si no hay datos)
    const baseStats = species?.baseStats ?? {
      hp: 50, attack: 50, defense: 50,
      spAtk: 50, spDef: 50, speed: 50
    };

    // Calcular estadísticas según el nivel
    const { maxHp, attack, defense, spAtk, spDef, speed } = calculateAllStats(baseStats, level);

    // Seleccionar movimientos apropiados para el nivel
    const moves = this._selectMoves(species?.learnset ?? [], level);

    // ── Asignar componentes ──

    // Posición en la cuadrícula
    this.setComponent(id, 'position', {
      x: x,
      y: y,
      facing: 'down',
      prevX: x,
      prevY: y,
      moveStartTime: 0
    });

    // Información de especie
    this.setComponent(id, 'pokemonInfo', {
      speciesId: speciesId,
      name: species?.name ?? speciesId,
      level: level,
      xp: 0,
      currentMoves: moves,
      types: species?.types ?? ['normal']
    });

    // Estadísticas de combate
    this.setComponent(id, 'fighter', {
      hp: maxHp,
      maxHp: maxHp,
      attack: attack,
      defense: defense,
      spAtk: spAtk,
      spDef: spDef,
      speed: speed,
      statusEffects: [],
      belly: 100,
      maxBelly: 100
    });

    // Sprite (se carga asíncronamente después)
    const spriteUrl = species?.sprite
      ?? species?.spriteUrl
      ?? (typeof speciesId === 'number'
        ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${speciesId}.png`
        : '');
    this.setComponent(id, 'sprite', {
      url: spriteUrl,
      image: null,
      loaded: false
    });

    // Si es enemigo, agregar componente de IA
    if (isEnemy) {
      this.setComponent(id, 'aiControlled', {
        behavior: 'wander',
        detectRange: ENEMY_DETECT_RANGE,
        alertedTo: null
      });
    }

    return id;
  }

  /**
   * Crear una entidad de objeto en el suelo.
   *
   * @param {string} itemId - ID del tipo de objeto
   * @param {number} quantity - Cantidad
   * @param {number} x - Posición X
   * @param {number} y - Posición Y
   * @returns {number} ID de la entidad creada
   */
  createItemEntity(itemId, quantity, x, y, spriteUrl = '') {
    const id = this.createEntity();

    // Posición
    this.setComponent(id, 'position', {
      x: x,
      y: y,
      facing: 'down',
      prevX: x,
      prevY: y,
      moveStartTime: 0
    });

    // Datos del objeto
    this.setComponent(id, 'itemDrop', {
      itemId: itemId,
      quantity: quantity
    });

    // Sprite del objeto
    this.setComponent(id, 'sprite', {
      url: spriteUrl || '',
      image: null,
      loaded: false
    });

    return id;
  }

  /**
   * Crear una entidad trampa en el suelo.
   *
   * @param {string} type - Tipo de trampa ('poison', 'sleep', etc.)
   * @param {number} x - Posición X
   * @param {number} y - Posición Y
   * @param {boolean} isHidden - Si la trampa empieza oculta
   * @returns {number} ID de la entidad creada
   */
  createTrapEntity(type, x, y, isHidden = true) {
    const id = this.createEntity();

    // Posición
    this.setComponent(id, 'position', {
      x: x,
      y: y,
      facing: 'down',
      prevX: x,
      prevY: y,
      moveStartTime: 0
    });

    // Datos de la trampa
    this.setComponent(id, 'trap', {
      type: type,
      isHidden: isHidden,
      uses: 1
    });

    return id;
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────

  /**
   * Obtener el número total de entidades activas.
   * @returns {number}
   */
  getEntityCount() {
    return this._activeEntities.size;
  }

  /**
   * Obtener todos los IDs de entidades activas.
   * @returns {number[]}
   */
  getAllEntities() {
    return [...this._activeEntities];
  }

  /**
   * Limpiar todas las entidades y componentes.
   * Útil al cambiar de piso o reiniciar la partida.
   * @param {boolean} [keepParty=false] - Si true, mantiene las entidades del equipo
   */
  clear(keepParty = false) {
    if (!keepParty) {
      // Eliminar todo
      for (const store of Object.values(this._components)) {
        store.clear();
      }
      this._activeEntities.clear();
      return;
    }

    // Mantener solo las entidades del equipo del jugador
    const partyIds = new Set(this._components.partyMember.keys());

    for (const entityId of [...this._activeEntities]) {
      if (!partyIds.has(entityId)) {
        this.destroyEntity(entityId);
      }
    }
  }
}
