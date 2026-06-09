import { openPauseMenu } from './PauseMenu.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openTeamMenu(ui) {
  const party = ui.game.party;

  let html = `
    <div class="game-panel" style="width: 340px;">
      <h2 class="game-panel-title">EQUIPO POKÉMON</h2>
      <div id="options-list">
  `;

  const tacticasNombres = {
    follow: 'Ir juntos',
    aggressive: 'A por ellos',
    stay: 'Esperar ahí',
    flee: 'Evitar problemas'
  };

  party.forEach((poke, idx) => {
    const leaderIndicator = poke.isLeader ? '<span style="color: var(--xp-blue); font-size: 6px; font-weight: bold;">[LÍDER]</span>' : '';
    const tacticText = !poke.isLeader
      ? `<span style="color: var(--text-accent); font-size: 5px; font-weight: bold; background: rgba(0,204,255,0.1); padding: 1px 3px; border-radius: 2px;">${tacticasNombres[poke.tactic || 'follow']}</span>`
      : '';

    html += `
      <div class="menu-option" data-index="${idx}" style="flex-direction: column; align-items: flex-start; gap: 2px;">
        <div style="display: flex; justify-content: space-between; width: 100%;">
          <span><span class="cursor">▶</span> ${poke.name}</span>
          <span>Nv.${poke.level} ${leaderIndicator}</span>
        </div>
        <div style="font-size: 6px; color: var(--text-secondary); margin-left: 12px; display: flex; justify-content: space-between; width: calc(100% - 12px); align-items: center;">
          <span>PS: ${poke.hp}/${poke.maxHp}</span>
          ${tacticText}
        </div>
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
  const isLeader = (ui.selectedPokemon === ui.game._playerId);

  let html = `
    <div class="game-panel" style="width: 300px;">
      <h2 class="game-panel-title" style="text-transform: uppercase;">${info.name}</h2>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Establecer como Líder</div>
  `;

  if (!isLeader) {
    html += `
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Cambiar táctica</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> Ver movimientos</div>
        <div class="menu-option" data-index="3"><span class="cursor">▶</span> Atrás</div>
    `;
  } else {
    html += `
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Ver movimientos</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> Atrás</div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  ui.showMenu('pokemon_actions', html);

  if (!isLeader) {
    ui.menuOptions = [
      // Establecer como líder
      () => {
        const selectedId = ui.selectedPokemon;
        const oldLeaderId = ui.game._playerId;

        if (fighter.hp <= 0) {
          ui.showDialog('¡Un Pokémon debilitado no puede liderar el equipo!', () => openTeamMenu(ui));
          return;
        }

        const oldLeaderMem = ui.game.entityManager.getComponent(oldLeaderId, 'partyMember');
        const newLeaderMem = ui.game.entityManager.getComponent(selectedId, 'partyMember');

        if (oldLeaderMem && newLeaderMem) {
          const oldSlot = oldLeaderMem.slot;
          const newSlot = newLeaderMem.slot;

          // Intercambiar slots e isLeader
          oldLeaderMem.slot = newSlot;
          oldLeaderMem.isLeader = false;

          newLeaderMem.slot = oldSlot; // Que debería ser 0
          newLeaderMem.isLeader = true;

          ui.game.entityManager.setComponent(oldLeaderId, 'partyMember', oldLeaderMem);
          ui.game.entityManager.setComponent(selectedId, 'partyMember', newLeaderMem);

          // El líder anterior pasa a ser seguidor controlado por IA
          ui.game.entityManager.setComponent(oldLeaderId, 'aiControlled', {
            behavior: 'follower',
            detectRange: 5,
            alertedTo: null
          });

          // El nuevo líder pierde el componente de IA para ser controlado directamente por el teclado
          ui.game.entityManager.removeComponent(selectedId, 'aiControlled');

          // Actualizar IDs
          ui.game._playerId = selectedId;
          ui.game.turnManager.setPlayerEntityId(selectedId);

          // Limpiar el historial de pasos para que los seguidores inicien su seguimiento desde la posición actual
          ui.game.playerPathHistory = [];

          ui.showDialog(`¡${info.name} ahora lidera el equipo!`, () => openTeamMenu(ui));
        } else {
          ui.showDialog('Error al cambiar de líder.', () => openTeamMenu(ui));
        }
      },
      // Cambiar táctica
      () => openTacticSelectMenu(ui),
      // Ver movimientos
      () => openMovesViewMenu(ui),
      // Atrás
      () => openTeamMenu(ui)
    ];
  } else {
    ui.menuOptions = [
      () => {
        ui.showDialog('¡Este Pokémon ya es el líder del equipo!', () => openPokemonActionsMenu(ui));
      },
      () => openMovesViewMenu(ui),
      () => openTeamMenu(ui)
    ];
  }

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}

/** @param {import('../UIManager.js').UIManager} ui */
export function openTacticSelectMenu(ui) {
  const info = ui.game.entityManager.getComponent(ui.selectedPokemon, 'pokemonInfo');
  const partyMember = ui.game.entityManager.getComponent(ui.selectedPokemon, 'partyMember');
  const currentTactic = partyMember ? (partyMember.tactic || 'follow') : 'follow';

  const tacticsList = [
    { id: 'follow', name: 'Ir juntos', desc: 'Sigue la ruta del líder de cerca y ataca si hay enemigos en rango <= 3.' },
    { id: 'aggressive', name: 'A por ellos', desc: 'Explora y caza a cualquier enemigo a la vista (rango 8) de forma autónoma.' },
    { id: 'stay', name: 'Esperar ahí', desc: 'Se queda quieto en su baldosa actual y ataca a los enemigos adyacentes.' },
    { id: 'flee', name: 'Evitar problemas', desc: 'Prioriza su seguridad, huyendo de los enemigos en un rango <= 4.' }
  ];

  let html = `
    <div class="game-panel" style="width: 380px;">
      <h2 class="game-panel-title">TÁCTICAS DE ${info.name.toUpperCase()}</h2>
      <div id="options-list" style="margin-bottom: 12px;">
  `;

  tacticsList.forEach((t, idx) => {
    const isActive = t.id === currentTactic;
    html += `
      <div class="menu-option" data-index="${idx}">
        <span class="cursor">▶</span>
        <span style="flex-grow: 1;">${t.name}</span>
        <span style="color: ${isActive ? 'var(--text-accent)' : 'var(--text-secondary)'}; font-size: 6px;">
          ${isActive ? '[ACTIVO]' : '[SELECCIONAR]'}
        </span>
      </div>
    `;
  });

  html += `
      </div>
      <div id="tactic-desc-panel" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); padding: 8px; font-size: 7px; min-height: 48px; line-height: 1.5; color: var(--text-secondary);">
        Selecciona una táctica para ver su comportamiento.
      </div>
    </div>
  `;

  ui.showMenu('tactic_select', html);

  ui.menuOptions = tacticsList.map((t) => () => {
    if (partyMember) {
      partyMember.tactic = t.id;
      ui.game.entityManager.setComponent(ui.selectedPokemon, 'partyMember', partyMember);
      ui.showDialog(`Táctica de ${info.name} cambiada a: ¡${t.name}!`, () => openPokemonActionsMenu(ui));
    } else {
      openPokemonActionsMenu(ui);
    }
  });

  ui.selectedIndex = tacticsList.findIndex(t => t.id === currentTactic);
  if (ui.selectedIndex === -1) ui.selectedIndex = 0;
  
  ui.updateSelectionVisuals();
  updateTacticDetails(ui);
}

/** @param {import('../UIManager.js').UIManager} ui */
export function updateTacticDetails(ui) {
  const descPanel = document.getElementById('tactic-desc-panel');
  if (!descPanel) return;

  const tacticsList = [
    { id: 'follow', name: 'Ir juntos', desc: 'Sigue la ruta del líder de cerca y ataca si hay enemigos en rango <= 3.' },
    { id: 'aggressive', name: 'A por ellos', desc: 'Explora y caza a cualquier enemigo a la vista (rango 8) de forma autónoma.' },
    { id: 'stay', name: 'Esperar ahí', desc: 'Se queda quieto en su baldosa actual y ataca a los enemigos adyacentes.' },
    { id: 'flee', name: 'Evitar problemas', desc: 'Prioriza su seguridad, huyendo de los enemigos en un rango <= 4.' }
  ];

  const selected = tacticsList[ui.selectedIndex];
  if (selected) {
    descPanel.innerHTML = `
      <div style="font-weight: bold; color: var(--text-primary); margin-bottom: 4px;">${selected.name}</div>
      <div style="color: var(--text-secondary);">${selected.desc}</div>
    `;
  }
}


/** @param {import('../UIManager.js').UIManager} ui */
export function openMovesViewMenu(ui) {
  const info = ui.game.entityManager.getComponent(ui.selectedPokemon, 'pokemonInfo');
  const moves = info.currentMoves || [];
  const isLeader = (ui.selectedPokemon === ui.game._playerId);

  let html = `
    <div class="game-panel" style="width: 360px;">
      <h2 class="game-panel-title">MOVIMIENTOS DE ${info.name.toUpperCase()}</h2>
  `;

  if (!isLeader) {
    html += `
      <div style="font-size: 6px; color: var(--text-secondary); margin-bottom: 8px; text-align: center;">
        Usa Z/Confirmar para activar o desactivar movimientos para la IA.
      </div>
    `;
  }

  html += `
      <div id="options-list">
  `;

  moves.forEach((slot, idx) => {
    const moveData = ui.game.movesData.find(m => m.id === slot.moveId);
    const moveName = moveData ? moveData.name : slot.moveId;
    const type = moveData ? moveData.type : 'normal';

    let usageIndicator = '';
    if (!isLeader) {
      const isEnabled = slot.enabled !== false;
      usageIndicator = `
        <span style="color: ${isEnabled ? 'var(--text-accent)' : 'var(--text-secondary)'}; font-size: 5px; font-weight: bold; background: rgba(${isEnabled ? '0,204,255' : '150,150,150'},0.15); padding: 1px 4px; border-radius: 2px; margin-right: 4px; vertical-align: middle;">
          ${isEnabled ? 'USAR' : 'RESERVAR'}
        </span>
      `;
    }

    html += `
      <div class="menu-option" data-index="${idx}" style="flex-direction: column; align-items: flex-start; gap: 2px;">
        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
          <span><span class="cursor">▶</span> ${moveName}</span>
          <div style="display: flex; gap: 2px; align-items: center;">
            ${usageIndicator}
            <span class="type-badge ${type}">${type}</span>
          </div>
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

  if (!isLeader) {
    ui.menuOptions = moves.map((slot, idx) => () => {
      slot.enabled = (slot.enabled === false) ? true : false;
      ui.game.entityManager.setComponent(ui.selectedPokemon, 'pokemonInfo', info);
      
      // Reproducir sonido y refrescar conservando la selección
      ui.sfx.playConfirmSound();
      const savedIndex = ui.selectedIndex;
      openMovesViewMenu(ui);
      ui.selectedIndex = savedIndex;
      ui.updateSelectionVisuals();
    });
  } else {
    ui.menuOptions = moves.map(() => () => {});
  }

  ui.menuOptions.push(() => openPokemonActionsMenu(ui));
  ui.selectedIndex = moves.length;
  ui.updateSelectionVisuals();
}
