import { GAME_STATES, TYPE_NAMES_ES } from '../../constants.js';
import { openInventoryMenu } from './InventoryMenus.js';
import { openTeamMenu } from './TeamMenus.js';
import { openOptionsMenu } from './OptionsMenu.js';
import { openStatsMenu } from './StatsMenu.js';
import { openLogMenu } from './LogMenu.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openPauseMenu(ui) {
  ui.game.changeState(GAME_STATES.MENU);
  const floor = ui.game.getCurrentFloor?.() || ui.game._currentFloor || 1;
  const coins = ui.game.coins || 0;
  const seen = ui.game.pokedexSeen ? ui.game.pokedexSeen.size : 0;
  const w = ui.game.currentWeather;
  const wLabel = ({ lluvia: 'Lluvia', sol: 'Sol', tormenta_arena: 'Arena', granizo: 'Granizo' })[w] || '';
  const party = ui.game.party || [];
  const living = party.filter(p => p.hp > 0).length;
  const partyLine = party.length ? `Equipo ${living}/${party.length} vivos` : '';

  const html = `
    <div class="game-panel" style="width: 280px;">
      <h2 class="game-panel-title">PAUSA</h2>
      <div style="font-size: 7px; color: var(--text-secondary); margin-bottom: 10px; display: flex; justify-content: space-between; padding: 0 4px;">
        <span>Piso ${floor}</span>
        <span style="color:#ffd700;">${coins} Poké</span>
        <span>Pokédex ${seen}</span>
      </div>
      ${wLabel ? `<div style="font-size: 6px; color:#6ab0ff; text-align:center; margin:-6px 0 8px;">Clima: ${wLabel}</div>` : ''}
      <div style="font-size: 6px; color:#aaaacc; text-align:center; margin:-4px 0 8px;">Bolsa ${(ui.game.inventory||[]).length}/${ui.game.maxInventorySize||24}${partyLine ? ' · '+partyLine : ''}${(ui.game.entityManager?.getEntitiesWithComponents?.('itemDrop')||[]).length ? ' · suelo '+(ui.game.entityManager.getEntitiesWithComponents('itemDrop').length) : ''}</div>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Continuar</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Mochila</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> Equipo Pokémon</div>
        <div class="menu-option" data-index="3"><span class="cursor">▶</span> Movimientos</div>
        <div class="menu-option" data-index="4"><span class="cursor">▶</span> Historial de Mensajes</div>
        <div class="menu-option" data-index="5"><span class="cursor">▶</span> Estadísticas</div>
        <div class="menu-option" data-index="6"><span class="cursor">▶</span> Opciones</div>
        <div class="menu-option" data-index="7"><span class="cursor">▶</span> Guardar partida</div>
        <div class="menu-option" data-index="8"><span class="cursor">▶</span> Guardar y salir</div>
      </div>
    </div>
  `;

  ui.showMenu('pause', html);

  ui.menuOptions = [
    () => ui.closeMenu(),
    () => openInventoryMenu(ui),
    () => openTeamMenu(ui),
    () => openMovesMenu(ui),
    () => openLogMenu(ui),
    () => openStatsMenu(ui, 'pause'),
    () => openOptionsMenu(ui),
    () => {
      const ok = ui.game.saveGameData();
      if (!ok) {
        ui.showDialog('No se pudo guardar (¿almacenamiento lleno?).', () => openPauseMenu(ui));
        return;
      }
      const nObj = (ui.game.entityManager?.getEntitiesWithComponents?.('itemDrop') || []).length;
      const nTrap = (ui.game.entityManager?.getEntitiesWithComponents?.('trap') || []).length;
      const nMerch = (ui.game.entityManager?.getEntitiesWithComponents?.('npcMerchant') || []).length;
      ui.showDialog(
        `Partida guardada.\n\nEquipo, mochila, piso, Pokédex.\nObjetos en el suelo: ${nObj}. Trampas: ${nTrap}.${nMerch ? ` Kecleon: ${nMerch}.` : ''}\nTambién: Kecleon, clima, carga/Venganza y Anulación.\nAl cargar, el mapa se regenera.`,
        () => openPauseMenu(ui)
      );
    },
    () => {
      const ok = ui.game.saveGameData();
      if (!ok) {
        ui.showDialog('No se pudo guardar (¿almacenamiento lleno?).', () => openPauseMenu(ui));
        return;
      }
      ui.showDialog('Partida guardada. Volviendo al menú...', () => {
        setTimeout(() => ui.game.changeState(GAME_STATES.TITLE), 0);
      });
    }
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/**
 * Abre la pantalla de selección de ataques del líder.
 * @param {import('../UIManager.js').UIManager} ui
 */
export function openMovesMenu(ui) {
  const playerId = ui.game.getPlayerId();
  const info = ui.game.entityManager.getComponent(playerId, 'pokemonInfo');
  if (!info || !info.currentMoves) {
    ui.showDialog('No hay movimientos disponibles.', () => openPauseMenu(ui));
    return;
  }

  const moves = info.currentMoves;
  const activeIdx = ui.game._selectedMoveIndex || 0;

  let html = `
    <div class="game-panel" style="width: 380px;">
      <h2 class="game-panel-title">SELECCIONAR MOVIMIENTO</h2>
      <div style="font-size: 6px; color: var(--text-secondary); margin-bottom: 8px; text-align: center;">
        Las teclas 1-4 usan el movimiento al instante (gasta PP). Chocar = ataque básico.
      </div>
      <div id="options-list" style="margin-bottom: 12px;">
  `;

  const fighter = ui.game.entityManager.getComponent(playerId, 'fighter');
  moves.forEach((moveSlot, idx) => {
    const moveDef = ui.game.movesData.find(m => m.id === moveSlot.moveId);
    const name = moveDef ? moveDef.name : moveSlot.moveId;
    const isActive = idx === activeIdx;
    let stateHint = '';
    let ppColor = 'var(--text-secondary)';
    if (moveSlot.enabled === false) {
      stateHint = ` · ANULADO${moveSlot._disableTurns > 0 ? ' ' + moveSlot._disableTurns + 't' : ''}`;
      ppColor = '#aa66aa';
    } else if (fighter?.charging?.moveId === moveSlot.moveId || fighter?.biding?.moveId === moveSlot.moveId) {
      stateHint = ' · ¡OTRA!';
      ppColor = '#66ccff';
    } else if (moveSlot.currentPP <= 0) {
      ppColor = '#ff4444';
    }
    
    html += `
      <div class="menu-option" data-index="${idx}">
        <span class="cursor">▶</span>
        <span style="flex-grow: 1;">${name}${stateHint}</span>
        <span style="color: ${isActive ? 'var(--text-accent)' : 'var(--text-secondary)'}; font-size: 6px; margin-right: 6px;">
          ${isActive ? '[ACTIVO]' : '[EQUIPAR]'}
        </span>
        <span style="color: ${ppColor}; font-size: 6px;">
          ${moveSlot.currentPP}/${moveSlot.maxPP} PP
        </span>
      </div>
    `;
  });

  html += `
      </div>
      <div id="move-desc-panel" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); padding: 8px; font-size: 7px; min-height: 54px; line-height: 1.5; color: var(--text-secondary);">
        Elige un movimiento para ver detalles.
      </div>
    </div>
  `;

  ui.showMenu('moves_select', html);

  ui.menuOptions = moves.map((moveSlot, idx) => () => {
    ui.game._selectedMoveIndex = idx;
    const moveDef = ui.game.movesData.find(m => m.id === moveSlot.moveId);
    const name = moveDef ? moveDef.name : moveSlot.moveId;
    
    ui.showDialog(`¡Ataque listo: ${name}!`, () => ui.closeMenu());
  });

  ui.selectedIndex = activeIdx;
  ui.updateSelectionVisuals();
  updateMoveDetails(ui);
}

/**
 * Actualiza el panel de detalles del movimiento seleccionado.
 * @param {import('../UIManager.js').UIManager} ui
 */
export function updateMoveDetails(ui) {
  const descPanel = document.getElementById('move-desc-panel');
  if (!descPanel) return;

  const playerId = ui.game.getPlayerId();
  const info = ui.game.entityManager.getComponent(playerId, 'pokemonInfo');
  if (!info || !info.currentMoves || !info.currentMoves[ui.selectedIndex]) {
    descPanel.innerHTML = 'Sin detalles.';
    return;
  }

  const moveSlot = info.currentMoves[ui.selectedIndex];
  const moveDef = ui.game.movesData.find(m => m.id === moveSlot.moveId);
  if (!moveDef) {
    descPanel.innerHTML = 'Movimiento no encontrado.';
    return;
  }

  const powerText = moveDef.power ? `Potencia: ${moveDef.power}` : 'Potencia: --';
  const typeLabel = TYPE_NAMES_ES[moveDef.type] || moveDef.type;
  const typeText = `Tipo: ${typeLabel}`;
  const ppText = `PP: ${moveSlot.currentPP}/${moveSlot.maxPP}`;
  const desc = moveDef.description || 'Sin descripción.';

  descPanel.innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-weight: bold; color: var(--text-primary);">
      <span>${typeText}</span>
      <span>${powerText}</span>
      <span>${ppText}</span>
    </div>
    <div style="color: var(--text-secondary); margin-top: 4px;">${desc}</div>
  `;
}

/**
 * Abre el menú de confirmación para avanzar de piso mediante las escaleras.
 * @param {import('../UIManager.js').UIManager} ui
 */
export function openStairsConfirmationMenu(ui) {
  const html = `
    <div class="game-panel" style="width: 280px; padding: 12px; display: flex; flex-direction: column; align-items: center;">
      <div style="font-size: 8px; line-height: 1.5; color: var(--text-primary); margin-bottom: 12px; text-align: center;">
        ¿Quieres bajar al siguiente piso?
      </div>
      <div id="options-list" style="display: flex; justify-content: space-around; width: 100%;">
        <div class="menu-option selected" data-index="0" style="padding: 4px 16px;"><span class="cursor">▶</span> Sí</div>
        <div class="menu-option" data-index="1" style="padding: 4px 16px;"><span class="cursor">▶</span> No</div>
      </div>
    </div>
  `;

  ui.showMenu('stairs_confirm', html);

  ui.menuOptions = [
    // Opción "Sí"
    () => {
      ui.closeMenu();
      ui.game.eventBus.emit('floor_change', { direction: 'down' });
    },
    // Opción "No"
    () => {
      ui.closeMenu();
    }
  ];

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
