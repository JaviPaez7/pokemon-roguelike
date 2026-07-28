import { GAME_STATES } from '../../constants.js';

/**
 * Abre el menú principal de la tienda ambulante de Kecleon.
 * 
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} merchantId - ID de la entidad mercader
 */
export function openMerchantMenu(ui, merchantId) {
  const merchant = ui.game.entityManager.getComponent(merchantId, 'npcMerchant');
  if (!merchant) return;

  ui.currentMenuType = 'merchant';
  ui.game.changeState(GAME_STATES.MENU);

  const html = `
    <div class="game-panel" style="width: 320px;">
      <h2 class="game-panel-title">TIENDA KECLEON</h2>
      <div style="font-size: 8px; line-height: 1.5; color: var(--text-primary); margin-bottom: 12px; display: flex; justify-content: space-between; padding: 0 10px;">
        <span>Tus Monedas: <strong style="color: #ffd700;">${ui.game.coins || 0} Poké</strong></span>
        <span>Piso ${ui.game._currentFloor}</span>
      </div>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Comprar objetos</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Vender objetos</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> ¡Hasta luego!</div>
      </div>
    </div>
  `;

  ui.showMenu('merchant_menu', html);
  ui._merchantId = merchantId;

  ui.menuOptions = [
    () => openBuyMenu(ui, merchantId),
    () => openSellMenu(ui, merchantId),
    () => {
      ui.closeMenu();
      ui.game.changeState(GAME_STATES.EXPLORING);
    }
  ];

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/**
 * Abre el catálogo de compra del mercader.
 * 
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} merchantId
 */
function openBuyMenu(ui, merchantId) {
  const merchant = ui.game.entityManager.getComponent(merchantId, 'npcMerchant');
  const items = merchant.items || [];

  let html = `
    <div class="game-panel" style="width: 360px;">
      <h2 class="game-panel-title">COMPRAR — TIENDA KECLEON</h2>
      <div style="font-size: 7px; color: #ffd700; margin-bottom: 8px; padding-left: 10px;">Tus Monedas: <strong>${ui.game.coins || 0} Poké</strong></div>
      <div id="options-list" style="max-height: 200px; overflow-y: auto;">
  `;

  items.forEach((item, idx) => {
    html += `
      <div class="menu-option" data-index="${idx}" style="flex-direction: column; align-items: flex-start; gap: 2px;">
        <div style="display: flex; justify-content: space-between; width: 100%;">
          <span><span class="cursor">▶</span> ${item.name}</span>
          <span style="color: #ffd700; font-weight: bold;">${item.price} Poké</span>
        </div>
        <div style="font-size: 6px; color: var(--text-secondary); margin-left: 12px;">${item.description || ''}</div>
      </div>
    `;
  });

  html += `
        <div class="menu-option" data-index="${items.length}">
          <span class="cursor">▶</span> Volver atrás
        </div>
      </div>
    </div>
  `;

  ui.showMenu('merchant_buy', html);

  ui.menuOptions = items.map(item => () => {
    // Intentar comprar
    if ((ui.game.coins || 0) < item.price) {
      ui.showDialog('¡No tienes suficientes monedas Poké!', () => openBuyMenu(ui, merchantId));
      return;
    }

    // Apilar si ya tienes el objeto; solo bloquear si no hay hueco nuevo
    const existingSlot = ui.game.inventory.find(slot => slot.itemId === item.id);
    if (!existingSlot && ui.game.inventory.length >= (ui.game.maxInventorySize || 24)) {
      ui.showDialog('¡Tu mochila está llena!', () => openBuyMenu(ui, merchantId));
      return;
    }

    // Procesar la compra
    ui.game.coins -= item.price;

    if (existingSlot) {
      existingSlot.quantity++;
    } else {
      ui.game.inventory.push({ itemId: item.id, quantity: 1 });
    }

    try { ui.game.saveGameData(); } catch (e) {}
    ui.showDialog(`¡Compraste ${item.name} por ${item.price} monedas!`, () => openBuyMenu(ui, merchantId));
  });

  ui.menuOptions.push(() => openMerchantMenu(ui, merchantId));

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/**
 * Abre el catálogo de venta del jugador.
 * 
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} merchantId
 */
function openSellMenu(ui, merchantId) {
  const inventory = ui.game.inventory || [];

  let html = `
    <div class="game-panel" style="width: 360px;">
      <h2 class="game-panel-title">VENDER — TU MOCHILA</h2>
      <div style="font-size: 7px; color: #ffd700; margin-bottom: 8px; padding-left: 10px;">Tus Monedas: <strong>${ui.game.coins || 0} Poké</strong></div>
      <div id="options-list" style="max-height: 200px; overflow-y: auto;">
  `;

  const sellOptions = [];

  inventory.forEach((slot) => {
    const itemData = ui.game.itemsData.find(i => i.id === slot.itemId);
    if (!itemData) return;

    // Calcular precio de venta (50% del valor de compra teórico)
    // Mejor recompra: comida/cura básica venden bien; rarezas altas también
    const base = Math.floor(12 / Math.max(0.05, itemData.rarity || 0.2));
    const price = Math.max(8, Math.min(120, base));
    const optIndex = sellOptions.length;

    sellOptions.push({
      slot: slot,
      itemData: itemData,
      price: price
    });

    html += `
      <div class="menu-option" data-index="${optIndex}" style="flex-direction: column; align-items: flex-start; gap: 2px;">
        <div style="display: flex; justify-content: space-between; width: 100%;">
          <span><span class="cursor">▶</span> ${itemData.name} (x${slot.quantity})</span>
          <span style="color: #8ce68c;">+${price} Poké</span>
        </div>
        <div style="font-size: 6px; color: var(--text-secondary); margin-left: 12px;">${itemData.description || ''}</div>
      </div>
    `;
  });

  html += `
        <div class="menu-option" data-index="${sellOptions.length}">
          <span class="cursor">▶</span> Volver atrás
        </div>
      </div>
    </div>
  `;

  ui.showMenu('merchant_sell', html);

  ui.menuOptions = sellOptions.map(opt => () => {
    // Vender objeto
    ui.game.coins = (ui.game.coins || 0) + opt.price;
    
    opt.slot.quantity--;
    if (opt.slot.quantity <= 0) {
      const index = ui.game.inventory.indexOf(opt.slot);
      if (index > -1) {
        ui.game.inventory.splice(index, 1);
      }
    }

    try { ui.game.saveGameData(); } catch (e) {}
    ui.showDialog(`¡Vendiste 1 ${opt.itemData.name} por ${opt.price} monedas!`, () => openSellMenu(ui, merchantId));
  });

  ui.menuOptions.push(() => openMerchantMenu(ui, merchantId));

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
