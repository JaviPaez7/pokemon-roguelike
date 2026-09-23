/**
 * UIManager.js — Orquestador de UI HTML para PokéRogue.
 * Delega menús, diálogos y SFX a módulos especializados.
 */

import { GAME_STATES } from '../constants.js';
import { SfxManager } from '../audio/SfxManager.js';
import { MusicManager } from '../audio/MusicManager.js';
import { DialogController } from './DialogController.js';
import { openTitleScreen } from './menus/TitleMenu.js';
import { openNewAdventure } from './menus/QuizMenu.js';
import { openPauseMenu, openStairsConfirmationMenu } from './menus/PauseMenu.js';
import { openInventoryMenu } from './menus/InventoryMenus.js';
import { openTeamMenu } from './menus/TeamMenus.js';
import { handleMenuInput, updateSelectionVisuals } from './menus/MenuInput.js';
import { openStairsMenu } from './menus/StairsMenu.js';
import { openRecruitMenu } from './menus/RecruitMenu.js';
import { openLearnMoveMenu } from './menus/LearnMoveMenu.js';
import { openEvolutionMenu } from './menus/EvolutionMenu.js';
import { openMerchantMenu } from './menus/MerchantMenu.js';
import {
  openTownShop,
  openStorageMenu,
  openBankMenu,
  openBaseMenu,
  openDungeonSelect,
  openMissionBoard,
} from './menus/TownMenus.js';

export class UIManager {
  /**
   * @param {Object} game - Instancia del juego principal
   */
  constructor(game) {
    this.game = game;
    this.eventBus = game.eventBus;

    this.overlay = document.getElementById('ui-overlay');
    this.menuContainer = document.getElementById('menu-container');
    this.loadingScreen = document.getElementById('loading-screen');

    this.currentMenuType = null;
    this.selectedIndex = 0;
    this.menuOptions = [];
    this.selectedItem = null;
    this.selectedPokemon = null;

    /** @type {SfxManager} */
    this.sfx = new SfxManager();
    
    /** @type {MusicManager} */
    this.music = new MusicManager();
    try {
      const savedVol = JSON.parse(localStorage.getItem('pokerogue_volumes') || 'null');
      if (savedVol) {
        if (typeof savedVol.sfx === 'number') this.sfx.setVolume(savedVol.sfx);
        if (typeof savedVol.music === 'number') this.music.setVolume(savedVol.music);
      }
    } catch (e) {}
    this.dialog = new DialogController(this);

    if (this.loadingScreen) {
      setTimeout(() => {
        this.loadingScreen.classList.add('fade-out');
        setTimeout(() => this.loadingScreen.remove(), 500);
      }, 1000);
    }

    this.menuContainer.addEventListener('click', (event) => {
      const ctx = this.game.inputHandler._context;

      if (ctx === 'dialog') {
        this.handleDialogInput({ action: 'advance' });
        return;
      }

      if (ctx !== 'menu' && ctx !== 'game_over' && ctx !== 'victory') return;

      const optionEl = event.target.closest('.menu-option');
      if (!optionEl) return;

      const idx = parseInt(optionEl.getAttribute('data-index'), 10);
      if (isNaN(idx)) return;

      this.selectedIndex = idx;
      this.updateSelectionVisuals();
      const callback = this.menuOptions[this.selectedIndex];
      if (callback) {
        this.playConfirmSound();
        callback();
      }
    });

    this.menuContainer.addEventListener('mouseover', (event) => {
      if (!this.game.inputHandler.enabled || this.currentMenuType === 'dialog') return;
      const optionEl = event.target.closest('.menu-option');
      if (!optionEl) return;
      const idx = parseInt(optionEl.getAttribute('data-index'), 10);
      if (!isNaN(idx) && this.selectedIndex !== idx) {
        this.selectedIndex = idx;
        this.updateSelectionVisuals();
        this.playMenuSound();
      }
    });

    this._setupEventListeners();
  }

  _setupEventListeners() {
    this.eventBus.on('state_changed', (data) => {
      this.handleStateChange(data.state);
    });

    this.eventBus.on('menu_input', (data) => {
      this.handleMenuInput(data);
    });

    this.eventBus.on('dialog_input', (data) => {
      this.handleDialogInput(data);
    });

    this.eventBus.on('ui_action', (data) => {
      const state = this.game.getState();
      if (state !== GAME_STATES.EXPLORING && state !== GAME_STATES.TOWN && state !== GAME_STATES.MENU) return;

      // Cada menú pasa a MENU al abrirse: no hay que cambiar el estado antes.
      switch (data.action) {
        case 'open_inventory':
          this.openInventoryMenu();
          break;
        case 'open_team':
          this.openTeamMenu();
          break;
        case 'open_pause':
          this.openPauseMenu();
          break;
        case 'toggle_minimap':
          if (this.game.renderer && this.game.renderer.hud) {
            this.game.renderer.hud.toggleMinimap();
            this.game.needsRender = true;
          }
          break;
      }
    });

    this.eventBus.on('show_dialog', (data) => {
      this.showDialog(data.text, data.callback, data.instant);
    });

    this.eventBus.on('damage_dealt', () => {
      this.playDamageSound();
    });

    this.eventBus.on('level_up', () => {
      this.playLevelUpSound();
    });

    this.eventBus.on('capture_attempt', (data) => {
      for (let i = 0; i < data.shakes; i++) {
        setTimeout(() => this.playCaptureShakeSound(i), i * 400);
      }
      if (data.success) {
        setTimeout(() => this.playLevelUpSound(), data.shakes * 400 + 200);
      }
    });
  }

