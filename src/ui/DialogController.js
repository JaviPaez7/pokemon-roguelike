import { GAME_STATES } from '../constants.js';

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

  showDialog(text, callback = null, instant = false) {
    this.dialogQueue.push({ text, callback, instant });
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

    const { text, callback, instant } = this.dialogQueue[0];
    this.currentDialogCallback = callback;

    ui.game.inputHandler.setContext('dialog');
    ui.overlay.classList.remove('hidden');
    ui.overlay.classList.add('dialog-mode');

    const html = `
      <div class="game-panel dialog-panel" style="display: flex; flex-direction: column; justify-content: space-between; border-color: var(--border-glow); padding: 12px; z-index: 20;">
        <div id="dialog-text" style="font-size: 8px; line-height: 1.8; white-space: pre-wrap; color: var(--text-primary);"></div>
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

        if (this.currentDialogCallback) {
          const cb = this.currentDialogCallback;
          this.currentDialogCallback = null;
          cb();
        }

        this.displayNextDialog();
      }
    }
  }

  closeDialog() {
    const { ui } = this;
    ui.currentMenuType = null;
    this.currentDialogCallback = null;
    ui.overlay.classList.remove('dialog-mode');
    ui.overlay.classList.add('hidden');
    ui.menuContainer.innerHTML = '';

    const state = ui.game.getState();
    if (state === GAME_STATES.EXPLORING) {
      ui.game.inputHandler.setContext('exploration');
    } else if (state === GAME_STATES.MENU) {
      ui.game.inputHandler.setContext('menu');
    }
  }
}
