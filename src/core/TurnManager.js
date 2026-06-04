/**
 * TurnManager.js
 * Sistema de turnos basado en energía para PokéRogue.
 *
 * Cada entidad acumula energía según su velocidad.
 * Cuando la energía alcanza o supera 100, la entidad obtiene un turno.
 * El jugador espera input; los enemigos consultan su IA.
 *
 * Fórmula de energía por tick:
 *   energía += Math.floor(speed / 5) + 1
 *   (mínimo 1 de energía por tick para que hasta el más lento actúe)
 */

export class TurnManager {
  /**
   * @param {import('./EventBus.js').EventBus} eventBus - Bus de eventos del juego
   */
  constructor(eventBus) {
    /** @type {import('./EventBus.js').EventBus} */
    this._eventBus = eventBus;

    /**
     * Registro de entidades con su velocidad y energía acumulada.
     * @type {Map<number, { speed: number, energy: number }>}
     */
    this._entities = new Map();

    /**
     * ID de la entidad del jugador.
     * Se usa para distinguir entre turno del jugador y turno enemigo.
     * @type {number|null}
     */
    this._playerId = null;

    /**
     * Número del turno actual (se incrementa tras cada ciclo completo).
     * @type {number}
     */
    this._turnCount = 0;
  }

  /**
   * Registrar una entidad en el sistema de turnos.
   * @param {number} entityId - ID único de la entidad
   * @param {number} speed - Estadística de velocidad (afecta la acumulación de energía)
   * @param {boolean} [isPlayer=false] - Si true, marca esta entidad como el jugador
   */
  addEntity(entityId, speed, isPlayer = false) {
    this._entities.set(entityId, {
      speed: speed,
      // Enemigos empiezan con energía parcial para actuar pronto tras el jugador
      energy: isPlayer ? 0 : 80
    });

    if (isPlayer) {
      this._playerId = entityId;
    }
  }

  /**
   * Eliminar una entidad del sistema de turnos.
   * Se llama cuando una entidad es destruida (ej. Pokémon debilitado).
   * @param {number} entityId - ID de la entidad a eliminar
   */
  removeEntity(entityId) {
    this._entities.delete(entityId);
    if (this._playerId === entityId) {
      this._playerId = null;
    }
  }

  /**
   * Actualizar la velocidad de una entidad registrada.
   * Útil cuando cambia la estadística de velocidad (buffs, nivel, etc.)
   * @param {number} entityId - ID de la entidad
   * @param {number} newSpeed - Nueva velocidad
   */
  updateSpeed(entityId, newSpeed) {
    const entry = this._entities.get(entityId);
    if (entry) {
      entry.speed = newSpeed;
    }
  }

  /**
   * Obtener la entidad con más energía que tenga al menos 100.
   * Si ninguna entidad tiene 100+ de energía, retorna null.
   * @returns {number|null} ID de la entidad que debe actuar, o null
   */
  getNextActor() {
    let bestId = null;
    let bestEnergy = 99; // Solo consideramos energía >= 100

    for (const [entityId, data] of this._entities) {
      if (data.energy > bestEnergy) {
        bestEnergy = data.energy;
        bestId = entityId;
      }
    }

    return bestId;
  }

  /**
   * Acumular energía para todas las entidades registradas.
   * Se llama cuando ninguna entidad tiene suficiente energía para actuar.
   * @private
   */
  _tickEnergy() {
    for (const [, data] of this._entities) {
      // Mínimo 1 de energía por tick para garantizar progreso
      const gain = Math.floor(data.speed / 5) + 1;
      data.energy += gain;
    }
  }

