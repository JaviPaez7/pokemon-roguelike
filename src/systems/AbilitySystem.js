/**
 * AbilitySystem.js
 * Sistema de habilidades pasivas de Pokémon.
 * Nombres y tipos en minúsculas para alinear con CombatSystem / pokemon.json.
 */

// Diccionario de habilidades base asignadas por especie (National Dex ID)
const SPECIES_ABILITIES = {
  1: 'overgrow', 2: 'overgrow', 3: 'overgrow', // Bulbasaur line
  4: 'blaze', 5: 'blaze', 6: 'blaze',       // Charmander line
  7: 'torrent', 8: 'torrent', 9: 'torrent',    // Squirtle line
  25: 'static', 26: 'static',               // Pikachu line
  92: 'levitate', 93: 'levitate', 94: 'levitate', // Gastly line
  109: 'levitate', 110: 'levitate',         // Koffing line
  151: 'synchronize',                       // Mew
  74: 'sturdy', 75: 'sturdy', 76: 'sturdy', 95: 'sturdy',
  81: 'lightning_rod', 82: 'lightning_rod',
  12: 'compound_eyes',
  143: 'thick_fat',
  128: 'intimidate', 130: 'intimidate',
  37: 'flash_fire', 38: 'flash_fire', // Vulpix/Ninetales
  60: 'water_absorb', 61: 'water_absorb', 62: 'water_absorb', // Poliwag line
  100: 'static', 101: 'static', // Voltorb
  120: 'natural_cure', 121: 'natural_cure', // Staryu
  129: 'swift_swim', // Magikarp
  133: 'run_away', 134: 'water_absorb', 135: 'flash_fire', 136: 'flash_fire', // Eevee line simplified
  39: 'cute_charm', 40: 'cute_charm',
  63: 'synchronize', 64: 'synchronize', 65: 'synchronize',
  96: 'insomnia', 97: 'insomnia',
  27: 'sand_veil', 28: 'sand_veil',
  48: 'compound_eyes', 49: 'compound_eyes',
  46: 'effect_spore', 47: 'effect_spore',
  69: 'chlorophyll', 70: 'chlorophyll', 71: 'chlorophyll',
  43: 'chlorophyll', 44: 'chlorophyll', 45: 'chlorophyll',
  14: 'shed_skin', 15: 'swarm',
  10: 'shield_dust', 11: 'shed_skin',
  16: 'keen_eye', 17: 'keen_eye', 18: 'keen_eye',
  19: 'run_away', 20: 'run_away',
  21: 'keen_eye', 22: 'keen_eye',
  23: 'shed_skin', 24: 'intimidate',
  29: 'poison_point', 30: 'poison_point', 31: 'poison_point',
  32: 'poison_point', 33: 'poison_point', 34: 'poison_point',
  41: 'inner_focus', 42: 'inner_focus',
  54: 'damp', 55: 'damp',
  56: 'vital_spirit', 57: 'vital_spirit',
  66: 'guts', 67: 'guts', 68: 'guts',
  72: 'clear_body', 73: 'clear_body',
  79: 'oblivious', 80: 'oblivious',
  84: 'run_away', 85: 'run_away',
  86: 'thick_fat', 87: 'thick_fat',
  88: 'stench', 89: 'stench',
  90: 'shell_armor', 91: 'shell_armor',
  98: 'hyper_cutter', 99: 'hyper_cutter',
  104: 'rock_head', 105: 'rock_head',
  106: 'limber', 107: 'iron_fist',
  111: 'lightning_rod', 112: 'lightning_rod',
  113: 'natural_cure', 115: 'early_bird',
  116: 'swift_swim', 117: 'swift_swim',
  118: 'swift_swim', 119: 'swift_swim',
  122: 'soundproof', 123: 'swarm',
  124: 'oblivious', 125: 'static', 126: 'flame_body',
  127: 'hyper_cutter', 131: 'water_absorb',
  137: 'trace', 138: 'shell_armor', 139: 'shell_armor',
  140: 'battle_armor', 141: 'battle_armor',
  142: 'rock_head', 144: 'pressure', 145: 'pressure', 146: 'pressure',
  147: 'shed_skin', 148: 'shed_skin', 149: 'inner_focus',
  150: 'pressure',
  52: 'pickup', 53: 'pickup', 132: 'limber'
};

/**
 * Obtiene la habilidad de un Pokémon basado en su ID de especie o tipos.
 * @param {Object} pokemonInfo - Datos del pokemon
 * @returns {string|null} Nombre de la habilidad o null
 */
