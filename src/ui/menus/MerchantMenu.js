import { GAME_STATES } from '../../constants.js';
import { SHOP_TIERS, buyBagUpgrade, isTradeable, sellPrice, townShopStock } from '../../core/Shop.js';

/**
 * Abre el menú principal de una tienda de Kecleon: la ambulante de las
 * mazmorras o la del pueblo (TownMenus.openTownShop), con el catálogo que
 * lleve su componente `npcMerchant` (`items` y, si quiere, una nota).
 *
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} merchantId - ID de la entidad mercader
 */
export function openMerchantMenu(ui, merchantId) {
  const merchant = ui.game.entityManager.getComponent(merchantId, 'npcMerchant');
  if (!merchant) return;

  ui.game.changeState(GAME_STATES.MENU);

  const html = `
    <div class="game-panel" style="width: 320px;">
      <h2 class="game-panel-title">TIENDA KECLEON</h2>
      <div style="font-size: 8px; line-height: 1.5; color: var(--text-primary); margin-bottom: 12px; display: flex; justify-content: space-between; padding: 0 10px;">
        <span>Tus Monedas: <strong style="color: #ffd700;">${ui.game.coins || 0} Poké</strong></span>
        <span>${ui.game.dungeon ? `Piso ${ui.game.getCurrentFloor()}` : 'Pueblo'}</span>
      </div>
      ${merchant.note ? `<div class="merchant-note" style="font-size: 7px; line-height: 1.5; color: var(--text-secondary); margin: -6px 0 10px; padding: 0 10px;">${merchant.note}</div>` : ''}
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
      ui.game.changeState(ui.game.homeState);
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
  // Los objetos únicos de la historia no se venden (ni aunque un catálogo guardado los tuviera)
  const items = (merchant.items || []).filter((item) => item.upgrade || isTradeable({ id: item.id }));

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
          <span><span class="cursor">▶</span> ${item.name}${tierTag(item)}</span>
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
    if (item.upgrade === 'bag') {
      buyBag(ui, merchantId, item);
      return;
    }
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
    // Los objetos únicos de la historia no se venden
    if (!isTradeable(itemData)) return;

    // Una parte de `price` o, si no lo tiene, según la rareza (core/Shop.js)
    const price = sellPrice(itemData);
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

/**
 * Etiqueta del surtido de rango del que sale una línea del catálogo.
 * @param {import('../../core/Shop.js').ShopEntry} item
 * @returns {string} HTML, o '' si no sale de ninguno
 */
function tierTag(item) {
  const tier = item.tier && SHOP_TIERS.find((t) => t.id === item.tier);
  if (!tier) return '';
  return ` <span class="shop-tier-tag" style="font-size: 6px; color: #9fd3ff;">${tier.name.replace('Surtido ', '')}</span>`;
}

/**
 * Compra la siguiente mochila más grande (solo la vende el Kecleon del
 * pueblo): se apunta en el perfil y el catálogo se pone al día.
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} merchantId
 * @param {import('../../core/Shop.js').ShopEntry} item
 */
function buyBag(ui, merchantId, item) {
  const game = ui.game;
  const result = buyBagUpgrade(game.profile, game.coins || 0);
  if (!result.ok) {
    ui.showDialog(result.error, () => openBuyMenu(ui, merchantId));
    return;
  }
  game.coins = result.wallet;
  const merchant = game.entityManager.getComponent(merchantId, 'npcMerchant');
  game.entityManager.setComponent(merchantId, 'npcMerchant', {
    ...merchant,
    items: townShopStock(game.profile.day, game.itemsData, game.profile),
  });
  try { game.saveGameData(); } catch (e) {}
  ui.showDialog(
    `¡Compraste una mochila más grande por ${item.price} monedas!\n\nAhora caben ${result.capacity} objetos distintos.`,
    () => openBuyMenu(ui, merchantId),
  );
}
