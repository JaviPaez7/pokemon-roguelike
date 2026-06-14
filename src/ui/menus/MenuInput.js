import { STARTERS } from '../../data/starterData.js';
import { openTitleScreen } from './TitleMenu.js';
import { openInventoryMenu } from './InventoryMenus.js';
import { openTeamMenu, openPokemonActionsMenu, updateTacticDetails } from './TeamMenus.js';
import { openPauseMenu, updateMoveDetails } from './PauseMenu.js';
import { updateItemDetails } from './InventoryMenus.js';
import { updateStarterDetails } from './StarterMenu.js';

/** @param {import('../UIManager.js').UIManager} ui @param {Object} data */
export function handleMenuInput(ui, data) {
  const options = ui.menuContainer.querySelectorAll('.menu-option');
  if (options.length === 0) return;

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
      ui.closeMenu();
      break;
    default:
      ui.closeMenu();
  }
}

/** @param {import('../UIManager.js').UIManager} ui */
export function updateSelectionVisuals(ui) {
  const options = ui.menuContainer.querySelectorAll('.menu-option');
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
  }
}
