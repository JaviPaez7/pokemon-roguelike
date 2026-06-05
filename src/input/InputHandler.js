/**
 * InputHandler.js
 * Manejador de entrada por teclado para PokéRogue.
 *
 * Mapeo de teclas:
 * - Flechas / WASD      → Movimiento { type: 'move', dx, dy }
 * - Z                    → Confirmar
 * - X                    → Cancelar / Abrir inventario
 * - C                    → Abrir equipo
 * - Espacio              → Esperar turno
 * - 1-4                  → Selección rápida de movimiento
 * - M                    → Alternar minimapa
 * - Escape               → Menú de pausa
 *
 * Contextos de entrada: 'exploration', 'menu', 'dialog'
 * Cada contexto puede interpretar las teclas de forma distinta.
 */

import { ACTIONS } from '../constants.js';

export class InputHandler {
  /**
   * @param {EventBus} eventBus - Bus de eventos para emitir acciones de UI
   */
  constructor(eventBus) {
    /** @type {EventBus} Referencia al bus de eventos */
    this._eventBus = eventBus;

    /** @type {boolean} Controla si se aceptan entradas (desactivar durante animaciones) */
    this.enabled = true;

    /**
     * Cola de acciones pendientes.
     * Solo se almacena una acción a la vez para evitar acumulación.
     * @type {Object|null}
     */
    this._actionQueue = null;

    /**
     * Contexto actual de entrada.
     * Determina cómo se interpretan las teclas.
     * @type {'exploration'|'menu'|'dialog'}
     */
    this._context = 'exploration';

    /**
     * Conjunto de teclas actualmente presionadas.
     * Se usa para prevenir repetición de teclas (solo keydown, no hold).
     * @type {Set<string>}
     */
    this._keysDown = new Set();

    // Vincular los handlers para poder removerlos después
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);

    // Registrar listeners en el documento
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  /**
   * Cambiar el contexto de entrada.
   * Limpia la cola de acciones al cambiar de contexto.
   * @param {'exploration'|'menu'|'dialog'} context - Nuevo contexto
   */
  setContext(context) {
    this._context = context;
    this._actionQueue = null;
    this._keysDown.clear();
  }

  /**
   * Obtener y consumir la siguiente acción en cola.
   * @returns {Object|null} La acción pendiente, o null si no hay ninguna
   */
  getAction() {
    const action = this._actionQueue;
    this._actionQueue = null;
    return action;
  }

  /**
   * Ver la acción en cola sin consumirla.
   * @returns {Object|null}
   */
  peekAction() {
    return this._actionQueue;
  }

  /**
   * Manejador interno de keydown.
   * Previene la repetición de teclas y mapea según el contexto.
   * @param {KeyboardEvent} event
   * @private
   */
  _handleKeyDown(event) {
    // No procesar si la entrada está desactivada
    if (!this.enabled) return;

    const isMovementKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Numpad8', 'Numpad2', 'Numpad4', 'Numpad6', 'Numpad7', 'Numpad9', 'Numpad1', 'Numpad3'].includes(event.code);
    const isRepeat = this._keysDown.has(event.code);
    
    // Prevenir repetición de tecla mantenida, EXCEPTO para movimiento en modo exploración
    if (isRepeat) {
      if (this._context !== 'exploration' || !isMovementKey) {
        return;
      }
    }
    
    this._keysDown.add(event.code);

    // Prevenir comportamiento por defecto del navegador para teclas del juego
    if (this._isGameKey(event.code)) {
      event.preventDefault();
    }

    // Despachar según el contexto actual
    switch (this._context) {
      case 'exploration':
        this._handleExplorationInput(event.code);
        break;
      case 'menu':
        this._handleMenuInput(event.code);
        break;
      case 'dialog':
        this._handleDialogInput(event.code);
        break;
    }
  }

  /**
   * Manejador interno de keyup.
   * Limpia la tecla del conjunto de teclas presionadas.
   * @param {KeyboardEvent} event
   * @private
   */
  _handleKeyUp(event) {
    this._keysDown.delete(event.code);
  }

  /**
   * Verifica si una tecla es una tecla del juego (para prevenir scroll, etc.)
   * @param {string} code - Código de tecla
   * @returns {boolean}
   * @private
   */
  _isGameKey(code) {
    const gameKeys = [
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'KeyZ', 'KeyX', 'KeyC', 'KeyM', 'KeyQ', 'Tab',
      'Space', 'Escape',
      'Digit1', 'Digit2', 'Digit3', 'Digit4',
      'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4',
      'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
      'Home', 'End', 'PageUp', 'PageDown',
      'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyY', 'KeyU', 'KeyB', 'KeyN'
    ];
    return gameKeys.includes(code);
  }

