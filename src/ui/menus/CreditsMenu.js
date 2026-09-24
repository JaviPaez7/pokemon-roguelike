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

/**
 * Pantalla de créditos. La licencia de los sprites de PMDCollab exige citar a
 * sus autores. Los créditos se cargan aparte, solo al abrir la pantalla.
 * @param {import('../UIManager.js').UIManager} ui
 * @param {() => void} back - Adónde volver
 */
export async function openCreditsMenu(ui, back) {
  const { default: credits } = await import('../../data/pmd-credits.json');
  const { named, unnamed } = creditedArtists(credits);
  const section = (title, body) => `
    <h3 style="font-size: 8px; color: var(--text-accent); margin: 12px 0 6px;">${title}</h3>
    <p style="font-size: 7px; line-height: 1.7; color: var(--text-primary);">${body}</p>`;

  const html = `
    <div class="game-panel" style="width: 420px;">
      <h2 class="game-panel-title">CRÉDITOS</h2>
      <div id="credits-text" style="max-height: 300px; overflow-y: auto; padding: 0 6px;">
        ${section('PokéRogue', 'Juego de fans, gratuito y sin ánimo de lucro. Pokémon y sus personajes son © Nintendo, Creatures Inc. y GAME FREAK inc.; Pokémon Mundo Misterioso es de Spike Chunsoft. Este juego no tiene relación con ellos.')}
        ${section('Sprites y retratos', `<a href="${credits.url}" target="_blank" rel="noopener" style="color: var(--text-accent);">${credits.source}</a>. El arte de base es el oficial de CHUNSOFT; las animaciones y emociones que ha añadido la comunidad se usan con licencia CC BY-NC 4.0.`)}
        ${section('Artistas de PMDCollab', `${named.join(' · ')}${unnamed ? ` · y ${unnamed} colaboradores más sin nombre registrado` : ''}.`)}
        ${section('Motor y recursos', 'rot-js (licencia BSD) para la generación de mazmorras y el campo de visión. Tipografía Press Start 2P, de CodeMan38 (SIL Open Font License). Música y efectos sintetizados en el propio juego.')}
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
