import { TILES } from '../map/TileTypes.js';

/**
 * Activa una trampa sobre una entidad.
 * 
 * @param {number} entityId - ID de la entidad
 * @param {Object} entityManager - Gestor de entidades
 * @param {Object} tileMap - Mapa de tiles
 * @param {Object} eventBus - Bus de eventos
 */
export function triggerTrap(entityId, entityManager, tileMap, eventBus) {
  const info = entityManager.getComponent(entityId, 'pokemonInfo');
  const fighter = entityManager.getComponent(entityId, 'fighter');
  const pos = entityManager.getComponent(entityId, 'position');
  
  if (!info || !fighter || !pos) return;

  // Cambiar el tile de la trampa a suelo normal para que no se vuelva a pisar, 
  // o dejarla visible pero inactiva. En Pokémon Mundo Misterioso, las trampas 
  // se revelan y pueden volver a pisarse, pero para simplificar, la consumiremos.
  tileMap.setTile(pos.x, pos.y, TILES.FLOOR.id);
  eventBus.emit('message', `¡${info.name} pisó una trampa oculta!`);

  const trapTypes = ['poison', 'explosion', 'sleep', 'warp', 'grudge'];
  const trapType = trapTypes[Math.floor(Math.random() * trapTypes.length)];

  switch (trapType) {
    case 'poison':
      if (!fighter.statusEffects.some(s => s.type === 'poison') && 
          !info.types.includes('poison') && !info.types.includes('steel')) {
        fighter.statusEffects.push({ type: 'poison', turnsLeft: -1 });
        eventBus.emit('message', `¡La trampa soltó púas tóxicas! ${info.name} fue envenenado.`);
      } else {
        eventBus.emit('message', `La trampa soltó gas venenoso, pero no tuvo efecto.`);
      }
      break;

    case 'explosion':
      const damage = Math.max(1, Math.floor(fighter.maxHp / 2));
      fighter.hp = Math.max(0, fighter.hp - damage);
      eventBus.emit('message', `¡BOOM! Una explosión causó ${damage} PS de daño a ${info.name}.`);
      eventBus.emit('damage_dealt', { defenderId: entityId, damage, isCritical: false });
      
      if (fighter.hp <= 0) {
        eventBus.emit('message', `¡${info.name} se debilitó por la explosión!`);
        const sprite = entityManager.getComponent(entityId, 'sprite');
        eventBus.emit('pokemon_fainted', {
          entityId,
          speciesId: info.speciesId,
          pos: { x: pos.x, y: pos.y },
          spriteUrl: sprite ? sprite.url : ''
        });
      }
      break;

    case 'sleep':
      if (!fighter.statusEffects.some(s => s.type === 'sleep')) {
        fighter.statusEffects.push({ type: 'sleep', turnsLeft: 3 });
        eventBus.emit('message', `¡Una espora somnífera durmió a ${info.name}!`);
      }
      break;

    case 'warp':
      // Buscar un tile de suelo al azar
      let targetX, targetY;
      let maxTries = 100;
      const width = tileMap.getWidth ? tileMap.getWidth() : tileMap.width;
      const height = tileMap.getHeight ? tileMap.getHeight() : tileMap.height;
      
      while (maxTries > 0) {
        const rx = Math.floor(Math.random() * width);
        const ry = Math.floor(Math.random() * height);
        if (tileMap.isWalkable(rx, ry) && !entityManager.getEntityAt(rx, ry)) {
          targetX = rx;
          targetY = ry;
          break;
        }
        maxTries--;
      }

      if (targetX !== undefined) {
        pos.prevX = pos.x;
        pos.prevY = pos.y;
        pos.moveStartTime = performance.now();
        pos.x = targetX;
        pos.y = targetY;
        eventBus.emit('message', `¡${info.name} fue teletransportado a otro lugar!`);
      } else {
        eventBus.emit('message', `¡La trampa de teletransporte falló!`);
      }
      break;
      
    case 'grudge':
      // PP a 0 del primer ataque
      if (info.currentMoves && info.currentMoves.length > 0) {
        info.currentMoves[0].currentPP = 0;
        eventBus.emit('message', `¡La trampa selló el movimiento ${info.currentMoves[0].moveId}!`);
      }
      break;
  }
}
