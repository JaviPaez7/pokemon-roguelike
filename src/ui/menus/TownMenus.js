/**
 * TownMenus.js — Menús de los servicios del pueblo: tienda de Kecleon,
 * almacén de Kangaskhan, banco de Persian, base del equipo y la salida hacia
 * las mazmorras.
 */

import { GAME_STATES, MAX_PARTY_SIZE } from '../../constants.js';
import { floorCount, unlockedDungeons } from '../../core/Dungeons.js';
import {
  bankDeposit,
  bankWithdraw,
  transferItem,
  getMember,
  setTeam,
  rankFor,
  nextRank,
  STORAGE_STACK_MAX,
} from '../../core/Profile.js';
import { townShopStock } from '../../core/Shop.js';
import { startExpedition } from '../../core/Expedition.js';
import { enterTown, leaveExitTile, BASE_FRONT } from '../../core/TownSession.js';
import { openMerchantMenu } from './MerchantMenu.js';
import { openMissionBoardMenu } from './MissionMenus.js';

/** @typedef {import('../UIManager.js').UIManager} UIManager */

/**
 * Menú de opciones sencillo con título, texto opcional y una callback por opción.
 * @param {UIManager} ui
 * @param {{ type: string, title: string, text?: string, options: { label: string, action: () => void, hint?: string, disabled?: boolean }[], selected?: number, onCancel?: () => void, width?: number }} menu
 */
function simpleMenu(ui, { type, title, text = '', options, selected = 0, onCancel = () => ui.closeMenu(), width = 320 }) {
  const html = `
    <div class="game-panel town-panel" style="width: ${width}px;">
      <h2 class="game-panel-title">${title}</h2>
      ${text ? `<p class="town-text">${text}</p>` : ''}
      <div id="options-list" class="town-options">
        ${options
          .map(
            (o, i) => `
          <div class="menu-option${o.disabled ? ' option-disabled' : ''}" data-index="${i}">
            <span class="cursor">▶</span>
            <span class="town-option-label">${o.label}</span>
            ${o.hint ? `<span class="town-option-hint">${o.hint}</span>` : ''}
          </div>`,
          )
          .join('')}
      </div>
    </div>`;
  ui.game.changeState(GAME_STATES.MENU);
  ui.showMenu(type, html, { onCancel });
  ui.menuOptions = options.map((o) => o.action);
  ui.selectedIndex = Math.min(selected, options.length - 1);
  ui.updateSelectionVisuals();
}

/** @param {UIManager} ui @param {string} itemId */
function itemName(ui, itemId) {
  return ui.game.itemsData.find((i) => i.id === itemId)?.name ?? itemId;
}

// ─── Tienda de Kecleon ─────────────────────────────────────────────────────

/** @param {UIManager} ui */
export function openTownShop(ui) {
  const game = ui.game;
  const em = game.entityManager;
  const kecleon = em.getEntitiesWithComponents('npcTown').find((id) => em.getComponent(id, 'npcTown').role === 'shop');
  em.setComponent(kecleon, 'npcMerchant', { items: townShopStock(game.profile.day, game.itemsData) });
  openMerchantMenu(ui, kecleon);
}

// ─── Almacén de Kangaskhan ─────────────────────────────────────────────────

/** @param {UIManager} ui @param {number} [selected] */
export function openStorageMenu(ui, selected = 0) {
  const { profile, inventory, maxInventorySize } = ui.game;
  const stored = profile.storage.reduce((n, s) => n + s.quantity, 0);
  simpleMenu(ui, {
    type: 'town_storage',
    title: 'ALMACÉN DE KANGASKHAN',
    text: `«Aquí tus cosas están a salvo, aunque caigas en una mazmorra.»<br>Mochila ${inventory.length}/${maxInventorySize} · En el almacén: ${stored}`,
    selected,
    options: [
      { label: 'Guardar objetos', action: () => openDeposit(ui), disabled: inventory.length === 0 },
      { label: 'Sacar objetos', action: () => openWithdraw(ui), disabled: profile.storage.length === 0 },
      { label: 'Adiós', action: () => ui.closeMenu() },
    ],
  });
}

