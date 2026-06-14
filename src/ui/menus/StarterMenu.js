import { STARTERS } from '../../data/starterData.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openStarterSelectScreen(ui) {
  let html = `
    <div class="game-panel" style="width: 500px; max-width: 95vw;">
      <h2 class="game-panel-title">ELIGE TU COMPAÑERO INICIAL</h2>
      
      <div style="display: flex; gap: 16px; justify-content: space-between; margin-bottom: 20px;">
  `;

  STARTERS.forEach((s, idx) => {
    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${s.id}.png`;
    html += `
      <div class="menu-option" data-index="${idx}" style="flex: 1; flex-direction: column; padding: 12px; border: 2px solid var(--border-color); text-align: center; cursor: pointer; align-items: center; gap: 4px;">
        <img src="${spriteUrl}" style="image-rendering: pixelated; width: 80px; height: 80px; margin-bottom: 4px;">
        <div style="font-size: 10px; color: ${s.color}; font-weight: bold;">${s.name}</div>
        <div style="font-size: 6px; color: #88a; margin-top: 4px;">PS:${s.hp}  Atk:${s.attack}</div>
        <div style="font-size: 6px; color: #88a;">Def:${s.defense} Vel:${s.speed}</div>
      </div>
    `;
  });

  html += `
      </div>
      <div class="game-panel" id="starter-desc-panel" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); padding: 8px; font-size: 7px; line-height: 1.6; min-height: 50px; text-align: center;">
        Cargando descripción...
      </div>
    </div>
  `;

  ui.showMenu('starter', html);

  ui.menuOptions = STARTERS.map(s => () => {
    ui.closeMenu();
    ui.game.startNewGame(s.id);
  });

  ui.selectedIndex = 0;
  updateStarterDetails(STARTERS[0]);
}

/** @param {Object} starter */
export function updateStarterDetails(starter) {
  const descPanel = document.getElementById('starter-desc-panel');
  if (descPanel) {
    descPanel.innerHTML = `
      <div style="color: var(--text-accent); margin-bottom: 4px; text-transform: uppercase;">${starter.name} — Tipo ${starter.type}</div>
      <div style="color: var(--text-primary);">${starter.desc}</div>
    `;
  }
}
