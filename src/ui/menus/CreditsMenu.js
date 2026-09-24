import { GAME_STATES } from '../../constants.js';

/** Quien firma la historia en los créditos finales. */
export const STORY_AUTHOR = 'JaviStudio';

/**
 * Autores con nombre registrado en PMDCollab (sin CHUNSOFT, que va aparte) y
 * cuántos colaboradores solo figuran con su identificador de Discord.
 * @param {{ artists: string[] }} credits - pmd-credits.json
 * @returns {{ named: string[], unnamed: number }}
 */
export function creditedArtists(credits) {
  const others = credits.artists.filter((a) => a !== 'CHUNSOFT');
  const named = others.filter((a) => !a.startsWith('<@'));
  return { named, unnamed: others.length - named.length };
}

/** @param {string} title @param {string} body */
function section(title, body) {
  return `
    <h3 style="font-size: 8px; color: var(--text-accent); margin: 12px 0 6px;">${title}</h3>
    <p style="font-size: 7px; line-height: 1.7; color: var(--text-primary);">${body}</p>`;
}

/**
 * Créditos del juego: aviso de juego de fans, PMDCollab con sus artistas (la
 * licencia de los sprites obliga a citarlos) y el motor. Se cargan aparte,
 * solo al abrir la pantalla.
 * @returns {Promise<string>} HTML de las secciones
 */
async function gameCredits() {
  const { default: credits } = await import('../../data/pmd-credits.json');
  const { named, unnamed } = creditedArtists(credits);
  return [
    section('PokéRogue', 'Juego de fans, gratuito y sin ánimo de lucro. Pokémon y sus personajes son © Nintendo, Creatures Inc. y GAME FREAK inc.; Pokémon Mundo Misterioso es de Spike Chunsoft. Este juego no tiene relación con ellos.'),
    section('Sprites y retratos', `<a href="${credits.url}" target="_blank" rel="noopener" style="color: var(--text-accent);">${credits.source}</a>. El arte de base es el oficial de CHUNSOFT; las animaciones y emociones que ha añadido la comunidad se usan con licencia CC BY-NC 4.0.`),
    section('Artistas de PMDCollab', `${named.join(' · ')}${unnamed ? ` · y ${unnamed} colaboradores más sin nombre registrado` : ''}.`),
    section('Motor y recursos', 'rot-js (licencia BSD) para la generación de mazmorras y el campo de visión. Tipografía Press Start 2P, de CodeMan38 (SIL Open Font License). Música y efectos sintetizados en el propio juego.'),
  ].join('');
}

/**
 * Pantalla de créditos (desde el título).
 * @param {import('../UIManager.js').UIManager} ui
 * @param {() => void} back - Adónde volver
 */
export async function openCreditsMenu(ui, back) {
  const html = `
    <div class="game-panel" style="width: 420px;">
      <h2 class="game-panel-title">CRÉDITOS</h2>
      <div id="credits-text" style="max-height: 300px; overflow-y: auto; padding: 0 6px;">
        ${await gameCredits()}
      </div>
      <div id="options-list" style="margin-top: 12px;">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Volver</div>
      </div>
    </div>
  `;
  ui.showMenu('credits', html, { onCancel: back });
  ui.menuOptions = [back];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/**
 * Créditos del final de la historia: pasan solos y se pueden cerrar en
 * cualquier momento (Z o Escape).
 * @param {import('../UIManager.js').UIManager} ui
 * @param {() => void} onContinue
 */
export async function openEndingCredits(ui, onContinue) {
  // Mientras se cargan los créditos, que Z no active las opciones del menú anterior
  ui.game.changeState(GAME_STATES.MENU);
  ui.menuOptions = [];
  const html = `
    <div class="game-panel ending-credits" style="width: 420px;">
      <h2 class="game-panel-title">EL ECO DEL NORTE</h2>
      <div class="credits-roll">
        <div class="credits-roll-inner">
          ${section('Una historia original de PokéRogue', `Guion y desarrollo: ${STORY_AUTHOR}.`)}
          ${await gameCredits()}
          ${section('¡Gracias por jugar!', 'La Torre del Desafío os espera al norte.')}
        </div>
      </div>
      <div id="options-list" style="margin-top: 12px;">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Continuar</div>
      </div>
    </div>
  `;
  ui.showMenu('ending_credits', html, { onCancel: onContinue });
  ui.overlay.classList.add('story-black');
  ui.menuOptions = [onContinue];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
