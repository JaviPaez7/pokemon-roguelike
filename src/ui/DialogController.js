import { GAME_STATES } from '../constants.js';
import { portraitUrl } from '../render/PmdSprites.js';

/**
 * @typedef {Object} DialogOptions
 * @property {string} [speaker] - Quién habla (se muestra encima del texto)
 * @property {{ speciesId: number, emotion?: string }} [portrait] - Retrato de PMDCollab a la izquierda
 * @property {'black'} [backdrop] - Fondo negro en vez del juego (la voz del prólogo)
 */

/** Diálogos RPG con cola y animación letra a letra. */
export class DialogController {
  /**
   * @param {import('./UIManager.js').UIManager} ui
   */
  constructor(ui) {
    this.ui = ui;
    this.dialogQueue = [];
    this.currentDialogCallback = null;
    this.dialogTimer = null;
    this.dialogTextRaw = '';
  }

  hasOpenDialog() {
    return this.ui.currentMenuType === 'dialog';
  }

  /**
   * @param {string} text
   * @param {Function | null} [callback]
   * @param {boolean} [instant]
   * @param {DialogOptions} [options]
   */
  showDialog(text, callback = null, instant = false, options = {}) {
    this.dialogQueue.push({ text, callback, instant, options });
    if (this.dialogQueue.length === 1) {
      this.displayNextDialog();
    }
  }

  displayNextDialog() {
    const { ui } = this;

    if (this.dialogQueue.length === 0) {
      this.closeDialog();
      return;
    }

    const { text, callback, instant, options = {} } = this.dialogQueue[0];
    this.currentDialogCallback = callback;

    ui.game.inputHandler.setContext('dialog');
    ui.overlay.classList.remove('hidden');
    ui.overlay.classList.add('dialog-mode');
    ui.overlay.classList.toggle('story-black', options.backdrop === 'black');

    const portrait = options.portrait ? portraitUrl(options.portrait.speciesId, options.portrait.emotion) : null;
    const html = `
      <div class="game-panel dialog-panel" style="display: flex; flex-direction: column; justify-content: space-between; border-color: var(--border-glow); padding: 12px; z-index: 20;">
        <div style="display: flex; gap: 12px; align-items: flex-start;">
          ${portrait ? `<img class="dialog-portrait" src="${portrait}" alt="${options.speaker ?? ''}" style="width: 80px; height: 80px; flex: none; image-rendering: pixelated; border: 2px solid var(--border-glow); border-radius: 4px; background: rgba(0, 0, 0, 0.35);">` : ''}
          <div style="flex: 1; min-width: 0;">
            ${options.speaker ? `<div class="dialog-speaker" style="font-size: 8px; color: var(--text-accent); margin-bottom: 6px;">${options.speaker}</div>` : ''}
            <div id="dialog-text" style="font-size: 8px; line-height: 1.8; white-space: pre-wrap; color: var(--text-primary);"></div>
          </div>
        </div>
        <div style="text-align: right; font-size: 6px; color: var(--text-accent); animation: loadingDots 1s infinite alternate; margin-top: 8px;">PULSA Z PARA CONTINUAR ▶</div>
      </div>
    `;

    ui.menuContainer.innerHTML = html;
    ui.currentMenuType = 'dialog';

    if (instant) {
      const el = document.getElementById('dialog-text');
      if (el) el.textContent = text;
      this.dialogTextRaw = text;
    } else {
      this.animateText(text);
    }
  }

  animateText(text) {
    const el = document.getElementById('dialog-text');
    if (!el) return;

    let idx = 0;
    el.innerHTML = '';

    const timer = setInterval(() => {
      if (idx < text.length) {
        el.innerHTML += text[idx];
        idx++;
        if (idx % 2 === 0) this.ui.sfx.playMenuSound();
      } else {
        clearInterval(timer);
        // Texto completo: la siguiente pulsación ya avanza el diálogo
        if (this.dialogTimer === timer) this.dialogTimer = null;
      }
    }, 20);

    this.dialogTimer = timer;
    this.dialogTextRaw = text;
  }

  skipTextAnimation() {
    if (this.dialogTimer) {
      clearInterval(this.dialogTimer);
      this.dialogTimer = null;
      const el = document.getElementById('dialog-text');
      if (el) el.innerHTML = this.dialogTextRaw;
    }
  }

  handleDialogInput(data) {
    if (data.action === 'advance' || data.action === 'skip') {
      if (this.dialogTimer) {
        this.skipTextAnimation();
        this.ui.sfx.playMenuSound();
      } else {
        this.ui.sfx.playConfirmSound();
        this.dialogQueue.shift();

        const cb = this.currentDialogCallback;
        this.currentDialogCallback = null;
        
        this.displayNextDialog();

        if (cb) {
          cb();
        }
      }
    }
  }

  closeDialog() {
    const { ui } = this;
    ui.currentMenuType = null;
    this.currentDialogCallback = null;
    ui.overlay.classList.remove('dialog-mode', 'story-black');
    ui.overlay.classList.add('hidden');
    ui.menuContainer.innerHTML = '';

    const state = ui.game.getState();
    if (state === GAME_STATES.EXPLORING || state === GAME_STATES.TOWN) {
      ui.game.inputHandler.setContext('exploration');
    } else if (state === GAME_STATES.MENU || state === GAME_STATES.TITLE
        || state === GAME_STATES.STARTER_SELECT || state === GAME_STATES.GAME_OVER
        || state === GAME_STATES.VICTORY) {
      ui.game.inputHandler.setContext('menu');
    }
  }
}