  /**
   * Procesar el turno del jugador y luego todos los turnos enemigos pendientes.
   *
   * Flujo:
   * 1. Ejecutar la acción del jugador
   * 2. Consumir la energía del jugador
   * 3. Procesar los turnos de todas las entidades enemigas con energía >= 100
   * 4. Si ninguna entidad tiene energía, acumular hasta que alguna la tenga
   * 5. Emitir evento 'turn_end'
   *
   * @param {Object} playerAction - Acción del jugador desde InputHandler
   * @param {Function} executeAction - Función que ejecuta una acción:
   *   (entityId, action) => { success: boolean }
   * @param {Function} getEnemyAction - Función que obtiene la acción de un enemigo:
   *   (entityId) => action
   * @returns {{ playerResult: Object, enemyResults: Array }} Resultados de las acciones
   */
  processTurn(playerAction, executeAction, getEnemyAction) {
    const results = {
      playerResult: null,
      enemyResults: []
    };

    // ── 1. Turno del jugador ──
    if (this._playerId !== null && this._entities.has(this._playerId)) {
      results.playerResult = executeAction(this._playerId, playerAction);

      // Consumir energía del jugador solo si la acción fue exitosa
      const playerData = this._entities.get(this._playerId);
      if (playerData && results.playerResult && results.playerResult.success) {
        playerData.energy -= 100;
      }
    }

    // ── 2. Turnos enemigos ──
    // Acumular energía hasta que algún enemigo pueda actuar (máx. ~2 turnos de espera)
    let preTickSafety = 0;
    while (this.getNextActor() === null && preTickSafety < 12) {
      this._tickEnergy();
      preTickSafety++;
    }

    // Procesar todos los enemigos que tengan suficiente energía
    let nextActor = this.getNextActor();
    let safetyCounter = 0;
    const maxIterations = this._entities.size * 2; // Evitar bucles infinitos

    while (nextActor !== null && safetyCounter < maxIterations) {
      safetyCounter++;

      // Saltar al jugador (ya procesó su turno)
      if (nextActor === this._playerId) {
        // Si el jugador tiene más de 100 de energía, consumirla
        const pd = this._entities.get(this._playerId);
        if (pd && pd.energy >= 100) {
          pd.energy -= 100;
        }
        nextActor = this.getNextActor();
        continue;
      }

      // Obtener y ejecutar la acción del enemigo
      const enemyAction = getEnemyAction(nextActor);
      if (enemyAction) {
        const enemyResult = executeAction(nextActor, enemyAction);
        results.enemyResults.push({
          entityId: nextActor,
          action: enemyAction,
          result: enemyResult
        });
      } else {
        // Sin acción válida (ej. wander bloqueado): esperar turno
        executeAction(nextActor, { type: 'wait' });
      }

      // Consumir energía del enemigo
      const enemyData = this._entities.get(nextActor);
      if (enemyData) {
        enemyData.energy -= 100;
      }

      nextActor = this.getNextActor();
    }

    // ── 3. Acumular energía para el siguiente ciclo ──
    this._tickEnergy();

    // ── 4. Incrementar contador de turnos ──
    this._turnCount++;

    // ── 5. Emitir evento de fin de turno ──
    this._eventBus.emit('turn_end', {
      turnCount: this._turnCount,
      playerResult: results.playerResult,
      enemyResults: results.enemyResults
    });

    return results;
  }

  /**
   * Verificar si es el turno del jugador.
   * Acumula energía si nadie puede actuar todavía.
   * @returns {boolean} True si el jugador tiene suficiente energía para actuar
   */
  isPlayerTurn() {
    // Acumular energía hasta que alguien pueda actuar
    let safetyCounter = 0;
    while (this.getNextActor() === null && safetyCounter < 1000) {
      this._tickEnergy();
      safetyCounter++;
    }

    const nextActor = this.getNextActor();
    return nextActor === this._playerId;
  }

  /**
   * Obtener el número actual de turno.
   * @returns {number}
   */
  getTurnCount() {
    return this._turnCount;
  }

  /**
   * Obtener la energía actual de una entidad.
   * @param {number} entityId
   * @returns {number|null} Energía actual, o null si la entidad no existe
   */
  getEnergy(entityId) {
    const data = this._entities.get(entityId);
    return data ? data.energy : null;
  }

  /**
   * Reiniciar el sistema de turnos.
   * Elimina todas las entidades y resetea el contador.
   */
  reset() {
    this._entities.clear();
    this._playerId = null;
    this._turnCount = 0;
  }
}
