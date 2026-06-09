import { GAME_STATES } from '../../constants.js';
import { openInventoryMenu } from './InventoryMenus.js';
import { openTeamMenu } from './TeamMenus.js';
import { openOptionsMenu } from './OptionsMenu.js';
import { openStatsMenu } from './StatsMenu.js';
import { openLogMenu } from './LogMenu.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openPauseMenu(ui) {
  const html = `
    <div class="game-panel" style="width: 260px;">
      <h2 class="game-panel-title">PAUSA</h2>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Continuar</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Mochila</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> Equipo Pokémon</div>
        <div class="menu-option" data-index="3"><span class="cursor">▶</span> Movimientos</div>
        <div class="menu-option" data-index="4"><span class="cursor">▶</span> Historial de Mensajes</div>
        <div class="menu-option" data-index="5"><span class="cursor">▶</span> Estadísticas</div>
        <div class="menu-option" data-index="6"><span class="cursor">▶</span> Opciones</div>
        <div class="menu-option" data-index="7"><span class="cursor">▶</span> Guardar y Salir</div>
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
      ui.game.saveGameData();
      ui.showDialog('Partida guardada correctamente.', () => {
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
        Usa Z/Confirmar para equipar ataque. Accesos rápidos: Teclas 1-4.
      </div>
      <div id="options-list" style="margin-bottom: 12px;">
  `;

  moves.forEach((moveSlot, idx) => {
    const moveDef = ui.game.movesData.find(m => m.id === moveSlot.moveId);
    const name = moveDef ? moveDef.name : moveSlot.moveId;
    const isActive = idx === activeIdx;
    
    html += `
      <div class="menu-option" data-index="${idx}">
        <span class="cursor">▶</span>
        <span style="flex-grow: 1;">${name}</span>
        <span style="color: ${isActive ? 'var(--text-accent)' : 'var(--text-secondary)'}; font-size: 6px; margin-right: 6px;">
          ${isActive ? '[ACTIVO]' : '[EQUIPAR]'}
        </span>
        <span style="color: var(--text-secondary); font-size: 6px;">
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
  const typeText = `Tipo: ${moveDef.type.toUpperCase()}`;
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
