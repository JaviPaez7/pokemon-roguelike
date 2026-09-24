import { openPauseMenu } from './PauseMenu.js';
import { GAME_STATES } from '../../constants.js';
import { heldName } from '../../core/HeldItems.js';

/** Confirmación Sí/No (no usa diálogo, para poder cancelar). */
function openYesNoConfirm(ui, title, body, onYes, onNo) {
  const html = `
    <div class="game-panel" style="width: 300px; margin: auto;">
      <h2 class="game-panel-title">${title}</h2>
      <p style="font-size: 7px; color: var(--text-secondary); margin: 0 10px 12px; line-height: 1.5; text-align: center; white-space: pre-wrap;">${body}</p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Sí</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> No</div>
      </div>
    </div>
  `;
  ui.showMenu('confirm_yn', html);
  ui.menuOptions = [
    () => { ui.closeMenu(); onYes(); },
    () => { ui.closeMenu(); if (onNo) onNo(); else openInventoryMenu(ui); }
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
  ui.game.changeState(GAME_STATES.MENU);
}


const INV_TYPE_ORDER = {
  food: 0, heal: 1, heal_percent: 1, pp_restore: 2, pp_restore_full: 2,
  seed: 4, revive: 4, status_cure: 5, full_heal: 5,
  evolution_stone: 6, stat_boost: 7, gummi: 8, escape: 9, held: 10
};

function sortInventory(ui) {
  const inv = ui.game.inventory || [];
  inv.sort((a, b) => {
    const da = ui.game.itemsData.find(i => i.id === a.itemId);
    const db = ui.game.itemsData.find(i => i.id === b.itemId);
    const oa = INV_TYPE_ORDER[da?.type] ?? 50;
    const ob = INV_TYPE_ORDER[db?.type] ?? 50;
    if (oa !== ob) return oa - ob;
    return (da?.name || a.itemId).localeCompare(db?.name || b.itemId, 'es');
  });
}

export function openInventoryMenu(ui) {
  ui.game.changeState(GAME_STATES.MENU);
  sortInventory(ui);
  const inv = ui.game.inventory || [];
  const maxInv = ui.game.maxInventorySize || 24;

  let html = `
    <div class="game-panel" style="width: 380px;">
      <h2 class="game-panel-title">MOCHILA (${inv.length}/${maxInv})</h2>
      <div id="options-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 12px;">
  `;

  if (inv.length === 0) {
    html += `<div style="text-align: center; color: var(--text-secondary); font-size: 8px; padding: 20px;">Tu mochila está vacía.</div>`;
  } else {
    inv.forEach((slot, idx) => {
      const item = ui.game.itemsData.find(i => i.id === slot.itemId);
      const name = item ? item.name : slot.itemId;
      const iconText = item ? (item.sprite || '·') : '·';
      const iconHtml = (item && item.spriteUrl) 
        ? `<img src="${item.spriteUrl}" style="width: 16px; height: 16px; vertical-align: middle; image-rendering: pixelated;" alt="${name}"/>` 
        : iconText;
      html += `
        <div class="menu-option" data-index="${idx}">
          <span class="cursor">▶</span>
          <span style="margin-right: 8px;">${iconHtml}</span>
          <span style="flex-grow: 1;">${name}</span>
          <span style="color: var(--text-accent);">x${slot.quantity}</span>
        </div>
      `;
    });
  }

  html += `
      </div>
      <div id="item-desc-panel" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); padding: 8px; font-size: 7px; min-height: 48px; line-height: 1.5; color: var(--text-secondary);">
        Elige un objeto para ver su descripción.
      </div>
    </div>
  `;

  ui.showMenu('inventory', html);

  if (inv.length === 0) {
    ui.menuOptions = [() => openPauseMenu(ui)];
    ui.selectedIndex = 0;
    const opt = document.createElement('div');
    opt.className = 'menu-option selected';
    opt.innerHTML = '<span class="cursor">▶</span> Volver al menú';
    opt.onclick = () => openPauseMenu(ui);
    document.getElementById('options-list').appendChild(opt);
  } else {
    ui.menuOptions = inv.map(slot => () => {
      ui.selectedItem = slot.itemId;
      openItemActionsMenu(ui);
    });
    ui.selectedIndex = 0;
    updateItemDetails(ui, inv[0].itemId);
  }
}

/** @param {import('../UIManager.js').UIManager} ui @param {string} itemId */
export function updateItemDetails(ui, itemId) {
  const descPanel = document.getElementById('item-desc-panel');
  if (descPanel) {
    const item = ui.game.itemsData.find(i => i.id === itemId);
    if (!item) {
      descPanel.innerHTML = 'Sin descripción.';
      return;
    }
    const typeHints = {
      food: 'Comida (restaura Tripa)',
      heal: 'Curación',
      heal_percent: 'Curación',
      status_cure: 'Cura estados',
      evolution_stone: 'Evolución',
      escape: 'Sales de la mazmorra y vuelves al pueblo con todo lo que llevas',
      pp_restore: 'Restaura PP',
      pp_restore_full: 'Restaura PP',
      revive: 'Resucita debilitados',
      seed: 'Semilla especial',
      slumber_orb: 'Usar = sala entera; Lanzar = 1 objetivo',
      petrify_orb: 'Usar = sala entera; Lanzar = 1 objetivo',
      throwable: 'Lanzar para dañar a distancia',
      held: 'Equipable: dáselo a un Pokémon del equipo (Usar / Equipar)'
    };
    const hint = typeHints[item.type] || '';
    descPanel.innerHTML = `${item.description || 'Sin descripción.'}${hint ? `<div style="margin-top:4px;color:var(--text-accent);">${hint}</div>` : ''}`;
  }
}

/** @param {import('../UIManager.js').UIManager} ui */
export function openItemActionsMenu(ui) {
  const item = ui.game.itemsData.find(i => i.id === ui.selectedItem);
  const name = item ? item.name : ui.selectedItem;

  if (ui.game.tileMap?.isTown) {
    openTownItemActionsMenu(ui, name);
    return;
  }

  const html = `
    <div class="game-panel" style="width: 280px;">
      <h2 class="game-panel-title">${name}</h2>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Usar objeto</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Lanzar objeto</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> Tirar objeto</div>
        <div class="menu-option" data-index="3"><span class="cursor">▶</span> Atrás</div>
      </div>
    </div>
  `;

  ui.showMenu('item_actions', html);

  ui.menuOptions = [
    () => {
      if (item.type === 'escape') {
        ui.closeMenu();
        openYesNoConfirm(
          ui,
          '¿Escapar?',
          '¿Usar Cuerda Huida?\nSalís de la mazmorra y volvéis al pueblo con todo lo que lleváis.',
          () => ui.game.useInventoryItem(item.id, ui.game.getPlayerId()),
          () => openInventoryMenu(ui)
        );
      } else if (item.type === 'slumber_orb' || item.type === 'petrify_orb'
          || item.id === 'slumber_orb' || item.id === 'petrify_orb') {
        // Efecto de sala: se usa desde el líder, sin elegir aliado
        ui.closeMenu();
        ui.game.useInventoryItem(item.id, ui.game.getPlayerId());
      } else {
        openItemTargetMenu(ui);
      }
    },
    () => {
      openYesNoConfirm(
        ui,
        '¿Lanzar?',
        `¿Lanzar ${name} en la dirección que miras?`,
        () => {
          ui.closeMenu();
          ui.game.throwInventoryItem(item.id);
        },
        () => openItemActionsMenu(ui)
      );
    },
    () => {
      openYesNoConfirm(
        ui,
        '¿Descartar?',
        `¿Descartar ${name}? No podrás recuperarlo.`,
        () => {
          const slotIdx = ui.game.inventory.findIndex(s => s.itemId === ui.selectedItem);
          if (slotIdx > -1) {
            ui.game.inventory.splice(slotIdx, 1);
          }
          ui.showDialog('Objeto descartado.', () => openInventoryMenu(ui));
        },
        () => openItemActionsMenu(ui)
      );
    },
    () => openInventoryMenu(ui)
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/**
 * En el pueblo los objetos no se usan: solo se pueden tirar.
 * @param {import('../UIManager.js').UIManager} ui
 * @param {string} name
 */
function openTownItemActionsMenu(ui, name) {
  const held = ui.game.itemsData.find(i => i.id === ui.selectedItem)?.type === 'held';
  const html = `
    <div class="game-panel" style="width: 280px;">
      <h2 class="game-panel-title">${name}</h2>
      <p class="town-text">${held
        ? 'Dáselo a un Pokémon del equipo para que lo lleve puesto.'
        : 'En el pueblo los objetos no se usan. Guárdalos en el almacén de Kangaskhan o llévalos a la mazmorra.'}</p>
      <div id="options-list">
        ${held ? '<div class="menu-option" data-index="0"><span class="cursor">▶</span> Equipar</div>' : ''}
        <div class="menu-option" data-index="${held ? 1 : 0}"><span class="cursor">▶</span> Tirar objeto</div>
        <div class="menu-option" data-index="${held ? 2 : 1}"><span class="cursor">▶</span> Atrás</div>
      </div>
    </div>
  `;
  ui.showMenu('item_actions', html);
  ui.menuOptions = [
    ...(held ? [() => openItemTargetMenu(ui)] : []),
    () => {
      openYesNoConfirm(
        ui,
        '¿Descartar?',
        `¿Descartar ${name}? No podrás recuperarlo.`,
        () => {
          const slotIdx = ui.game.inventory.findIndex(s => s.itemId === ui.selectedItem);
          if (slotIdx > -1) ui.game.inventory.splice(slotIdx, 1);
          ui.showDialog('Objeto descartado.', () => openInventoryMenu(ui));
        },
        () => openItemActionsMenu(ui)
      );
    },
    () => openInventoryMenu(ui)
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {import('../UIManager.js').UIManager} ui */
export function openItemTargetMenu(ui) {
  const party = ui.game.party;
  const item = ui.game.itemsData.find(i => i.id === ui.selectedItem);
  const held = item.type === 'held';

  let html = `
    <div class="game-panel" style="width: 320px;">
      <h2 class="game-panel-title">${held ? `¿QUIÉN LLEVA ${item.name.toUpperCase()}?` : `¿USAR ${item.name.toUpperCase()} EN?`}</h2>
      <div id="options-list">
  `;

  party.forEach((poke, idx) => {
    html += `
      <div class="menu-option" data-index="${idx}">
        <span class="cursor">▶</span>
        <span style="flex-grow: 1;">${poke.name}</span>
        <span style="color: var(--text-secondary);">${held ? (poke.heldItem ? heldName(poke.heldItem) : 'Nada') : `PS: ${poke.hp}/${poke.maxHp}`}</span>
      </div>
    `;
  });

  html += `
        <div class="menu-option" data-index="${party.length}">
          <span class="cursor">▶</span> Volver atrás
        </div>
      </div>
    </div>
  `;

  ui.showMenu('use_item_target', html);

  ui.menuOptions = party.map(poke => () => {
    ui.closeMenu();
    ui.game.useInventoryItem(item.id, poke.id);
  });

  ui.menuOptions.push(() => openItemActionsMenu(ui));
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