/** @param {UIManager} ui @param {number} [selected] */
function openDeposit(ui, selected = 0) {
  const game = ui.game;
  if (game.inventory.length === 0) return openStorageMenu(ui, 0);
  simpleMenu(ui, {
    type: 'town_storage_deposit',
    title: 'GUARDAR EN EL ALMACÉN',
    text: 'Se guarda toda la cantidad de ese objeto.',
    selected,
    onCancel: () => openStorageMenu(ui, 0),
    options: [
      ...game.inventory.map((slot, index) => ({
        label: itemName(ui, slot.itemId),
        hint: `x${slot.quantity}`,
        action: () => {
          transferItem(game.inventory, game.profile.storage, slot.itemId, slot.quantity, { stackMax: STORAGE_STACK_MAX });
          openDeposit(ui, index);
        },
      })),
      { label: 'Volver', action: () => openStorageMenu(ui, 0) },
    ],
  });
}

/** @param {UIManager} ui @param {number} [selected] */
function openWithdraw(ui, selected = 0) {
  const game = ui.game;
  const storage = game.profile.storage;
  if (storage.length === 0) return openStorageMenu(ui, 1);
  simpleMenu(ui, {
    type: 'town_storage_withdraw',
    title: 'SACAR DEL ALMACÉN',
    text: `Mochila ${game.inventory.length}/${game.maxInventorySize}`,
    selected,
    onCancel: () => openStorageMenu(ui, 1),
    options: [
      ...storage.map((slot, index) => ({
        label: itemName(ui, slot.itemId),
        hint: `x${slot.quantity}`,
        action: () => {
          const moved = transferItem(storage, game.inventory, slot.itemId, slot.quantity, { maxSlots: game.maxInventorySize });
          if (moved === 0) {
            ui.showDialog('«No te cabe en la mochila.»', () => openWithdraw(ui, index));
            return;
          }
          openWithdraw(ui, index);
        },
      })),
      { label: 'Volver', action: () => openStorageMenu(ui, 1) },
    ],
  });
}

// ─── Banco de Persian ──────────────────────────────────────────────────────

/** @param {UIManager} ui @param {number} [selected] */
export function openBankMenu(ui, selected = 0) {
  const game = ui.game;
  const profile = game.profile;
  const again = (index, op) => () => {
    game.coins = op();
    openBankMenu(ui, index);
  };
  simpleMenu(ui, {
    type: 'town_bank',
    title: 'BANCO DE PERSIAN',
    text: `«El dinero del banco no se pierde si caéis. Lo que llevéis encima, sí.»<br>Llevas ${game.coins} Poké · Ahorrado: ${profile.bank} Poké`,
    selected,
    options: [
      { label: 'Ingresar todo', action: again(0, () => bankDeposit(profile, game.coins, game.coins)), disabled: game.coins === 0 },
      { label: 'Ingresar 100', action: again(1, () => bankDeposit(profile, game.coins, 100)), disabled: game.coins === 0 },
      { label: 'Sacar todo', action: again(2, () => bankWithdraw(profile, game.coins, profile.bank)), disabled: profile.bank === 0 },
      { label: 'Sacar 100', action: again(3, () => bankWithdraw(profile, game.coins, 100)), disabled: profile.bank === 0 },
      { label: 'Adiós', action: () => ui.closeMenu() },
    ],
  });
}

// ─── Base del equipo ───────────────────────────────────────────────────────

/** @param {UIManager} ui @param {number} [selected] */
export function openBaseMenu(ui, selected = 0) {
  const game = ui.game;
  const profile = game.profile;
  const rank = rankFor(profile.rankPoints);
  const next = nextRank(profile.rankPoints);
  simpleMenu(ui, {
    type: 'town_base',
    title: `BASE DE ${profile.teamName.toUpperCase()}`,
    text:
      `Rango ${rank.name} · ${profile.rankPoints} puntos` +
      (next ? ` (faltan ${next.missing} para ${next.rank.name})` : '') +
      `<br>Día ${profile.day} · ${profile.roster.length} Pokémon en la base`,
    selected,
    options: [
      { label: 'Formar equipo', action: () => openFormation(ui, [...profile.teamUids]), disabled: profile.roster.length <= 2 },
      {
        label: 'Dormir hasta mañana',
        hint: 'nuevos encargos',
        action: () => {
          profile.day += 1;
          game.saveGameData();
          ui.showDialog(`Amanece el día ${profile.day}.\n\nEl tablón y la tienda tienen novedades.`, () => openBaseMenu(ui, 1));
        },
      },
      {
        label: 'Guardar partida',
        action: () => {
          const ok = game.saveGameData();
          ui.showDialog(ok ? 'Partida guardada.' : 'No se pudo guardar (¿almacenamiento lleno?).', () => openBaseMenu(ui, 2));
        },
      },
      { label: 'Salir', action: () => ui.closeMenu() },
    ],
  });
}

