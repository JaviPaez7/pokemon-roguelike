/**
 * EventBus.js
 * Sistema de eventos pub/sub para la comunicación desacoplada entre sistemas.
 *
 * Eventos soportados:
 * - 'pokemon_fainted'   → Un Pokémon ha sido derrotado
 * - 'item_picked_up'    → Se ha recogido un objeto del suelo
 * - 'level_up'          → Un Pokémon ha subido de nivel
 * - 'floor_change'      → Se ha cambiado de piso en la mazmorra
 * - 'capture_attempt'   → Se intenta capturar un Pokémon salvaje
 * - 'turn_end'          → Ha terminado un turno completo
 * - 'damage_dealt'      → Se ha infligido daño
 * - 'message'           → Mensaje para el log del juego
 */
export class EventBus {
  constructor() {
    /**
     * Mapa de nombre de evento → Set de callbacks suscritos.
     * Usamos Map + Set para eliminar duplicados y búsquedas rápidas.
     * @type {Map<string, Set<Function>>}
     */
    this._listeners = new Map();
  }

  /**
   * Suscribirse a un evento.
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Función a ejecutar cuando se emita el evento
   * @returns {void}
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
  }

  /**
   * Desuscribirse de un evento.
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Referencia exacta del callback a eliminar
   * @returns {void}
   */
  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      // Limpiamos el Set si ya no hay suscriptores
      if (listeners.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * Emitir un evento, notificando a todos los suscriptores.
   * Los callbacks se ejecutan de forma síncrona en orden de suscripción.
   * Los errores en un callback no detienen la ejecución de los demás.
   * @param {string} event - Nombre del evento
   * @param {*} data - Datos asociados al evento (cualquier tipo)
   * @returns {void}
   */
  emit(event, data) {
    const listeners = this._listeners.get(event);
    if (!listeners) return;

    for (const callback of listeners) {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `[EventBus] Error en listener de '${event}':`,
          error
        );
      }
    }
  }

  /**
   * Suscribirse a un evento, pero solo se ejecuta una vez.
   * Después de la primera emisión, se auto-desuscribe.
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Función a ejecutar una sola vez
   * @returns {void}
   */
  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }

  /**
   * Eliminar todos los suscriptores de todos los eventos.
   * Útil al reiniciar el juego o cambiar de escena.
   * @returns {void}
   */
  clear() {
    this._listeners.clear();
  }
}