export function getAbility(pokemonInfo) {
  if (!pokemonInfo) return null;

  // Preferir habilidad ya asignada en la entidad (ignorar 'none')
  if (pokemonInfo.ability) {
    const assigned = String(pokemonInfo.ability).toLowerCase().replace(/-/g, '_');
    if (assigned && assigned !== 'none' && assigned !== 'null') {
      return assigned;
    }
  }

  if (SPECIES_ABILITIES[pokemonInfo.speciesId]) {
    return SPECIES_ABILITIES[pokemonInfo.speciesId];
  }

  const types = (pokemonInfo.types || []).map(t => String(t).toLowerCase());
  if (types.includes('flying')) {
    return 'flying_type';
  }

  return null;
}

/**
 * Aplica modificadores pre-combate (durante el cálculo de daño)
 */
export function applyPreAttackAbilities(attackerAbility, attackerFighter, defenderAbility, defenderFighter, move, damage, effectiveness) {
  let modifiedDamage = damage;
  let modifiedEffectiveness = effectiveness;
  let messages = [];

  const atkAbility = attackerAbility ? String(attackerAbility).toLowerCase() : null;
  const defAbility = defenderAbility ? String(defenderAbility).toLowerCase() : null;
  const moveType = move.type ? String(move.type).toLowerCase() : '';

  const attackerHpPercent = attackerFighter.hp / attackerFighter.maxHp;

  if (atkAbility === 'overgrow' && moveType === 'grass' && attackerHpPercent <= 0.33) {
    modifiedDamage *= 1.5;
    messages.push('¡Espesura potenció el ataque!');
  }
  if (atkAbility === 'blaze' && moveType === 'fire' && attackerHpPercent <= 0.33) {
    modifiedDamage *= 1.5;
    messages.push('¡Mar Llamas potenció el ataque!');
  }
  if (atkAbility === 'torrent' && moveType === 'water' && attackerHpPercent <= 0.33) {
    modifiedDamage *= 1.5;
    messages.push('¡Torrente potenció el ataque!');
  }
  if (atkAbility === 'swarm' && moveType === 'bug' && attackerHpPercent <= 0.33) {
    modifiedDamage *= 1.5;
    messages.push('¡Enjambre potenció el ataque!');
  }

  if (defAbility === 'levitate' && moveType === 'ground') {
    modifiedEffectiveness = 0;
    modifiedDamage = 0;
    messages.push('¡No afectó debido a Levitación!');
  }
  if ((defAbility === 'flash_fire' || defAbility === 'flashfire') && moveType === 'fire') {
    modifiedEffectiveness = 0;
    modifiedDamage = 0;
    if (!defenderFighter.statModifiers) defenderFighter.statModifiers = {};
    defenderFighter.statModifiers.spAtk = Math.min(6, (defenderFighter.statModifiers.spAtk || 0) + 1);
    messages.push('¡Absorbe Fuego anuló el fuego y subió At. Esp.!');
  }
  if ((defAbility === 'water_absorb' || defAbility === 'waterabsorb') && moveType === 'water') {
    modifiedEffectiveness = 0;
    modifiedDamage = 0;
    const heal = Math.max(1, Math.floor(defenderFighter.maxHp / 4));
    defenderFighter.hp = Math.min(defenderFighter.maxHp, defenderFighter.hp + heal);
    messages.push(`¡Absorbe Agua curó ${heal} PS!`);
  }
  if ((defAbility === 'volt_absorb' || defAbility === 'voltabsorb') && moveType === 'electric') {
    modifiedEffectiveness = 0;
    modifiedDamage = 0;
    const heal = Math.max(1, Math.floor(defenderFighter.maxHp / 4));
    defenderFighter.hp = Math.min(defenderFighter.maxHp, defenderFighter.hp + heal);
    messages.push(`¡Absorbe Elec. curó ${heal} PS!`);
  }

  return { damage: modifiedDamage, effectiveness: modifiedEffectiveness, messages };
}

/**
 * Aplica efectos post-combate (después de resolver el golpe)
 */
