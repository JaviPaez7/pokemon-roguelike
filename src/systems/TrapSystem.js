/**
 * TrapSystem.js
 * 
 * Sistema que gestiona las trampas en las mazmorras.
 * Define qué tipos de trampa existen y qué efectos tienen al pisarse.
 */

export const TRAP_TYPES = ['poison', 'sleep', 'explosion', 'warp', 'sticky', 'wonder_tile'];

/**
 * Genera trampas aleatorias en el piso.
 * @param {Array} points - Posiciones válidas [{x, y}]
 * @param {number} count - Número de trampas a colocar
 * @param {Object} entityManager - El EntityManager
 */
export function spawnTraps(points, count, entityManager) {
  const availablePoints = [...points];
  
  // Barajar
  for (let i = availablePoints.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availablePoints[i], availablePoints[j]] = [availablePoints[j], availablePoints[i]];
  }

  const actualCount = Math.min(count, availablePoints.length);

  for (let i = 0; i < actualCount; i++) {
    const point = availablePoints[i];
    const type = TRAP_TYPES[Math.floor(Math.random() * TRAP_TYPES.length)];
    // Las Baldosas Milagro siempre son visibles
    const isHidden = type !== 'wonder_tile';
    entityManager.createTrapEntity(type, point.x, point.y, isHidden);
  }
}

/**
 * Activa una trampa sobre una entidad objetivo.
 * @param {number} targetEntityId - Entidad que pisa la trampa
 * @param {number} trapEntityId - Entidad de la trampa
 * @param {Object} entityManager - El EntityManager
 * @param {Object} tileMap - El mapa actual (útil para warp)
 * @returns {Array<string>} Mensajes para el log de combate
 */
export function triggerTrap(targetEntityId, trapEntityId, entityManager, tileMap) {
  const messages = [];
  const trap = entityManager.getComponent(trapEntityId, 'trap');
  const targetInfo = entityManager.getComponent(targetEntityId, 'pokemonInfo');
  const targetFighter = entityManager.getComponent(targetEntityId, 'fighter');

  if (!trap || !targetInfo || !targetFighter) return messages;

  // Revelar la trampa
  trap.isHidden = false;
  entityManager.setComponent(trapEntityId, 'trap', trap);
  
  if (trap.type !== 'wonder_tile') {
    messages.push(`¡${targetInfo.name} ha pisado una trampa!`);
  }

  // Inicializar statusEffects si no existe
  if (!targetFighter.statusEffects) {
    targetFighter.statusEffects = [];
  }

  // Aplicar efecto de la trampa
  switch (trap.type) {
    case 'poison':
      if (!targetFighter.statusEffects.some(s => s.type === 'poison') && 
          !targetInfo.types.includes('poison') && !targetInfo.types.includes('steel')) {
        targetFighter.statusEffects.push({ type: 'poison', turnsLeft: -1 });
        messages.push(`¡La trampa envenenó a ${targetInfo.name}!`);
      } else {
        messages.push(`¡Pero no tuvo ningún efecto en ${targetInfo.name}!`);
      }
      break;

    case 'sleep':
      if (!targetFighter.statusEffects.some(s => s.type === 'sleep')) {
        targetFighter.statusEffects.push({ type: 'sleep', turnsLeft: Math.floor(Math.random() * 3) + 2 });
        messages.push(`¡El gas somnífero durmió a ${targetInfo.name}!`);
      } else {
        messages.push(`¡Pero no tuvo ningún efecto!`);
      }
      break;

    case 'explosion':
      const damage = Math.max(1, Math.floor(targetFighter.maxHp * 0.25)); // 25% del HP máximo
      targetFighter.hp = Math.max(0, targetFighter.hp - damage);
      messages.push(`¡BOOM! ¡La trampa explotó causando ${damage} de daño!`);
      break;

    case 'warp':
      if (tileMap && tileMap.rooms && tileMap.rooms.length > 0) {
        // Elegir una habitación aleatoria
        const randomRoom = tileMap.rooms[Math.floor(Math.random() * tileMap.rooms.length)];
        // Posición aleatoria dentro de la habitación
        const newX = randomRoom.x + Math.floor(Math.random() * randomRoom.w);
        const newY = randomRoom.y + Math.floor(Math.random() * randomRoom.h);
        
        // Comprobar si está libre (podría chocar con otro Pokémon, por simplicidad asumimos que está libre)
        const pos = entityManager.getComponent(targetEntityId, 'position');
        if (pos) {
          pos.x = newX;
          pos.y = newY;
          pos.prevX = newX;
          pos.prevY = newY; // evitar lerp feo
          entityManager.setComponent(targetEntityId, 'position', pos);
          messages.push(`¡${targetInfo.name} ha sido teletransportado!`);
        }
      }
      break;

    case 'sticky':
      if (!targetFighter.statModifiers) targetFighter.statModifiers = {};
      targetFighter.statModifiers.speed = (targetFighter.statModifiers.speed || 0) - 1;
      messages.push(`¡Un moco pegajoso bajó la velocidad de ${targetInfo.name}!`);
      break;

    case 'wonder_tile':
      targetFighter.statModifiers = {};
      messages.push(`¡La Baldosa Milagro purificó y restauró las estadísticas de ${targetInfo.name}!`);
      break;

    default:
      messages.push(`¡Pero la trampa falló!`);
  }

  // Guardar cambios del fighter
  entityManager.setComponent(targetEntityId, 'fighter', targetFighter);

  // Reducir usos (las baldosas milagro son infinitas)
  if (trap.type !== 'wonder_tile') {
    trap.uses--;
    if (trap.uses <= 0) {
      entityManager.destroyEntity(trapEntityId);
      messages.push(`La trampa se rompió.`);
    }
  }

  return messages;
}
