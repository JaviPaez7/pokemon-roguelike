import { openPauseMenu } from './PauseMenu.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openInventoryMenu(ui) {
  const inv = ui.game.inventory || [];
  const maxInv = 20;

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
      const iconText = item ? item.sprite || '📦' : '📦';
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
    descPanel.innerHTML = item ? item.description : 'Sin descripción.';
  }
}

/** @param {import('../UIManager.js').UIManager} ui */
export function openItemActionsMenu(ui) {
  const item = ui.game.itemsData.find(i => i.id === ui.selectedItem);
  const name = item ? item.name : ui.selectedItem;

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
      if (item.type === 'capture' || item.type === 'escape') {
        ui.closeMenu();
        const enemyEntities = ui.game.entityManager.getEntitiesWithComponents('aiControlled');
        if (item.type === 'capture') {
          const playerId = ui.game.getPlayerId();
          const pPos = ui.game.entityManager.getComponent(playerId, 'position');
          let targetId = null;
          
          if (pPos) {
            targetId = enemyEntities.find(id => {
              const pos = ui.game.entityManager.getComponent(id, 'position');
              if (!pos) return false;
              const dx = Math.abs(pos.x - pPos.x);
              const dy = Math.abs(pos.y - pPos.y);
              return dx <= 4 && dy <= 4 && ui.game.tileMap.getVisibility(pos.x, pos.y) > 0;
            });
          }
          
          if (targetId) {
            ui.game.useInventoryItem(item.id, targetId);
          } else {
            ui.showDialog('No hay ningún Pokémon salvaje cerca para capturar.', () => openInventoryMenu(ui));
          }
        } else if (item.type === 'escape') {
          ui.game.useInventoryItem(item.id, ui.game.getPlayerId());
        }
      } else {
        openItemTargetMenu(ui);
      }
    },
    () => {
      ui.closeMenu();
      ui.game.throwInventoryItem(item.id);
    },
    () => {
      const slotIdx = ui.game.inventory.findIndex(s => s.itemId === ui.selectedItem);
      if (slotIdx > -1) {
        ui.game.inventory.splice(slotIdx, 1);
      }
      ui.showDialog('Objeto descartado.', () => openInventoryMenu(ui));
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

  let html = `
    <div class="game-panel" style="width: 320px;">
      <h2 class="game-panel-title">¿USAR ${item.name.toUpperCase()} EN?</h2>
      <div id="options-list">
  `;

  party.forEach((poke, idx) => {
    html += `
      <div class="menu-option" data-index="${idx}">
        <span class="cursor">▶</span>
        <span style="flex-grow: 1;">${poke.name}</span>
        <span style="color: var(--text-secondary);">PS: ${poke.hp}/${poke.maxHp}</span>
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
