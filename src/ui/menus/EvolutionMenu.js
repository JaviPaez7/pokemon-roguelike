import { GAME_STATES } from '../../constants.js';
import { evolve, checkEvolution } from '../../systems/EvolutionSystem.js';

/**
 * Menú Sí/No para confirmar (o cancelar) una evolución pendiente.
 * @param {import('../UIManager.js').UIManager} ui
 * @param {number} pokemonId
 * @param {Object} evolution - Datos de evolutions.json
 * @param {{ consumeStoneId?: string|null }} [opts]
 */
export function openEvolutionMenu(ui, pokemonId, evolution, opts = {}) {
  ui.currentMenuType = 'evolution';
  const info = ui.game.entityManager.getComponent(pokemonId, 'pokemonInfo');
  if (!info || !evolution) {
    ui.closeMenu();
    return;
  }

  const newSpecies = ui.game.pokemonData.find(p => p.id === evolution.to);
  const newName = newSpecies ? newSpecies.name : '???';
  const oldSprite = (ui.game.pokemonData.find(p => p.id === info.speciesId) || {}).sprite || '';
  const newSprite = newSpecies ? newSpecies.sprite : '';

  const html = `
    <div class="game-panel" style="width: 340px; margin: auto;">
      <h2 class="game-panel-title">¡EVOLUCIÓN!</h2>
      <div style="display:flex; justify-content:center; align-items:center; gap:16px; margin: 12px 0;">
        ${oldSprite ? `<img src="${oldSprite}" alt="${info.name}" width="64" height="64" style="image-rendering: pixelated;" />` : ''}
        <span style="font-size: 18px; color: #ffd700;">→</span>
        ${newSprite ? `<img src="${newSprite}" alt="${newName}" width="64" height="64" style="image-rendering: pixelated; opacity: 0.85;" />` : ''}
      </div>
      <p style="font-size: 11px; line-height: 1.5; text-align: center; margin-bottom: 14px;">
        ¡¿Qué?! ¡<strong>${info.name}</strong> está evolucionando!<br/>
        ¿Dejar que evolucione a <strong>${newName}</strong>?
      </p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Sí</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> No</div>
      </div>
    </div>
  `;

  ui.game.changeState(GAME_STATES.MENU);
  ui.showMenu('evolution', html);
  ui._evolutionEntityId = pokemonId;

  const finishExploring = () => {
    ui.closeMenu();
    ui.game.changeState(GAME_STATES.EXPLORING);
  };

  ui.menuOptions = [
    () => {
      const result = evolve(pokemonId, evolution, ui.game.entityManager, ui.game.pokemonData, ui.game.movesData);
      if (!result.success) {
        ui.showDialog(result.messages.join('\n') || 'La evolución falló.', finishExploring);
        return;
      }

      if (opts.consumeStoneId) {
        const slot = ui.game.inventory.find(s => s.itemId === opts.consumeStoneId);
        if (slot) {
          slot.quantity--;
          if (slot.quantity <= 0) {
            const idx = ui.game.inventory.indexOf(slot);
            if (idx > -1) ui.game.inventory.splice(idx, 1);
          }
        }
      }

      const refreshed = ui.game.entityManager.getComponent(pokemonId, 'pokemonInfo');
      if (refreshed) {
        refreshed.pendingEvolution = null;
        refreshed.evolutionDeclinedAtLevel = null;
        ui.game.entityManager.setComponent(pokemonId, 'pokemonInfo', refreshed);
      }

      if (ui.game.renderer && ui.game.renderer.screenFlash) {
        ui.game.renderer.screenFlash('rgba(255, 255, 255, 0.8)', 800);
      }
      ui.game.needsRender = true;
      try { ui.game.saveGameData(); } catch (e) {}

      const extra = (result.messages || []).filter(m => m.includes('aprendió')).join('\n');
      const text = `¡Enhorabuena!\n¡${result.oldName} evolucionó a ${result.newName}!` + (extra ? `\n\n${extra}` : '');

      ui.showDialog(text, () => {
        // Cadena de evolución (p.ej. si subió varios niveles)
        const again = ui.game.entityManager.getComponent(pokemonId, 'pokemonInfo');
        const next = again ? checkEvolution(again, ui.game.evolutionsData) : null;
        if (next && again.evolutionDeclinedAtLevel !== again.level) {
          again.pendingEvolution = next;
          ui.game.entityManager.setComponent(pokemonId, 'pokemonInfo', again);
          openEvolutionMenu(ui, pokemonId, next, {});
          return;
        }
        finishExploring();
      });
    },
    () => {
      const refreshed = ui.game.entityManager.getComponent(pokemonId, 'pokemonInfo');
      if (refreshed) {
        refreshed.pendingEvolution = null;
        refreshed.evolutionDeclinedAtLevel = refreshed.level;
        ui.game.entityManager.setComponent(pokemonId, 'pokemonInfo', refreshed);
      }
      ui.showDialog(`¡${info.name} no evolucionó!`, finishExploring);
    }
  ];

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
