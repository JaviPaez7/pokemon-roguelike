import { openPauseMenu } from './PauseMenu.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openTeamMenu(ui) {
  const party = ui.game.party;

  let html = `
    <div class="game-panel" style="width: 340px;">
      <h2 class="game-panel-title">EQUIPO POKÉMON</h2>
      <div id="options-list">
  `;

  party.forEach((poke, idx) => {
    const leaderIndicator = poke.isLeader ? '<span style="color: var(--xp-blue); font-size: 6px; font-weight: bold;">[LÍDER]</span>' : '';
    html += `
      <div class="menu-option" data-index="${idx}" style="flex-direction: column; align-items: flex-start; gap: 2px;">
        <div style="display: flex; justify-content: space-between; width: 100%;">
          <span><span class="cursor">▶</span> ${poke.name}</span>
          <span>Nv.${poke.level} ${leaderIndicator}</span>
        </div>
        <div style="font-size: 6px; color: var(--text-secondary); margin-left: 12px;">PS: ${poke.hp}/${poke.maxHp}</div>
      </div>
    `;
  });

  html += `
        <div class="menu-option" data-index="${party.length}">
          <span class="cursor">▶</span> Volver al menú
        </div>
      </div>
    </div>
  `;

  ui.showMenu('team', html);

  ui.menuOptions = party.map(poke => () => {
    ui.selectedPokemon = poke.id;
    openPokemonActionsMenu(ui);
  });

  ui.menuOptions.push(() => openPauseMenu(ui));
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {import('../UIManager.js').UIManager} ui */
export function openPokemonActionsMenu(ui) {
  const info = ui.game.entityManager.getComponent(ui.selectedPokemon, 'pokemonInfo');
  const fighter = ui.game.entityManager.getComponent(ui.selectedPokemon, 'fighter');

  const html = `
    <div class="game-panel" style="width: 300px;">
      <h2 class="game-panel-title" style="text-transform: uppercase;">${info.name}</h2>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Establecer como Líder</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Ver movimientos</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> Atrás</div>
      </div>
    </div>
  `;

  ui.showMenu('pokemon_actions', html);

  ui.menuOptions = [
    () => {
      if (fighter.hp <= 0) {
        ui.showDialog('¡Un Pokémon debilitado no puede liderar el equipo!', () => openTeamMenu(ui));
        return;
      }

      const partyEntities = ui.game.entityManager.getEntitiesWithComponents('partyMember');
      for (const pid of partyEntities) {
        const mem = ui.game.entityManager.getComponent(pid, 'partyMember');
        if (mem) {
          mem.isLeader = (pid === ui.selectedPokemon);
          ui.game.entityManager.setComponent(pid, 'partyMember', mem);
        }
      }

      ui.game._playerId = ui.selectedPokemon;
      ui.game.turnManager.setPlayerEntityId(ui.selectedPokemon);

      ui.showDialog(`¡${info.name} ahora lidera el equipo!`, () => openTeamMenu(ui));
    },
    () => openMovesViewMenu(ui),
    () => openTeamMenu(ui)
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {import('../UIManager.js').UIManager} ui */
export function openMovesViewMenu(ui) {
  const info = ui.game.entityManager.getComponent(ui.selectedPokemon, 'pokemonInfo');
  const moves = info.currentMoves || [];

  let html = `
    <div class="game-panel" style="width: 360px;">
      <h2 class="game-panel-title">MOVIMIENTOS DE ${info.name.toUpperCase()}</h2>
      <div id="options-list">
  `;

  moves.forEach((slot, idx) => {
    const moveData = ui.game.movesData.find(m => m.id === slot.moveId);
    const moveName = moveData ? moveData.name : slot.moveId;
    const type = moveData ? moveData.type : 'normal';

    html += `
      <div class="menu-option" data-index="${idx}" style="flex-direction: column; align-items: flex-start; gap: 2px;">
        <div style="display: flex; justify-content: space-between; width: 100%;">
          <span><span class="cursor">▶</span> ${moveName}</span>
          <span class="type-badge ${type}">${type}</span>
        </div>
        <div style="font-size: 6px; color: var(--text-secondary); margin-left: 12px; display: flex; gap: 16px;">
          <span>PP: ${slot.currentPP}/${slot.maxPP}</span>
          <span>Pot: ${moveData?.power || '—'}</span>
          <span>Prec: ${moveData?.accuracy || '—'}</span>
        </div>
      </div>
    `;
  });

  html += `
        <div class="menu-option" data-index="${moves.length}">
          <span class="cursor">▶</span> Volver atrás
        </div>
      </div>
    </div>
  `;

  ui.showMenu('moves_view', html);

  ui.menuOptions = moves.map(() => () => {});
  ui.menuOptions.push(() => openPokemonActionsMenu(ui));
  ui.selectedIndex = moves.length;
  ui.updateSelectionVisuals();
}
