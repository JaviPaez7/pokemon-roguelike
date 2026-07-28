import { GAME_STATES } from '../../constants.js';
import { openStatsMenu } from './StatsMenu.js';
import { SAVE_VERSION } from '../../core/SaveManager.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openTitleScreen(ui) {
  let hasSave = false;
  let saveHint = '';
  try {
    const raw = localStorage.getItem('pokerogue_save');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (!data || data.version !== SAVE_VERSION || !Array.isArray(data.party) || !data.party.length) {
          localStorage.removeItem('pokerogue_save');
          if (data && data.version != null && data.version !== SAVE_VERSION) {
            try { sessionStorage.setItem('pokerogue_save_wiped', '1'); } catch (e) {}
          }
        } else {
          hasSave = true;
          const leader = data.party.find(p => p.isLeader) || data.party[0];
          if (leader) {
            const nItems = Array.isArray(data.floorItems) ? data.floorItems.length : 0;
            saveHint = `Piso ${data.currentFloor || '?'} · ${leader.name} Nv.${leader.level || '?'} · ${data.coins != null ? data.coins : '?'} Poké${nItems ? ` · ${nItems} obj.` : ''}`;
          }
        }
      } catch (parseErr) {
        localStorage.removeItem('pokerogue_save');
        hasSave = false;
      }
    }
    if (sessionStorage.getItem('pokerogue_save_wiped') === '1') {
      sessionStorage.removeItem('pokerogue_save_wiped');
      setTimeout(() => {
        ui.showDialog('La partida guardada era de una versión antigua y se ha borrado.', () => openTitleScreen(ui));
      }, 100);
    }
  } catch (e) {
    console.warn('localStorage no está disponible:', e);
  }

  const html = `
    <div class="game-panel" style="text-align: center; width: 340px;">
      <h1 class="loading-title" style="margin-bottom: 20px; font-size: 24px;">POKÉROGUE</h1>
      <p style="font-size: 8px; color: var(--text-secondary); margin-bottom: 30px; line-height: 1.5;">Roguelike · 50 pisos · Gen 1</p>
      
      <div id="options-list">
        <div class="menu-option selected" data-index="0">
          <span class="cursor">▶</span> Nueva Partida
        </div>
        ${hasSave ? `
        <div class="menu-option" data-index="1" style="flex-direction: column; align-items: flex-start;">
          <span><span class="cursor">▶</span> Continuar partida</span>
          ${saveHint ? `<span style="font-size: 6px; color: var(--text-secondary); margin-left: 14px; margin-top: 2px;">${saveHint}</span>` : ''}
        </div>` : ''}
        <div class="menu-option" data-index="${hasSave ? 2 : 1}">
          <span class="cursor">▶</span> Estadísticas
        </div>
        <div class="menu-option" data-index="${hasSave ? 3 : 2}">
          <span class="cursor">▶</span> Cómo jugar
        </div>
      </div>
    </div>
  `;

  ui.showMenu('title', html);

  ui.menuOptions = [
    () => ui.game.changeState(GAME_STATES.STARTER_SELECT),
    ...(hasSave ? [() => ui.game.loadSavedGame()] : []),
    () => openStatsMenu(ui, 'title'),
    () => showControlsDialog(ui)
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {import('../UIManager.js').UIManager} ui */
export function showControlsDialog(ui) {
  ui.showDialog(
    'Controles:\nWASD / Flechas / HJKL - Mover (chocar = ataque básico sin PP)\nDiagonales: Tecl. Num. / YUBN / Inicio/Fin...\nZ / Enter - Recoger / Escaleras / Examinar\n1-4 - Movimientos (PP; ¡PULSA! = carga/Venganza)\nX - Mochila  C - Equipo  Tab - Cambiar líder\nPoké Ball: Usar o Lanzar mirando al salvaje (también diagonal)\nM - Mapa  Esc - Pausa / Guardar\nBaldosa Mágica / salas de descanso curan.\nEn móvil: D-pad + botones Z/X/C/Tab/M',
    () => openTitleScreen(ui)
  );
}
