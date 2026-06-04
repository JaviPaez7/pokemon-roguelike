import { GAME_STATES } from '../../constants.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openGameOverScreen(ui) {
  const floor = ui.game.getCurrentFloor();
  const html = `
    <div class="game-panel" style="text-align: center; width: 340px; border-color: var(--hp-red);">
      <h1 class="loading-title" style="color: var(--hp-red); font-size: 24px; text-shadow: 2px 2px 0 #880000; margin-bottom: 20px;">FIN DE PARTIDA</h1>
      <p style="font-size: 8px; line-height: 1.6; margin-bottom: 12px; color: var(--text-primary);">
        Tu equipo ha caído debilitado en el <br>
        <span style="color: var(--text-accent); font-size: 12px;">PISO ${floor}</span>.
      </p>

      <div style="background: rgba(0,0,0,0.3); border: 1px solid #333; padding: 10px; border-radius: 4px; margin-bottom: 15px; text-align: left; font-size: 8px; color: #ccc;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Pokémon Derrotados:</span> <span style="color: #fff;">${ui.game.stats.pokemonDefeated}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Pokémon Capturados:</span> <span style="color: #fff;">${ui.game.stats.pokemonCaptured}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Daño Causado:</span> <span style="color: #fff;">${ui.game.stats.totalDamageDealt}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Daño Recibido:</span> <span style="color: #fff;">${ui.game.stats.totalDamageTaken}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Objetos Usados:</span> <span style="color: #fff;">${ui.game.stats.itemsUsed}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Turnos Jugados:</span> <span style="color: #fff;">${ui.game.stats.turnsPlayed}</span></div>
      </div>
      
      <div id="options-list">
        <div class="menu-option selected" data-index="0" style="justify-content: center;">
          <span class="cursor">▶</span> Volver al Menú Principal
        </div>
      </div>
    </div>
  `;

  ui.showMenu('game_over', html);

  ui.menuOptions = [
    () => {
      localStorage.removeItem('pokerogue_save');
      ui.game.changeState(GAME_STATES.TITLE);
    }
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {import('../UIManager.js').UIManager} ui */
export function openVictoryScreen(ui) {
  const html = `
    <div class="game-panel" style="text-align: center; width: 360px; border-color: var(--hp-green);">
      <h1 class="loading-title" style="color: var(--hp-green); font-size: 20px; text-shadow: 2px 2px 0 #006600; margin-bottom: 20px; animation: victoryBlink 1s infinite alternate;">¡VICTORIA!</h1>
      <p style="font-size: 8px; line-height: 1.8; margin-bottom: 12px;">
        ¡Has derrotado a Mewtwo en el Laboratorio Final y completado el PokéRogue!
      </p>

      <div style="background: rgba(0,0,0,0.3); border: 1px solid #333; padding: 10px; border-radius: 4px; margin-bottom: 15px; text-align: left; font-size: 8px; color: #ccc;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Pokémon Derrotados:</span> <span style="color: #fff;">${ui.game.stats.pokemonDefeated}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Pokémon Capturados:</span> <span style="color: #fff;">${ui.game.stats.pokemonCaptured}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Daño Causado:</span> <span style="color: #fff;">${ui.game.stats.totalDamageDealt}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Daño Recibido:</span> <span style="color: #fff;">${ui.game.stats.totalDamageTaken}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Objetos Usados:</span> <span style="color: #fff;">${ui.game.stats.itemsUsed}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Turnos Jugados:</span> <span style="color: #fff;">${ui.game.stats.turnsPlayed}</span></div>
      </div>
      
      <div id="options-list">
        <div class="menu-option selected" data-index="0" style="justify-content: center;">
          <span class="cursor">▶</span> Volver al Menú Principal
        </div>
      </div>
    </div>
  `;

  ui.showMenu('victory', html);

  ui.menuOptions = [
    () => {
      try {
        localStorage.removeItem('pokerogue_save');
      } catch (e) {}
      ui.game.changeState(GAME_STATES.TITLE);
    }
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