export function applyPostAttackAbilities(attackerAbility, attackerFighter, defenderAbility, defenderFighter, move) {
  let messages = [];
  const defAbility = defenderAbility ? String(defenderAbility).toLowerCase().replace(/-/g, '_') : null;
  const isContact = move.damageClass === 'physical';

  if (!isContact || !attackerFighter) return { messages };

  const majors = ['burn', 'poison', 'paralyze', 'freeze', 'sleep'];
  const pushStatus = (type, turns, msg) => {
    if (!attackerFighter.statusEffects) attackerFighter.statusEffects = [];
    if (majors.includes(type) && attackerFighter.statusEffects.some(s => majors.includes(s.type))) return;
    if (attackerFighter.statusEffects.some(s => s.type === type)) return;
    attackerFighter.statusEffects.push({ type, turnsLeft: turns });
    messages.push(msg);
  };

  if (defAbility === 'static' && Math.random() < 0.30) {
    pushStatus('paralyze', 3, '¡Elec. Estática paralizó al atacante!');
  }
  if (defAbility === 'poison_point' && Math.random() < 0.30) {
    pushStatus('poison', 5, '¡Punto Tóxico envenenó al atacante!');
  }
  if (defAbility === 'flame_body' && Math.random() < 0.30) {
    pushStatus('burn', 5, '¡Cuerpo Llama quemó al atacante!');
  }
  if (defAbility === 'effect_spore' && Math.random() < 0.30) {
    const roll = Math.random();
    if (roll < 0.33) pushStatus('poison', 5, '¡Efecto Espora envenenó al atacante!');
    else if (roll < 0.66) pushStatus('paralyze', 3, '¡Efecto Espora paralizó al atacante!');
    else pushStatus('sleep', 2, '¡Efecto Espora durmió al atacante!');
  }
  if (defAbility === 'cute_charm' && Math.random() < 0.30) {
    if (!attackerFighter.statusEffects) attackerFighter.statusEffects = [];
    if (!attackerFighter.statusEffects.some(s => s.type === 'confuse')) {
      attackerFighter.statusEffects.push({ type: 'confuse', turnsLeft: 3 });
      messages.push('¡Gran Encanto confunde al atacante!');
    }
  }
  if (defAbility === 'stench' && Math.random() < 0.20) {
    attackerFighter.flinched = true;
    messages.push('¡Hedor hizo retroceder al atacante!');
  }

  return { messages };
}


/** Rastro: copia la habilidad del rival al recibir o dar un golpe de contacto */
export function tryTraceAbility(tracerInfo, foeInfo, messages) {
  if (!tracerInfo || !foeInfo) return false;
  if (getAbility(tracerInfo) !== 'trace') return false;
  if (tracerInfo._traced) return false;
  const foeAb = getAbility(foeInfo);
  if (!foeAb || foeAb === 'trace') return false;
  tracerInfo.ability = foeAb;
  tracerInfo._traced = true;
  const ABILITY_ES = {
    flash_fire: 'Absorbe Fuego', water_absorb: 'Absorbe Agua', volt_absorb: 'Absorbe Elec.',
    intimidate: 'Intimidación', intimidation: 'Intimidación', levitate: 'Levitación',
    sturdy: 'Robustez', static: 'Elec. Estática', guts: 'Agallas', blaze: 'Mar Llamas',
    torrent: 'Torrente', overgrow: 'Espesura', swarm: 'Enjambre', pickup: 'Recogida',
    clear_body: 'Cuerpo Puro', hyper_cutter: 'Corte Fuerte', limber: 'Flexibilidad',
    insomnia: 'Insomnio', vital_spirit: 'Espíritu Vital', early_bird: 'Madrugar',
    shed_skin: 'Mudar', rock_head: 'Cabeza Roca', shell_armor: 'Caparazón',
    battle_armor: 'Armadura Batalla', damp: 'Humedad', iron_fist: 'Puño Férreo',
    soundproof: 'Insonorizar', shield_dust: 'Polvo Escudo', cute_charm: 'Gran Encanto',
    stench: 'Hedor', swift_swim: 'Nado Rápido', synchronize: 'Sincronía',
    pressure: 'Presión', inner_focus: 'Foco Interno', thick_fat: 'Sebo',
    compound_eyes: 'Ojo compuesto', lightning_rod: 'Pararrayos', run_away: 'Fuga',
    poison_point: 'Punto Tóxico', flame_body: 'Cuerpo Llama', effect_spore: 'Efecto Espora',
    chlorophyll: 'Clorofila', sand_veil: 'Velo Arena', ice_body: 'Cuerpo Gel',
    keen_eye: 'Vista Lince', natural_cure: 'Cura Natural', oblivious: 'Despiste',
    huge_power: 'Potencia', pure_power: 'Energía Pura', wonder_guard: 'Superguarda'
  };
  const abLabel = ABILITY_ES[foeAb] || foeAb.replace(/_/g, ' ');
  messages.push(`¡Rastro copió la habilidad ${abLabel}!`);
  return true;
}
