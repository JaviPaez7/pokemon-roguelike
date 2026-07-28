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
 * - 1-4                  → Usar movimiento (consume PP)
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

    /** @type {Set<string>} */
    this._keysDown = new Set();

    this._lastMoveTime = 0;
    this._moveRepeatRate = 120; // ms por tile al mantener pulsado
    this._firstMoveTime = 0;    // Tiempo inicial en que se pulsó la tecla

    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onTouch = this._handleTouchControls.bind(this);

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);

    const touchRoot = document.getElementById('touch-controls');
    if (touchRoot) {
      touchRoot.addEventListener('pointerdown', this._onTouch);
    }
  }

  /**
   * Controles táctiles del D-pad / botones Z X 1-4
   * @param {PointerEvent} event
   */
  _handleTouchControls(event) {
    const btn = event.target.closest('.touch-btn');
    if (!btn || !this.enabled) return;
    event.preventDefault();

    const action = btn.dataset.action;
    if (action === 'confirm') {
      if (this._context === 'menu') {
        this._eventBus.emit('menu_input', { action: 'confirm' });
      } else if (this._context === 'dialog') {
        this._eventBus.emit('dialog_input', { action: 'advance' });
      } else {
        this._actionQueue = { type: 'confirm' };
      }
      return;
    }
    if (action === 'inventory') {
      if (this._context === 'menu') {
        this._eventBus.emit('menu_input', { action: 'cancel' });
      } else if (this._context === 'exploration') {
        this._eventBus.emit('ui_action', { action: 'open_inventory' });
      }
      return;
    }
    if (action === 'team') {
      if (this._context === 'exploration') {
        this._eventBus.emit('ui_action', { action: 'open_team' });
      }
      return;
    }
    if (action === 'swap') {
      if (this._context === 'exploration') {
        this._actionQueue = { type: 'swap_leader' };
      }
      return;
    }
    if (action === 'map') {
      if (this._context === 'exploration') {
        this._eventBus.emit('ui_action', { action: 'toggle_minimap' });
      }
      return;
    }
    if (action === 'pause') {
      if (this._context === 'exploration') {
        this._eventBus.emit('ui_action', { action: 'open_pause' });
      } else if (this._context === 'menu') {
        this._eventBus.emit('menu_input', { action: 'cancel' });
      }
      return;
    }
    if (action === 'wait') {
      if (this._context === 'exploration') {
        this._actionQueue = { type: ACTIONS.WAIT };
      }
      return;
    }
    if (action && action.startsWith('move')) {
      const idx = parseInt(action.replace('move', ''), 10) - 1;
      if (this._context === 'exploration') {
        this._actionQueue = { type: ACTIONS.USE_MOVE, index: idx };
      }
      return;
    }

    if (btn.dataset.dx !== undefined) {
      const dx = parseInt(btn.dataset.dx, 10);
      const dy = parseInt(btn.dataset.dy, 10);
      if (this._context === 'exploration') {
        this._actionQueue = { type: ACTIONS.MOVE, dx, dy };
      } else if (this._context === 'menu') {
        // Navegación de menús con el D-pad táctil
        let direction = null;
        if (dy < 0 && dx === 0) direction = 'up';
        else if (dy > 0 && dx === 0) direction = 'down';
        else if (dx < 0 && dy === 0) direction = 'left';
        else if (dx > 0 && dy === 0) direction = 'right';
        else if (dy < 0) direction = 'up';
        else if (dy > 0) direction = 'down';
        if (direction) {
          this._eventBus.emit('menu_input', { direction });
        }
      } else if (this._context === 'dialog') {
        this._eventBus.emit('dialog_input', { action: 'advance' });
      }
    }
  }

  setContext(context) {
    this._context = context;
    this._actionQueue = null;
    this._keysDown.clear();
  }

  getAction() {
    const action = this._actionQueue;
    this._actionQueue = null;
    return action;
  }

  peekAction() {
    return this._actionQueue;
  }

  _isMovementKey(code) {
    const movementKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Numpad8', 'Numpad2', 'Numpad4', 'Numpad6', 'Numpad7', 'Numpad9', 'Numpad1', 'Numpad3', 'Home', 'End', 'PageUp', 'PageDown', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyY', 'KeyU', 'KeyB', 'KeyN'];
    return movementKeys.includes(code);
  }

  getHeldMovementAction() {
    if (this._context !== 'exploration' || !this.enabled) return null;
    
    let isMoving = false;
    for (const code of this._keysDown) {
      if (this._isMovementKey(code)) {
        isMoving = true;
        break;
      }
    }
    if (!isMoving) return null;

    const now = performance.now();
    const timeSinceFirstPress = now - this._firstMoveTime;
    const timeSinceLastMove = now - this._lastMoveTime;

    // Retardo inicial (250ms) antes de repetir rápido (120ms)
    if (timeSinceFirstPress > 250 && timeSinceLastMove >= this._moveRepeatRate) {
      const action = this._createMovementActionFromKeys();
      if (action) {
        this._lastMoveTime = now;
        return action;
      }
    }
    return null;
  }

  _createMovementActionFromKeys() {
    let dx = 0;
    let dy = 0;
    
    if (this._keysDown.has('ArrowUp') || this._keysDown.has('KeyW') || this._keysDown.has('Numpad8') || this._keysDown.has('KeyK')) dy -= 1;
    if (this._keysDown.has('ArrowDown') || this._keysDown.has('KeyS') || this._keysDown.has('Numpad2') || this._keysDown.has('KeyJ')) dy += 1;
    if (this._keysDown.has('ArrowLeft') || this._keysDown.has('KeyA') || this._keysDown.has('Numpad4') || this._keysDown.has('KeyH')) dx -= 1;
    if (this._keysDown.has('ArrowRight') || this._keysDown.has('KeyD') || this._keysDown.has('Numpad6') || this._keysDown.has('KeyL')) dx += 1;
    
    if (this._keysDown.has('Home') || this._keysDown.has('Numpad7') || this._keysDown.has('KeyY')) { dx = -1; dy = -1; }
    if (this._keysDown.has('PageUp') || this._keysDown.has('Numpad9') || this._keysDown.has('KeyU')) { dx = 1; dy = -1; }
    if (this._keysDown.has('End') || this._keysDown.has('Numpad1') || this._keysDown.has('KeyB')) { dx = -1; dy = 1; }
    if (this._keysDown.has('PageDown') || this._keysDown.has('Numpad3') || this._keysDown.has('KeyN')) { dx = 1; dy = 1; }
    
    if (dx !== 0 || dy !== 0) {
      return { type: ACTIONS.MOVE, dx: Math.sign(dx), dy: Math.sign(dy) };
    }
    return null;
  }

  _handleKeyDown(event) {
    if (!this.enabled) return;

    if (event.repeat) return; // Ignorar repeticiones del SO
    if (this._keysDown.has(event.code)) return; // Prevenir duplicados
    
    this._keysDown.add(event.code);

    if (this._isGameKey(event.code)) {
      event.preventDefault();
    }

    switch (this._context) {
      case 'exploration':
        if (this._isMovementKey(event.code)) {
          this._firstMoveTime = performance.now();
          this._lastMoveTime = this._firstMoveTime;
        }
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
      case 'Enter':
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

      // ── Usar movimiento (1-4): consume PP, requiere enemigo adyacente ──
      case 'Digit1':
        this._actionQueue = { type: ACTIONS.USE_MOVE, index: 0 };
        break;
      case 'Digit2':
        this._actionQueue = { type: ACTIONS.USE_MOVE, index: 1 };
        break;
      case 'Digit3':
        this._actionQueue = { type: ACTIONS.USE_MOVE, index: 2 };
        break;
      case 'Digit4':
        this._actionQueue = { type: ACTIONS.USE_MOVE, index: 3 };
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
      case 'Enter':
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
      case 'Enter':
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
    const touchRoot = document.getElementById('touch-controls');
    if (touchRoot && this._onTouch) {
      touchRoot.removeEventListener('pointerdown', this._onTouch);
    }
    this._keysDown.clear();
    this._actionQueue = null;
  }
}
