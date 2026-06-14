/**
 * CaptureSystem.js — Sistema de captura de Pokémon
 * Fórmula de captura simplificada basada en Gen 1
 */

/**
 * Intenta capturar un Pokémon
 * @param {Object} targetFighter - Fighter component del Pokémon objetivo
 * @param {Object} targetInfo - PokemonInfo del Pokémon objetivo  
 * @param {Object} ball - Datos del item Poké Ball usado
 * @param {Object} pokemonDB - Base de datos de Pokémon (pokemon.json)
 * @returns {Object} { success, shakes, messages }
 */
export function attemptCapture(targetFighter, targetInfo, ball, pokemonDB) {
  const messages = [];
  
  // Obtener capture rate de la especie
  const speciesData = pokemonDB.find(p => p.id === targetInfo.speciesId);
  if (!speciesData) {
    return { success: false, shakes: 0, messages: ['Error: especie no encontrada'] };
  }

  const captureRate = speciesData.captureRate || 45;
  const ballBonus = ball.captureBonus || 1.0;
  const maxHp = targetFighter.maxHp;
  const currentHp = targetFighter.hp;

  // Fórmula de captura (simplificada de Gen 1)
  // rate = (3 * maxHp - 2 * currentHp) * captureRate * ballBonus / (3 * maxHp)
  const rate = ((3 * maxHp - 2 * currentHp) * captureRate * ballBonus) / (3 * maxHp);
  
  // Bonus por estado alterado
  let statusBonus = 1;
  if (targetFighter.statusEffects && targetFighter.statusEffects.length > 0) {
    if (targetFighter.statusEffects.some(s => s.type === 'sleep') || targetFighter.statusEffects.some(s => s.type === 'freeze')) {
      statusBonus = 2;
    } else if (targetFighter.statusEffects.some(s => s.type === 'paralyze') || 
               targetFighter.statusEffects.some(s => s.type === 'burn') || 
               targetFighter.statusEffects.some(s => s.type === 'poison')) {
      statusBonus = 1.5;
    }
  }

  const finalRate = Math.min(rate * statusBonus, 255);

  // Simular 3 shakes
  let shakes = 0;
  const shakeThreshold = 65536 / Math.pow(255 / Math.max(1, finalRate), 0.1875);
  
  for (let i = 0; i < 3; i++) {
    const roll = Math.random() * 65536;
    if (roll < shakeThreshold) {
      shakes++;
    } else {
      break;
    }
  }

  // Captura exitosa si pasó los 3 shakes
  const success = shakes >= 3;

  // Generar mensajes
  messages.push(`¡Lanzaste una ${ball.name}!`);
  
  if (success) {
    messages.push(`¡Gotcha! ¡${targetInfo.name} fue capturado!`);
  } else {
    const failMessages = [
      '¡Oh no! ¡El Pokémon se liberó!',
      '¡Casi lo tenías!',
      '¡El Pokémon escapó de la Ball!'
    ];
    messages.push(failMessages[Math.min(shakes, failMessages.length - 1)]);
  }

  return { success, shakes, messages };
}

/**
 * Calcula la probabilidad de captura para mostrar en UI
 * @param {Object} targetFighter - Fighter del objetivo
 * @param {Object} targetInfo - PokemonInfo del objetivo
 * @param {Object} ball - Datos de la Ball
 * @param {Object} pokemonDB - Base de datos
 * @returns {number} Probabilidad aproximada (0-100%)
 */
export function getCaptureChance(targetFighter, targetInfo, ball, pokemonDB) {
  const speciesData = pokemonDB.find(p => p.id === targetInfo.speciesId);
  if (!speciesData) return 0;

  const captureRate = speciesData.captureRate || 45;
  const ballBonus = ball.captureBonus || 1.0;
  const maxHp = targetFighter.maxHp;
  const currentHp = targetFighter.hp;

  const rate = ((3 * maxHp - 2 * currentHp) * captureRate * ballBonus) / (3 * maxHp);
  
  let statusBonus = 1;
  if (targetFighter.statusEffects && targetFighter.statusEffects.length > 0) {
    if (targetFighter.statusEffects.some(s => s.type === 'sleep') || targetFighter.statusEffects.some(s => s.type === 'freeze')) {
      statusBonus = 2;
    } else if (targetFighter.statusEffects.some(s => s.type === 'paralyze') || 
               targetFighter.statusEffects.some(s => s.type === 'burn') || 
               targetFighter.statusEffects.some(s => s.type === 'poison')) {
      statusBonus = 1.5;
    }
  }

  const finalRate = Math.min(rate * statusBonus, 255);
  // Probabilidad aproximada de pasar los 3 shakes
  const shakeProb = Math.pow(finalRate / 255, 0.75);
  return Math.round(shakeProb * 100);
}
