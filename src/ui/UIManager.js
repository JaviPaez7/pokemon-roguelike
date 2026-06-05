/**
 * UIManager.js — Orquestador de UI HTML para PokéRogue.
 * Delega menús, diálogos y SFX a módulos especializados.
 */

import { GAME_STATES } from '../constants.js';
import { SfxManager } from './SfxManager.js';
import { MusicManager } from './MusicManager.js';
import { DialogController } from './DialogController.js';
import { openTitleScreen } from './menus/TitleMenu.js';
import { openStarterSelectScreen } from './menus/StarterMenu.js';
import { openPauseMenu } from './menus/PauseMenu.js';
import { openInventoryMenu } from './menus/InventoryMenus.js';
import { openTeamMenu } from './menus/TeamMenus.js';
import { openGameOverScreen, openVictoryScreen } from './menus/EndScreens.js';
import { handleMenuInput, updateSelectionVisuals } from './menus/MenuInput.js';
import { openStairsMenu } from './menus/StairsMenu.js';
import { openRecruitMenu } from './menus/RecruitMenu.js';
import { openLearnMoveMenu } from './menus/LearnMoveMenu.js';

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
      if (this.game.getState() !== GAME_STATES.EXPLORING && this.game.getState() !== GAME_STATES.MENU) return;

      switch (data.action) {
        case 'open_inventory':
          this.game.changeState(GAME_STATES.MENU);
          this.openInventoryMenu();
          break;
        case 'open_team':
          this.game.changeState(GAME_STATES.MENU);
          this.openTeamMenu();
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
    this.currentMenuType = null;
    this.selectedIndex = 0;
    this.menuOptions = [];
    this.selectedItem = null;
    this.selectedPokemon = null;

    this.overlay.classList.remove('dialog-mode');
    this.overlay.classList.add('hidden');
    this.menuContainer.innerHTML = '';

    if (this.game.getState() === GAME_STATES.MENU) {
      this.game.changeState(GAME_STATES.EXPLORING);
    }
  }

  showMenu(type, htmlContent) {
    this.currentMenuType = type;
    this.overlay.classList.remove('hidden', 'dialog-mode');
    this.menuContainer.innerHTML = htmlContent;
    this.updateSelectionVisuals();
  }

  handleStateChange(state) {
    switch (state) {
      case GAME_STATES.TITLE:
        this.openTitleScreen();
        break;
      case GAME_STATES.STARTER_SELECT:
        this.openStarterSelectScreen();
        break;
      case GAME_STATES.EXPLORING:
        this.closeMenu();
        break;
      case GAME_STATES.DIALOG:
        break;
      case GAME_STATES.MENU:
        if (this.currentMenuType === null) {
          this.openPauseMenu();
        }
        break;
      case GAME_STATES.GAME_OVER:
        this.openGameOverScreen();
        break;
      case GAME_STATES.VICTORY:
        this.openVictoryScreen();
        break;
    }
  }

  openTitleScreen() { openTitleScreen(this); }
  openStarterSelectScreen() { openStarterSelectScreen(this); }
  openPauseMenu() { openPauseMenu(this); }
  openInventoryMenu() { openInventoryMenu(this); }
  openTeamMenu() { openTeamMenu(this); }
  openGameOverScreen() { openGameOverScreen(this); }
  openVictoryScreen() { openVictoryScreen(this); }
  
  openStairsMenu() { openStairsMenu(this); }
  openRecruitMenu(targetId, defenderInfo) { openRecruitMenu(this, targetId, defenderInfo); }
  openLearnMoveMenu(entityId, moveId) { openLearnMoveMenu(this, entityId, moveId); }

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