  hasOpenDialog() {
    return this.dialog.hasOpenDialog();
  }

  closeMenu() {
    // Si había un diálogo a medias, vaciar cola para no dejar input pillado
    if (this.dialog) {
      this.dialog.dialogQueue = [];
      this.dialog.currentDialogCallback = null;
      if (this.dialog.dialogTimer) {
        clearInterval(this.dialog.dialogTimer);
        this.dialog.dialogTimer = null;
      }
    }
    this.currentMenuType = null;
    this.onCancel = null;
    this.selectedIndex = 0;
    this.menuOptions = [];
    this.selectedItem = null;
    this.selectedPokemon = null;
    try { document.body.classList.remove('menu-open'); } catch (e) {}

    this.overlay.classList.remove('dialog-mode');
    this.overlay.classList.add('hidden');
    this.menuContainer.innerHTML = '';

    const state = this.game.getState();
    if (state === GAME_STATES.MENU) {
      this.game.changeState(this.game.homeState);
    } else if (state === GAME_STATES.EXPLORING || state === GAME_STATES.TOWN) {
      // Recuperar control si closeMenu cerró un diálogo sin closeDialog()
      this.game.inputHandler?.setContext?.('exploration');
    }
  }

  /**
   * Muestra un menú y le da el teclado.
   * @param {string} type - Identificador del menú (lo usa handleCancelAction)
   * @param {string} htmlContent
   * @param {{ onCancel?: () => void }} [options] - Qué hace Escape en este menú;
   *   si no se indica, lo decide handleCancelAction según `type`
   */
  showMenu(type, htmlContent, { onCancel = null } = {}) {
    this.game.inputHandler.setContext('menu');
    this.currentMenuType = type;
    this.onCancel = onCancel;
    this.overlay.classList.remove('hidden', 'dialog-mode');
    this.menuContainer.innerHTML = htmlContent;
    try { document.body.classList.add('menu-open'); } catch (e) {}
    this.updateSelectionVisuals();
  }

  /**
   * Reacción de la UI a `state_changed`. No puede llamar a `changeState`
   * (Game lo impide). Entrar en MENU no abre nada: MENU es la consecuencia de
   * abrir un menú, nunca la causa.
   * @param {string} state
   */
  handleStateChange(state) {
    switch (state) {
      case GAME_STATES.TITLE:
        this.openTitleScreen();
        break;
      case GAME_STATES.STARTER_SELECT:
        openNewAdventure(this);
        break;
      case GAME_STATES.EXPLORING:
      case GAME_STATES.TOWN:
        this.closeMenu();
        break;
      case GAME_STATES.DIALOG:
      case GAME_STATES.MENU:
        break;
    }
  }

  openTitleScreen() { openTitleScreen(this); }
  openPauseMenu() { openPauseMenu(this); }
  openStairsConfirmationMenu() { openStairsConfirmationMenu(this); }
  openInventoryMenu() { openInventoryMenu(this); }
  openTeamMenu() { openTeamMenu(this); }
  
  openStairsMenu() { openStairsMenu(this); }
  openRecruitMenu(targetId, defenderInfo) { openRecruitMenu(this, targetId, defenderInfo); }
  openLearnMoveMenu(entityId, moveId) { openLearnMoveMenu(this, entityId, moveId); }
  openEvolutionMenu(entityId, evolution, opts) { openEvolutionMenu(this, entityId, evolution, opts); }
  openMerchantMenu(merchantId) { openMerchantMenu(this, merchantId); }

  openTownShop() { openTownShop(this); }
  openStorageMenu() { openStorageMenu(this); }
  openBankMenu() { openBankMenu(this); }
  openBaseMenu() { openBaseMenu(this); }
  openDungeonSelect() { openDungeonSelect(this); }
  openMissionBoard() { openMissionBoard(this); }

  handleMenuInput(data) { handleMenuInput(this, data); }
  updateSelectionVisuals() { updateSelectionVisuals(this); }

  showDialog(text, callback = null, instant = false) {
    this.dialog.showDialog(text, callback, instant);
  }

  handleDialogInput(data) {
    this.dialog.handleDialogInput(data);
  }

  playMenuSound() { this.sfx.playMenuSound(); }
  playConfirmSound() { this.sfx.playConfirmSound(); }
  playCancelSound() { this.sfx.playCancelSound(); }
  playDamageSound() { this.sfx.playDamageSound(); }
  playLevelUpSound() { this.sfx.playLevelUpSound(); }
  playCaptureShakeSound(shakeIndex) { this.sfx.playCaptureShakeSound(shakeIndex); }
}
