import { openPauseMenu } from './PauseMenu.js';
import { getCaptureChance } from '../../systems/CaptureSystem.js';
import { GAME_STATES, MAX_PARTY_SIZE } from '../../constants.js';

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


/** Busca un salvaje en la dirección de mirada (8 dirs) o adyacente. */
function findWildCaptureTarget(game) {
  const playerId = game.getPlayerId();
  const pPos = game.entityManager.getComponent(playerId, 'position');
  if (!pPos) return null;

  let dx = pPos.facingDx ?? 0;
  let dy = pPos.facingDy ?? 0;
  if (dx === 0 && dy === 0) {
    if (pPos.facing === 'up') dy = -1;
    else if (pPos.facing === 'down') dy = 1;
    else if (pPos.facing === 'left') dx = -1;
    else if (pPos.facing === 'right') dx = 1;
  }

  const isWild = (entId) => {
    if (!entId) return false;
    const hasFighter = game.entityManager.hasComponent(entId, 'fighter');
    const isParty = game.entityManager.hasComponent(entId, 'partyMember');
    const isMerchant = game.entityManager.hasComponent(entId, 'npcMerchant');
    const isFriendly = game.entityManager.hasComponent(entId, 'npcFriendly');
    return hasFighter && !isParty && !isMerchant && !isFriendly;
  };

  if (dx !== 0 || dy !== 0) {
    for (let dist = 1; dist <= 5; dist++) {
      const tx = pPos.x + dx * dist;
      const ty = pPos.y + dy * dist;
      if (!game.tileMap.isInBounds(tx, ty) || !game.tileMap.isWalkable(tx, ty)) break;
      const entId = game.entityManager.getEntityAt(tx, ty, false);
      if (isWild(entId)) return entId;
      if (entId) break;
    }
  }

  // Fallback: adyacentes (incluye diagonal) — tras acercarse en diagonal
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (ox === 0 && oy === 0) continue;
      const entId = game.entityManager.getEntityAt(pPos.x + ox, pPos.y + oy, false);
      if (isWild(entId)) return entId;
    }
  }
  return null;
}

/** @param {import('../UIManager.js').UIManager} ui */
const INV_TYPE_ORDER = {
  food: 0, heal: 1, heal_percent: 1, pp_restore: 2, pp_restore_full: 2,
  capture: 3, seed: 4, revive: 4, status_cure: 5, full_heal: 5,
  evolution_stone: 6, stat_boost: 7, gummi: 8, escape: 9
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
  ui.currentMenuType = 'inventory'; // evita que MENU abra la pausa por carrera
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
      capture: 'Captura — mira a un salvaje (o adyacente) y usa; Lanzar también captura',
      status_cure: 'Cura estados',
      evolution_stone: 'Evolución',
      escape: 'Guarda y vuelve al menú (mapa regenerado al continuar)',
      pp_restore: 'Restaura PP',
      pp_restore_full: 'Restaura PP',
      revive: 'Resucita debilitados',
      seed: 'Semilla especial',
      slumber_orb: 'Usar = sala entera; Lanzar = 1 objetivo',
      petrify_orb: 'Usar = sala entera; Lanzar = 1 objetivo',
      throwable: 'Lanzar para dañar a distancia'
    };
    const hint = typeHints[item.type] || '';
    descPanel.innerHTML = `${item.description || 'Sin descripción.'}${hint ? `<div style="margin-top:4px;color:var(--text-accent);">${hint}</div>` : ''}`;
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
        if (item.type === 'capture') {
          const targetId = findWildCaptureTarget(ui.game);
          
          if (targetId) {
            const tInfo = ui.game.entityManager.getComponent(targetId, 'pokemonInfo');
            const tFighter = ui.game.entityManager.getComponent(targetId, 'fighter');
            const chance = (tInfo && tFighter)
              ? getCaptureChance(tFighter, tInfo, item, ui.game.pokemonData)
              : 0;
            const partyCount = ui.game.entityManager.getEntitiesWithComponents('partyMember').length;
            const fullHint = partyCount >= MAX_PARTY_SIZE
              ? `\n\nEquipo lleno (${MAX_PARTY_SIZE}): si capturas, se liberará (+Poké).`
              : '';
            openYesNoConfirm(
              ui,
              '¿Capturar?',
              `¿Lanzar ${item.name} a ${tInfo ? tInfo.name : 'el Pokémon'}?\nProbabilidad aprox.: ${chance}%${fullHint}`,
              () => ui.game.useInventoryItem(item.id, targetId),
              () => openInventoryMenu(ui)
            );
          } else {
            ui.showDialog('No hay ningún Pokémon salvaje en esa dirección para capturar.', () => openInventoryMenu(ui));
          }
        } else if (item.type === 'escape') {
          openYesNoConfirm(
            ui,
            '¿Escapar?',
            '¿Usar Cuerda Huida?\nSaldrás al menú. Se guarda equipo, mochila y piso (el mapa se regenera al continuar).',
            () => ui.game.useInventoryItem(item.id, ui.game.getPlayerId()),
            () => openInventoryMenu(ui)
          );
        }
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
