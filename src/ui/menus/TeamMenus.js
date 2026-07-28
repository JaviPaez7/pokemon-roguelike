import { openPauseMenu } from './PauseMenu.js';
import { checkEvolution } from '../../systems/EvolutionSystem.js';
import { openEvolutionMenu } from './EvolutionMenu.js';
import { GAME_STATES, TYPE_NAMES_ES } from '../../constants.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function openTeamMenu(ui) {
  ui.currentMenuType = 'team';
  ui.game.changeState(GAME_STATES.MENU);
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
    const faintedTag = poke.hp <= 0 ? '<span style="color: #ff6666; font-size: 5px; font-weight: bold;">[DEBILITADO]</span>' : '';
    const tacticText = !poke.isLeader && poke.hp > 0
      ? `<span style="color: var(--text-accent); font-size: 5px; font-weight: bold; background: rgba(0,204,255,0.1); padding: 1px 3px; border-radius: 2px;">${tacticasNombres[poke.tactic || 'follow']}</span>`
      : '';

    html += `
      <div class="menu-option" data-index="${idx}" style="flex-direction: column; align-items: flex-start; gap: 2px; opacity: ${poke.hp <= 0 ? '0.7' : '1'};">
        <div style="display: flex; justify-content: space-between; width: 100%;">
          <span><span class="cursor">▶</span> ${poke.name}</span>
          <span>Nv.${poke.level} ${leaderIndicator} ${faintedTag}</span>
        </div>
        <div style="font-size: 6px; color: var(--text-secondary); margin-left: 12px; display: flex; justify-content: space-between; width: calc(100% - 12px); align-items: center;">
          <span style="color:${poke.hp <= 0 ? '#f66' : (poke.hp / poke.maxHp < 0.25 ? '#fa4' : '#8f8')};">PS: ${poke.hp}/${poke.maxHp}</span>
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
const ABILITY_ES = {
  overgrow: 'Espesura', blaze: 'Mar Llamas', torrent: 'Torrente',
  static: 'Elec. Estática', chlorophyll: 'Clorofila', swarm: 'Enjambre',
  guts: 'Agallas', intimidate: 'Intimidación', intimidation: 'Intimidación',
  flashfire: 'Absorbe Fuego',
  flash_fire: 'Absorbe Fuego', levitate: 'Levitación', pressure: 'Presión',
  synchronize: 'Sincronía', sturdy: 'Robustez', keeneye: 'Vista Lince',
  'keen-eye': 'Vista Lince', keen_eye: 'Vista Lince', runaway: 'Fuga',
  'run-away': 'Fuga', run_away: 'Fuga', pickup: 'Recogida',
  flying_type: 'Alas (tipo)', wonder_guard: 'Superguarda', none: 'Ninguna',
  poison_point: 'Punto Tóxico', flame_body: 'Cuerpo Llama',
  effect_spore: 'Efecto Espora', water_absorb: 'Absorbe Agua',
  volt_absorb: 'Absorbe Elec.', sand_veil: 'Velo Arena',
  inner_focus: 'Foco Interno', ice_body: 'Cuerpo Gel',
  thick_fat: 'Sebo', huge_power: 'Potencia', pure_power: 'Energía Pura',
  compound_eyes: 'Ojo compuesto', compoundeyes: 'Ojo compuesto',
  lightning_rod: 'Pararrayos', lightningrod: 'Pararrayos',
  swift_swim: 'Nado Rápido', rock_head: 'Cabeza Roca', shell_armor: 'Caparazón',
  battle_armor: 'Armadura Batalla', limber: 'Flexibilidad', insomnia: 'Insomnio',
  vital_spirit: 'Espíritu Vital', early_bird: 'Madrugar', shed_skin: 'Mudar',
  clear_body: 'Cuerpo Puro', hyper_cutter: 'Corte Fuerte', cute_charm: 'Gran Encanto',
  stench: 'Hedor', damp: 'Humedad', natural_cure: 'Cura Natural', shield_dust: 'Polvo Escudo',
  iron_fist: 'Puño Férreo', soundproof: 'Insonorizar', oblivious: 'Despiste',
  trace: 'Rastro', flame_body: 'Cuerpo Llama'
};

export function openPokemonActionsMenu(ui) {
  const info = ui.game.entityManager.getComponent(ui.selectedPokemon, 'pokemonInfo');
  const fighter = ui.game.entityManager.getComponent(ui.selectedPokemon, 'fighter');
  const isLeader = (ui.selectedPokemon === ui.game._playerId);

  // ¿Puede evolucionar por nivel? (incluso si canceló antes)
  const declined = info.evolutionDeclinedAtLevel;
  info.evolutionDeclinedAtLevel = null;
  const evoAvailable = checkEvolution(info, ui.game.evolutionsData);
  info.evolutionDeclinedAtLevel = declined;
  const canRetryEvo = !!evoAvailable;

  const rawAbility = (info.ability || '').toLowerCase().replace(/\s+/g, '_');
  const abilityKey = rawAbility.replace(/-/g, '_');
  const abilityLabel = ABILITY_ES[abilityKey] || ABILITY_ES[rawAbility] || info.ability || 'Ninguna';

  const options = [];
  options.push({ label: 'Establecer como Líder', action: () => {
    const selectedId = ui.selectedPokemon;
    const oldLeaderId = ui.game._playerId;

    if (!fighter || fighter.hp <= 0) {
      ui.showDialog('¡Un Pokémon debilitado no puede liderar el equipo!', () => openTeamMenu(ui));
      return;
    }
    if (isLeader) {
      ui.showDialog('¡Este Pokémon ya es el líder del equipo!', () => openPokemonActionsMenu(ui));
      return;
    }

    const oldLeaderMem = ui.game.entityManager.getComponent(oldLeaderId, 'partyMember');
    const newLeaderMem = ui.game.entityManager.getComponent(selectedId, 'partyMember');

    if (oldLeaderMem && newLeaderMem) {
      const oldSlot = oldLeaderMem.slot;
      const newSlot = newLeaderMem.slot;
      oldLeaderMem.slot = newSlot;
      oldLeaderMem.isLeader = false;
      newLeaderMem.slot = oldSlot;
      newLeaderMem.isLeader = true;
      ui.game.entityManager.setComponent(oldLeaderId, 'partyMember', oldLeaderMem);
      ui.game.entityManager.setComponent(selectedId, 'partyMember', newLeaderMem);
      ui.game.entityManager.setComponent(oldLeaderId, 'aiControlled', {
        behavior: 'follower', detectRange: 5, alertedTo: null
      });
      ui.game.entityManager.removeComponent(selectedId, 'aiControlled');
      ui.game._playerId = selectedId;
      ui.game.turnManager.setPlayerEntityId(selectedId);
      ui.game.playerPathHistory = [];
      ui.showDialog(`¡${info.name} ahora lidera el equipo!`, () => openTeamMenu(ui));
    } else {
      ui.showDialog('Error al cambiar de líder.', () => openTeamMenu(ui));
    }
  }});

  if (!isLeader) {
    options.push({ label: 'Cambiar táctica', action: () => openTacticSelectMenu(ui) });
  }
  options.push({ label: 'Ver movimientos', action: () => openMovesViewMenu(ui) });

  if (canRetryEvo) {
    options.push({
      label: 'Intentar evolucionar',
      action: () => {
        info.evolutionDeclinedAtLevel = null;
        info.pendingEvolution = null;
        ui.game.entityManager.setComponent(ui.selectedPokemon, 'pokemonInfo', info);
        ui.game.changeState(GAME_STATES.MENU);
        openEvolutionMenu(ui, ui.selectedPokemon, evoAvailable, {});
      }
    });
  }

  options.push({ label: 'Atrás', action: () => openTeamMenu(ui) });

  let html = `
    <div class="game-panel" style="width: 300px;">
      <h2 class="game-panel-title" style="text-transform: uppercase;">${info.name}</h2>
      <div style="font-size: 6px; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.5;">
        Nivel: ${info.level} | Tipos: ${(info.types || []).map(t => TYPE_NAMES_ES[t] || t).join('/')}<br/>
        Habilidad: <span style="color: #ffcc00;">${abilityLabel}</span><br/>
        ATQ: ${fighter.attack} DEF: ${fighter.defense} ESP: ${fighter.spAtk} VEL: ${fighter.speed}
      </div>
      <div id="options-list">
  `;
  options.forEach((opt, idx) => {
    html += `<div class="menu-option${idx === 0 ? ' selected' : ''}" data-index="${idx}"><span class="cursor">▶</span> ${opt.label}</div>`;
  });
  html += `</div></div>`;

  ui.showMenu('pokemon_actions', html);
  ui.menuOptions = options.map(o => o.action);
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
            <span class="type-badge ${type}">${TYPE_NAMES_ES[type] || type}</span>
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
