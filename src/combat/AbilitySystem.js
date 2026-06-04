/**
 * AbilitySystem.js
 * Sistema de habilidades pasivas de Pokémon.
 */

// Diccionario de habilidades base asignadas por especie (National Dex ID)
const SPECIES_ABILITIES = {
  1: 'Overgrow', 2: 'Overgrow', 3: 'Overgrow', // Bulbasaur line
  4: 'Blaze', 5: 'Blaze', 6: 'Blaze',       // Charmander line
  7: 'Torrent', 8: 'Torrent', 9: 'Torrent',    // Squirtle line
  25: 'Static', 26: 'Static',               // Pikachu line
  92: 'Levitate', 93: 'Levitate', 94: 'Levitate', // Gastly line
  109: 'Levitate', 110: 'Levitate',         // Koffing line
  151: 'Synchronize'                        // Mew
};

/**
 * Obtiene la habilidad de un Pokémon basado en su ID de especie o tipos.
 * @param {Object} pokemonInfo - Datos del pokemon
 * @returns {string|null} Nombre de la habilidad o null
 */
export function getAbility(pokemonInfo) {
  if (!pokemonInfo) return null;
  
  if (SPECIES_ABILITIES[pokemonInfo.speciesId]) {
    return SPECIES_ABILITIES[pokemonInfo.speciesId];
  }

  // Asignaciones por defecto basadas en tipo si no tienen una específica
  if (pokemonInfo.types.includes('Flying')) {
    // Para simplificar, Volador se considera similar a Levitación mecánicamente
    // aunque en los juegos originales no es exactamente una habilidad.
    // Usaremos esto para trampas.
    return 'Flying_Type';
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

  // --- Habilidades del Atacante ---
  const attackerHpPercent = attackerFighter.hp / attackerFighter.maxHp;

  if (attackerAbility === 'Overgrow' && move.type === 'Grass' && attackerHpPercent <= 0.33) {
    modifiedDamage *= 1.5;
  }
  if (attackerAbility === 'Blaze' && move.type === 'Fire' && attackerHpPercent <= 0.33) {
    modifiedDamage *= 1.5;
  }
  if (attackerAbility === 'Torrent' && move.type === 'Water' && attackerHpPercent <= 0.33) {
    modifiedDamage *= 1.5;
  }

  // --- Habilidades del Defensor ---
  if (defenderAbility === 'Levitate' && move.type === 'Ground') {
    modifiedEffectiveness = 0;
    modifiedDamage = 0;
    messages.push('¡No afectó debido a Levitación!');
  }

  return { damage: modifiedDamage, effectiveness: modifiedEffectiveness, messages };
}

/**
 * Aplica efectos post-combate (después de resolver el golpe)
 */
export function applyPostAttackAbilities(attackerAbility, attackerFighter, defenderAbility, defenderFighter, move) {
  let messages = [];

  // --- Habilidades de Reacción del Defensor ---
  // Ejemplo: Static paraliza al atacante con 30% prob si es un ataque de contacto (físico)
  if (defenderAbility === 'Static' && move.damageClass === 'physical') {
    if (Math.random() < 0.30) {
      if (!attackerFighter.status) {
        attackerFighter.status = 'paralyzed';
        messages.push(`¡Electricidad Estática paralizó al atacante!`);
      }
    }
  }

  return { messages };
}