/**
 * Elegir quién va a las mazmorras. Protagonista y compañero van siempre.
 * @param {UIManager} ui
 * @param {number[]} chosen - uids elegidos, en orden
 * @param {number} [selected]
 */
function openFormation(ui, chosen, selected = 0) {
  const game = ui.game;
  const profile = game.profile;
  const fixed = [profile.heroUid, profile.partnerUid];
  const toggle = (uid, index) => () => {
    if (fixed.includes(uid)) return openFormation(ui, chosen, index);
    const next = chosen.includes(uid) ? chosen.filter((u) => u !== uid) : [...chosen, uid];
    if (next.length > MAX_PARTY_SIZE) {
      ui.showDialog(`El equipo lleva como mucho ${MAX_PARTY_SIZE} Pokémon.`, () => openFormation(ui, chosen, index));
      return;
    }
    openFormation(ui, next, index);
  };
  const confirm = () => {
    const result = setTeam(profile, chosen);
    if (!result.ok) {
      ui.showDialog(result.error, () => openFormation(ui, chosen, 0));
      return;
    }
    ui.closeMenu();
    enterTown(game, { spot: BASE_FRONT });
    game.saveGameData();
  };
  simpleMenu(ui, {
    type: 'town_formation',
    title: 'FORMAR EQUIPO',
    text: `Elegidos ${chosen.length}/${MAX_PARTY_SIZE}. El protagonista y el compañero van siempre.`,
    width: 360,
    selected,
    onCancel: () => openBaseMenu(ui, 0),
    options: [
      ...profile.roster.map((member, index) => {
        const inTeam = chosen.includes(member.uid);
        return {
          label: `${inTeam ? '✔' : '·'} ${member.name}`,
          hint: fixed.includes(member.uid) ? `Nv.${member.level} · fijo` : `Nv.${member.level}`,
          action: toggle(member.uid, index),
        };
      }),
      { label: 'Confirmar', action: confirm },
    ],
  });
}

// ─── Salida: elegir mazmorra ───────────────────────────────────────────────

/** @param {UIManager} ui */
export function openDungeonSelect(ui) {
  const game = ui.game;
  const profile = game.profile;
  const stay = () => {
    ui.closeMenu();
    leaveExitTile(game);
  };
  const dungeons = unlockedDungeons(profile.clearedDungeons);
  simpleMenu(ui, {
    type: 'town_dungeon_select',
    title: '¿A DÓNDE VAMOS?',
    width: 360,
    onCancel: stay,
    options: [
      ...dungeons.map((d) => ({
        label: `${profile.clearedDungeons.includes(d.id) ? '✔ ' : ''}${d.name}`,
        hint: `${floorCount(d)} pisos`,
        action: () => confirmDungeon(ui, d),
      })),
      { label: 'Quedarse en el pueblo', action: stay },
    ],
  });
}

/**
 * @param {UIManager} ui
 * @param {import('../../core/Dungeons.js').Dungeon} dungeon
 */
function confirmDungeon(ui, dungeon) {
  const game = ui.game;
  const team = game.profile.teamUids.map((uid) => getMember(game.profile, uid).name).join(', ');
  simpleMenu(ui, {
    type: 'town_dungeon_confirm',
    title: dungeon.name.toUpperCase(),
    text: `${dungeon.description}<br>${floorCount(dungeon)} pisos · Equipo: ${team}<br>Llevas ${game.coins} Poké y ${game.inventory.length} objetos en la mochila.`,
    width: 360,
    onCancel: () => openDungeonSelect(ui),
    options: [
      {
        label: '¡En marcha!',
        action: () => {
          ui.closeMenu();
          startExpedition(game, dungeon.id);
        },
      },
      { label: 'Mejor no', action: () => openDungeonSelect(ui) },
    ],
  });
}

// ─── Tablón de misiones ────────────────────────────────────────────────────

/** @param {UIManager} ui */
export function openMissionBoard(ui) {
  openMissionBoardMenu(ui);
}
