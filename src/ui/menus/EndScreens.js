import { GAME_STATES } from '../../constants.js';
import { saveLifetimeStats } from './StatsMenu.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openGameOverScreen(ui) {
  const floor = ui.game.getCurrentFloor();
  const reason = ui.game._deathReason === 'hambre' ? 'hambre' : 'combate';
  const reasonText = reason === 'hambre'
    ? 'Tu equipo se debilitó de hambre'
    : 'Tu equipo ha caído debilitado';

  const partyLines = (ui.game.party || []).map(p =>
    `<div style="display:flex;justify-content:space-between;margin-bottom:3px;">
      <span>${p.name} Nv.${p.level}</span>
      <span style="color:${p.hp > 0 ? '#8f8' : '#f66'};">${p.hp}/${p.maxHp}</span>
    </div>`
  ).join('');

  const canRetry = !!ui.game._lastStarterId;

  const html = `
    <div class="game-panel" style="text-align: center; width: 340px; border-color: var(--hp-red);">
      <h1 class="loading-title" style="color: var(--hp-red); font-size: 24px; text-shadow: 2px 2px 0 #880000; margin-bottom: 16px;">FIN DE PARTIDA</h1>
      <p style="font-size: 8px; line-height: 1.6; margin-bottom: 10px; color: var(--text-primary);">
         ${reasonText} en el <br>
        <span style="color: var(--text-accent); font-size: 12px;">PISO ${floor}</span>.
      </p>

      ${partyLines ? `<div style="background: rgba(0,0,0,0.3); border: 1px solid #333; padding: 8px; margin-bottom: 10px; text-align: left; font-size: 7px; color: #ccc;">${partyLines}</div>` : ''}

      <div style="background: rgba(0,0,0,0.3); border: 1px solid #333; padding: 10px; border-radius: 4px; margin-bottom: 15px; text-align: left; font-size: 8px; color: #ccc;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Pokémon derrotados:</span> <span style="color: #fff;">${ui.game.stats.pokemonDefeated}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Capturas:</span> <span style="color: #fff;">${ui.game.stats.pokemonCaptured}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Daño causado:</span> <span style="color: #fff;">${ui.game.stats.totalDamageDealt}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Turnos:</span> <span style="color: #fff;">${ui.game.stats.turnsPlayed}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Monedas:</span> <span style="color: #ffd700;">${ui.game.coins || 0}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Pokédex:</span> <span style="color: #fff;">${ui.game.pokedexSeen ? ui.game.pokedexSeen.size : 0}/151</span></div>
      </div>
      
      <div id="options-list">
        ${canRetry ? `<div class="menu-option selected" data-index="0" style="justify-content: center;">
          <span class="cursor">▶</span> Reintentar
        </div>` : ''}
        <div class="menu-option ${canRetry ? '' : 'selected'}" data-index="${canRetry ? 1 : 0}" style="justify-content: center;">
          <span class="cursor">▶</span> Menú Principal
        </div>
      </div>
    </div>
  `;

  ui.currentMenuType = 'game_over';
  ui.showMenu('game_over', html);

  const ensureLifetime = () => {
    if (!ui.game._lifetimeStatsSaved) {
      ui.game._lifetimeStatsSaved = true;
      saveLifetimeStats(ui.game, false);
    }
  };

  const goTitle = () => {
    ensureLifetime();
    localStorage.removeItem('pokerogue_save');
    ui.game.changeState(GAME_STATES.TITLE);
  };

  ui.menuOptions = canRetry
    ? [
        () => {
          ensureLifetime();
          localStorage.removeItem('pokerogue_save');
          const starter = ui.game._lastStarterId;
          ui.closeMenu();
          ui.game.startNewGame(starter);
        },
        goTitle
      ]
    : [goTitle];

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {import('../UIManager.js').UIManager} ui */
export function openVictoryScreen(ui) {
  const partyLines = (ui.game.party || []).map(p =>
    `<div style="display:flex;justify-content:space-between;margin-bottom:3px;">
      <span>${p.name} Nv.${p.level}</span>
      <span style="color:#8f8;">${p.hp}/${p.maxHp}</span>
    </div>`
  ).join('');

  const html = `
    <div class="game-panel" style="text-align: center; width: 360px; border-color: var(--hp-green);">
      <h1 class="loading-title" style="color: var(--hp-green); font-size: 20px; text-shadow: 2px 2px 0 #006600; margin-bottom: 20px; animation: victoryBlink 1s infinite alternate;">¡VICTORIA!</h1>
      <p style="font-size: 8px; line-height: 1.8; margin-bottom: 12px;">
        ¡Has derrotado a Mewtwo en el Laboratorio Final y completado el PokéRogue!
      </p>

      ${partyLines ? `<div style="background: rgba(0,0,0,0.3); border: 1px solid #333; padding: 8px; margin-bottom: 10px; text-align: left; font-size: 7px; color: #ccc;">${partyLines}</div>` : ''}

      <div style="background: rgba(0,0,0,0.3); border: 1px solid #333; padding: 10px; border-radius: 4px; margin-bottom: 15px; text-align: left; font-size: 8px; color: #ccc;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Pokémon derrotados:</span> <span style="color: #fff;">${ui.game.stats.pokemonDefeated}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Capturas:</span> <span style="color: #fff;">${ui.game.stats.pokemonCaptured}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Pokédex:</span> <span style="color: #fff;">${ui.game.pokedexSeen ? ui.game.pokedexSeen.size : 0}/151</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Monedas:</span> <span style="color: #ffd700;">${ui.game.coins || 0}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Daño causado:</span> <span style="color: #fff;">${ui.game.stats.totalDamageDealt}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Turnos:</span> <span style="color: #fff;">${ui.game.stats.turnsPlayed}</span></div>
      </div>
      
      <div id="options-list">
        <div class="menu-option selected" data-index="0" style="justify-content: center;">
          <span class="cursor">▶</span> Volver al Menú Principal
        </div>
      </div>
    </div>
  `;

  ui.currentMenuType = 'victory';
  ui.showMenu('victory', html);

  ui.menuOptions = [
    () => {
      try {
        if (!ui.game._lifetimeStatsSaved) {
          ui.game._lifetimeStatsSaved = true;
          saveLifetimeStats(ui.game, true);
        }
        localStorage.removeItem('pokerogue_save');
      } catch (e) {}
      ui.game.changeState(GAME_STATES.TITLE);
    }
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