  /**
   * Procesar entrada en contexto de exploración.
   * Aquí es donde se generan las acciones de movimiento, combate, etc.
   * @param {string} code - Código de tecla
   * @private
   */
  _handleExplorationInput(code) {
    switch (code) {
      // ── Movimiento Ortogonal ──
      case 'ArrowUp':
      case 'KeyW':
      case 'Numpad8':
      case 'KeyK': // Vim Up
        this._actionQueue = { type: ACTIONS.MOVE, dx: 0, dy: -1 };
        break;
      case 'ArrowDown':
      case 'KeyS':
      case 'Numpad2':
      case 'KeyJ': // Vim Down
        this._actionQueue = { type: ACTIONS.MOVE, dx: 0, dy: 1 };
        break;
      case 'ArrowLeft':
      case 'KeyA':
      case 'Numpad4':
      case 'KeyH': // Vim Left
        this._actionQueue = { type: ACTIONS.MOVE, dx: -1, dy: 0 };
        break;
      case 'ArrowRight':
      case 'KeyD':
      case 'Numpad6':
      case 'KeyL': // Vim Right
        this._actionQueue = { type: ACTIONS.MOVE, dx: 1, dy: 0 };
        break;

      // ── Movimiento Diagonal ──
      case 'Home':
      case 'Numpad7':
      case 'KeyY': // Vim NW
        this._actionQueue = { type: ACTIONS.MOVE, dx: -1, dy: -1 };
        break;
      case 'PageUp':
      case 'Numpad9':
      case 'KeyU': // Vim NE
        this._actionQueue = { type: ACTIONS.MOVE, dx: 1, dy: -1 };
        break;
      case 'End':
      case 'Numpad1':
      case 'KeyB': // Vim SW
        this._actionQueue = { type: ACTIONS.MOVE, dx: -1, dy: 1 };
        break;
      case 'PageDown':
      case 'Numpad3':
      case 'KeyN': // Vim SE
        this._actionQueue = { type: ACTIONS.MOVE, dx: 1, dy: 1 };
        break;

      // ── Acciones ──
      case 'Space':
        this._actionQueue = { type: ACTIONS.WAIT };
        break;
      case 'KeyQ':
      case 'Tab':
        this._actionQueue = { type: 'swap_leader' };
        break;
      case 'KeyZ':
        // Confirmar: intentar usar escaleras o recoger objeto
        this._actionQueue = { type: 'confirm' };
        break;
      case 'KeyX':
        // Abrir inventario
        this._eventBus.emit('ui_action', { action: 'open_inventory' });
        break;
      case 'KeyC':
        // Abrir equipo
        this._eventBus.emit('ui_action', { action: 'open_team' });
        break;
      case 'KeyM':
        // Alternar minimapa
        this._eventBus.emit('ui_action', { action: 'toggle_minimap' });
        break;
      case 'Escape':
        // Menú de pausa
        this._eventBus.emit('ui_action', { action: 'pause_menu' });
        break;

      // ── Selección rápida de movimientos (1-4) ──
      case 'Digit1':
        this._eventBus.emit('ui_action', { action: 'select_move', index: 0 });
        break;
      case 'Digit2':
        this._eventBus.emit('ui_action', { action: 'select_move', index: 1 });
        break;
      case 'Digit3':
        this._eventBus.emit('ui_action', { action: 'select_move', index: 2 });
        break;
      case 'Digit4':
        this._eventBus.emit('ui_action', { action: 'select_move', index: 3 });
        break;
    }
  }

  /**
   * Procesar entrada en contexto de menú.
   * Navegar opciones y seleccionar/cancelar.
   * @param {string} code - Código de tecla
   * @private
   */
  _handleMenuInput(code) {
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this._eventBus.emit('menu_input', { direction: 'up' });
        break;
      case 'ArrowDown':
      case 'KeyS':
        this._eventBus.emit('menu_input', { direction: 'down' });
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this._eventBus.emit('menu_input', { direction: 'left' });
        break;
      case 'ArrowRight':
      case 'KeyD':
        this._eventBus.emit('menu_input', { direction: 'right' });
        break;
      case 'KeyZ':
        this._eventBus.emit('menu_input', { action: 'confirm' });
        break;
      case 'KeyX':
      case 'Escape':
        this._eventBus.emit('menu_input', { action: 'cancel' });
        break;
    }
  }

  /**
   * Procesar entrada en contexto de diálogo.
   * Solo avanzar o cerrar.
   * @param {string} code - Código de tecla
   * @private
   */
  _handleDialogInput(code) {
    switch (code) {
      case 'KeyZ':
      case 'Space':
        this._eventBus.emit('dialog_input', { action: 'advance' });
        break;
      case 'KeyX':
      case 'Escape':
        this._eventBus.emit('dialog_input', { action: 'skip' });
        break;
    }
  }

  /**
   * Limpiar los listeners del DOM.
   * Llamar al destruir el juego para evitar fugas de memoria.
   */
  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this._keysDown.clear();
    this._actionQueue = null;
  }
}
