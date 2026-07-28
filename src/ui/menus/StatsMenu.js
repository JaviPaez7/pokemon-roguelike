import { openTitleScreen } from './TitleMenu.js';
import { openPauseMenu } from './PauseMenu.js';

const LIFETIME_KEY = 'pokerogue_lifetime_stats';

/**
 * Obtiene las estadísticas de por vida desde localStorage.
 * Si no existen, retorna un objeto con valores en cero.
 * @returns {Object}
 */
export function getLifetimeStats() {
  try {
    const raw = localStorage.getItem(LIFETIME_KEY);
    return raw ? JSON.parse(raw) : {
      runsPlayed: 0,
      victories: 0,
      maxFloor: 1,
      pokemonDefeated: 0,
      pokemonCaptured: 0,
      floorsExplored: 0,
      itemsUsed: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      turnsPlayed: 0
    };
  } catch (e) {
    console.error('Error al leer estadísticas globales:', e);
    return {
      runsPlayed: 0,
      victories: 0,
      maxFloor: 1,
      pokemonDefeated: 0,
      pokemonCaptured: 0,
      floorsExplored: 0,
      itemsUsed: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      turnsPlayed: 0
    };
  }
}

/**
 * Guarda las estadísticas de la partida actual en las estadísticas de por vida
 * al ganar o al debilitarse (game over).
 * @param {Object} game - Instancia del juego
 * @param {boolean} isVictory - Si finalizó en victoria
 */
export function saveLifetimeStats(game, isVictory = false) {
  if (!game || !game.stats) return;

  try {
    const lifetime = getLifetimeStats();

    lifetime.runsPlayed++;
    if (isVictory) {
      lifetime.victories++;
    }

    const currentFloor = typeof game.getCurrentFloor === 'function' ? game.getCurrentFloor() : game._currentFloor;
    lifetime.maxFloor = Math.max(lifetime.maxFloor, currentFloor || 1);
    lifetime.pokemonDefeated += game.stats.pokemonDefeated || 0;
    lifetime.pokemonCaptured += game.stats.pokemonCaptured || 0;
    lifetime.floorsExplored += game.stats.floorsExplored || 0;
    lifetime.itemsUsed += game.stats.itemsUsed || 0;
    lifetime.totalDamageDealt += game.stats.totalDamageDealt || 0;
    lifetime.totalDamageTaken += game.stats.totalDamageTaken || 0;
    lifetime.turnsPlayed += game.stats.turnsPlayed || 0;

    localStorage.setItem(LIFETIME_KEY, JSON.stringify(lifetime));
  } catch (e) {
    console.error('Error al guardar estadísticas de por vida:', e);
  }
}

/**
 * Abre el menú de estadísticas en pantalla.
 * @param {import('../UIManager.js').UIManager} ui - Gestor de UI
 * @param {'title'|'pause'} [parentMenuType='title'] - Menú al cual regresar
 */
export function openStatsMenu(ui, parentMenuType = 'title') {
  const lifetime = getLifetimeStats();
  const showCurrentRun = parentMenuType === 'pause' && ui.game && ui.game.stats;
  const current = showCurrentRun ? ui.game.stats : null;
  const runFloor = showCurrentRun ? (typeof ui.game.getCurrentFloor === 'function' ? ui.game.getCurrentFloor() : ui.game._currentFloor) : 1;
  const pokedexSeen = showCurrentRun && ui.game.pokedexSeen ? ui.game.pokedexSeen.size : 0;

  let html = `
    <div class="game-panel" style="width: 440px; font-size: 8px;">
      <h2 class="game-panel-title">ESTADÍSTICAS</h2>
      
      <div style="display: flex; gap: 16px; margin-bottom: 12px; max-height: 220px; overflow-y: auto;">
  `;

  // Columna de Run Actual (si aplica)
  if (showCurrentRun) {
    html += `
        <div style="flex: 1; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); padding: 8px; border-radius: 4px;">
          <h3 style="color: var(--text-accent); text-align: center; margin-bottom: 8px; font-size: 8px; border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;">RUN ACTUAL</h3>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Piso Alcanzado:</span> <span style="color: #fff;">Piso ${runFloor}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Pokémon derrotados:</span> <span style="color: #fff;">${current.pokemonDefeated}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Capturas:</span> <span style="color: #fff;">${current.pokemonCaptured}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Daño Causado:</span> <span style="color: #fff;">${current.totalDamageDealt}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Daño Recibido:</span> <span style="color: #fff;">${current.totalDamageTaken}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Objetos Usados:</span> <span style="color: #fff;">${current.itemsUsed}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Pokédex vista:</span> <span style="color: #fff;">${pokedexSeen}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Turnos Jugados:</span> <span style="color: #fff;">${current.turnsPlayed}</span></div>
        </div>
    `;
  }

  // Columna de Historial Global
  html += `
        <div style="flex: 1; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); padding: 8px; border-radius: 4px;">
          <h3 style="color: var(--text-accent); text-align: center; margin-bottom: 8px; font-size: 8px; border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;">HISTORIAL GLOBAL</h3>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Partidas Jugadas:</span> <span style="color: #fff;">${lifetime.runsPlayed}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Victorias:</span> <span style="color: #fff; text-shadow: ${lifetime.victories > 0 ? '0 0 4px var(--hp-green)' : 'none'};">${lifetime.victories}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Piso Máximo:</span> <span style="color: #fff;">Piso ${lifetime.maxFloor}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Tot. Derrotas:</span> <span style="color: #fff;">${lifetime.pokemonDefeated}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Tot. Capturas:</span> <span style="color: #fff;">${lifetime.pokemonCaptured}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Tot. Daño Causado:</span> <span style="color: #fff;">${lifetime.totalDamageDealt}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Tot. Daño Recibido:</span> <span style="color: #fff;">${lifetime.totalDamageTaken}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Tot. Obj. Usados:</span> <span style="color: #fff;">${lifetime.itemsUsed}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Tot. Turnos:</span> <span style="color: #fff;">${lifetime.turnsPlayed}</span></div>
        </div>
      </div>
  `;

  // Botón Volver
  html += `
      <div id="options-list">
        <div class="menu-option selected" data-index="0" style="justify-content: center;">
          <span class="cursor">▶</span> Volver
        </div>
      </div>
    </div>
  `;

  ui.showMenu('stats', html);

  ui.menuOptions = [
    () => {
      if (parentMenuType === 'pause') {
        openPauseMenu(ui);
      } else {
        openTitleScreen(ui);
      }
    }
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
