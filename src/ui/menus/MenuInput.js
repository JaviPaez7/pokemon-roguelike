import { GAME_STATES } from '../../constants.js';
import { STARTERS } from '../../data/starterData.js';
import { openTitleScreen } from './TitleMenu.js';
import { openInventoryMenu } from './InventoryMenus.js';
import { openTeamMenu, openPokemonActionsMenu, updateTacticDetails } from './TeamMenus.js';
import { openPauseMenu, updateMoveDetails } from './PauseMenu.js';
import { updateItemDetails } from './InventoryMenus.js';
import { updateStarterDetails } from './StarterMenu.js';
import { openMerchantMenu } from './MerchantMenu.js';

/** @param {import('../UIManager.js').UIManager} ui @param {Object} data */
export function handleMenuInput(ui, data) {
  const options = ui.menuContainer.querySelectorAll('.menu-option:not(.hidden)');
  if (options.length === 0) return;

  // Opciones: izquierda/derecha ajustan volumen / toggles (sin monkey-patch)
  if (ui.currentMenuType === 'options') {
    if (data.direction === 'left' || data.direction === 'right') {
      // 0-1 volumen, 2 autopickup, 3 minimapa
      if (ui.selectedIndex <= 3 && typeof ui.menuOptions[ui.selectedIndex] === 'function') {
        ui.menuOptions[ui.selectedIndex](data.direction);
      }
      return;
    }
    if (data.direction === 'up' || data.direction === 'down') {
      ui.selectedIndex = data.direction === 'down'
        ? (ui.selectedIndex + 1) % options.length
        : (ui.selectedIndex - 1 + options.length) % options.length;
      updateSelectionVisuals(ui);
      ui.sfx.playMenuSound();
      return;
    }
    if (data.action === 'confirm') {
      // Volumen solo con ←/→; Enter activa toggles o Volver
      if (ui.selectedIndex < 2) return;
      const callback = ui.menuOptions[ui.selectedIndex];
      if (callback) {
        ui.sfx.playConfirmSound();
        callback();
      }
      return;
    }
    if (data.action === 'cancel') {
      ui.sfx.playCancelSound();
      handleCancelAction(ui);
      return;
    }
  }

  if (data.direction === 'down' || data.direction === 'right') {
    ui.selectedIndex = (ui.selectedIndex + 1) % options.length;
    updateSelectionVisuals(ui);
    ui.sfx.playMenuSound();
  } else if (data.direction === 'up' || data.direction === 'left') {
    ui.selectedIndex = (ui.selectedIndex - 1 + options.length) % options.length;
    updateSelectionVisuals(ui);
    ui.sfx.playMenuSound();
  } else if (data.action === 'confirm') {
    const callback = ui.menuOptions[ui.selectedIndex];
    if (callback) {
      ui.sfx.playConfirmSound();
      callback();
    }
  } else if (data.action === 'cancel') {
    ui.sfx.playCancelSound();
    handleCancelAction(ui);
  }
}

/** @param {import('../UIManager.js').UIManager} ui */
export function handleCancelAction(ui) {
  switch (ui.currentMenuType) {
    case 'title':
      break;
    case 'starter':
      openTitleScreen(ui);
      break;
    case 'pause':
      ui.closeMenu();
      break;
    case 'inventory':
    case 'team':
      openPauseMenu(ui);
      break;
    case 'stats':
      if (ui.game && ui.game.getPlayerId() !== null) {
        openPauseMenu(ui);
      } else {
        openTitleScreen(ui);
      }
      break;
    case 'log_history':
      openPauseMenu(ui);
      break;
    case 'item_actions':
    case 'use_item_target':
    case 'confirm_yn':
      openInventoryMenu(ui);
      break;
    case 'moves_select':
      openPauseMenu(ui);
      break;
    case 'pokemon_actions':
    case 'moves_view':
      openTeamMenu(ui);
      break;
    case 'tactic_select':
      openPokemonActionsMenu(ui);
      break;
    case 'stairs_confirm':
    case 'stairs_menu':
      ui.closeMenu();
      ui.game.changeState(GAME_STATES.EXPLORING);
      break;
    case 'recruit_menu': {
      const recruitId = ui._recruitEntityId;
      ui.closeMenu();
      if (recruitId != null) {
        ui.game.eventBus.emit('recruit_pokemon', { entityId: recruitId, accepted: false });
        ui._recruitEntityId = null;
      }
      break;
    }
    case 'learn_move': {
      // Escape = no aprender: sacar de la cola
      const pid = ui._learnMovePokemonId;
      const pending = ui._learnMovePending;
      if (pid != null && pending) {
        const fresh = ui.game.entityManager.getComponent(pid, 'pokemonInfo');
        if (fresh?.pendingMovesToLearn) {
          const idx = fresh.pendingMovesToLearn.findIndex(pm => pm.moveId === pending.moveId);
          if (idx >= 0) fresh.pendingMovesToLearn.splice(idx, 1);
          ui.game.entityManager.setComponent(pid, 'pokemonInfo', fresh);
        }
      }
      ui._learnMovePokemonId = null;
      ui._learnMovePending = null;
      ui.closeMenu();
      break;
    }
    case 'evolution': {
      const evoId = ui._evolutionEntityId;
      if (evoId != null) {
        const info = ui.game.entityManager.getComponent(evoId, 'pokemonInfo');
        if (info) {
          info.pendingEvolution = null;
          info.evolutionDeclinedAtLevel = info.level;
          ui.game.entityManager.setComponent(evoId, 'pokemonInfo', info);
        }
        ui._evolutionEntityId = null;
      }
      ui.closeMenu();
      break;
    }
    case 'merchant_buy':
    case 'merchant_sell':
      if (ui._merchantId != null) {
        openMerchantMenu(ui, ui._merchantId);
      } else {
        ui.closeMenu();
      }
      break;
    case 'merchant_menu':
      ui.closeMenu();
      break;
    case 'options':
      openPauseMenu(ui);
      break;
    case 'game_over':
    case 'victory':
    case 'title':
    case 'starter_select':
      // No cerrar pantallas finales / título con Esc
      break;
    default:
      ui.closeMenu();
  }
}

/** @param {import('../UIManager.js').UIManager} ui */
export function updateSelectionVisuals(ui) {
  const options = ui.menuContainer.querySelectorAll('.menu-option:not(.hidden)');
  options.forEach((opt, idx) => {
    if (idx === ui.selectedIndex) {
      opt.classList.add('selected');
      const cursor = opt.querySelector('.cursor');
      if (cursor) cursor.style.opacity = '1';
    } else {
      opt.classList.remove('selected');
      const cursor = opt.querySelector('.cursor');
      if (cursor) cursor.style.opacity = '0';
    }
  });

  if (ui.currentMenuType === 'inventory') {
    const inv = ui.game.inventory || [];
    if (inv[ui.selectedIndex]) {
      updateItemDetails(ui, inv[ui.selectedIndex].itemId);
    }
  } else if (ui.currentMenuType === 'moves_select') {
    updateMoveDetails(ui);
  } else if (ui.currentMenuType === 'tactic_select') {
    updateTacticDetails(ui);
  } else if (ui.currentMenuType === 'starter') {
    updateStarterDetails(STARTERS[ui.selectedIndex]);
  }
}
