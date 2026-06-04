/**
 * WeatherSystem.js
 * Sistema de clima y efectos ambientales para PokéRogue.
 * 
 * Climas:
 * - normal: Sin efectos
 * - lluvia: +30% daño Agua, -30% daño Fuego
 * - sol: +30% daño Fuego, -30% daño Agua
 * - tormenta_arena: -1 PS por turno a Pokémon que no sean Roca, Tierra o Acero
 * - granizo: -1 PS por turno a Pokémon que no sean Hielo
 */

export class WeatherSystem {
  constructor() {
    this.weatherTypes = ['normal', 'lluvia', 'sol', 'tormenta_arena', 'granizo'];
  }

  /**
   * Genera el clima para el piso actual.
   * Probabilidad base de clima: 20%.
   * 
   * @param {Object} game - Instancia del juego
   */
  generateFloorWeather(game) {
    if (game._currentFloor === 1) {
      game.currentWeather = 'normal';
      return;
    }

    // 20% de probabilidad de tener clima
    if (Math.random() < 0.2) {
      const activeWeathers = ['lluvia', 'sol', 'tormenta_arena', 'granizo'];
      game.currentWeather = activeWeathers[Math.floor(Math.random() * activeWeathers.length)];
      
      let message = '';
      switch (game.currentWeather) {
        case 'lluvia':
          message = '¡Está empezando a llover! 🌧️';
          break;
        case 'sol':
          message = '¡El sol brilla intensamente! ☀️';
          break;
        case 'tormenta_arena':
          message = '¡Una tormenta de arena se levanta! 🌪️';
          break;
        case 'granizo':
          message = '¡Empieza a caer granizo! 🌨️';
          break;
      }
      game.eventBus.emit('message', message);
    } else {
      game.currentWeather = 'normal';
    }
  }

  /**
   * Aplica los efectos del clima al final de cada turno.
   * @param {Object} game - Instancia del juego
   */
  applyEndTurnEffects(game) {
    const weather = game.currentWeather;
    if (weather === 'normal' || weather === 'lluvia' || weather === 'sol') return;

    // Obtener todos los Pokémon en juego
    const entities = game.entityManager.getEntitiesWithComponents('fighter', 'pokemonInfo');

    entities.forEach(entityId => {
      const fighter = game.entityManager.getComponent(entityId, 'fighter');
      const info = game.entityManager.getComponent(entityId, 'pokemonInfo');
      
      if (!fighter || !info || fighter.hp <= 0) return;

      const types = info.types || [];
      let isImmune = false;

      if (weather === 'tormenta_arena') {
        // Inmunes: roca, tierra, acero (rock, ground, steel)
        isImmune = types.some(t => t.toLowerCase() === 'rock' || t.toLowerCase() === 'ground' || t.toLowerCase() === 'steel');
        if (!isImmune) {
          fighter.hp = Math.max(0, fighter.hp - 1);
          game.entityManager.setComponent(entityId, 'fighter', fighter);
          
          // Mostrar mensaje solo si es del equipo del jugador o está en FOV
          const isPlayerTeam = game.entityManager.hasComponent(entityId, 'partyMember');
          if (isPlayerTeam) {
            game.eventBus.emit('message', `¡La tormenta de arena daña a ${info.name}!`);
          }

          if (fighter.hp <= 0) {
            this._handleFainted(game, entityId, info);
          }
        }
      } else if (weather === 'granizo') {
        // Inmunes: hielo (ice)
        isImmune = types.some(t => t.toLowerCase() === 'ice');
        if (!isImmune) {
          fighter.hp = Math.max(0, fighter.hp - 1);
          game.entityManager.setComponent(entityId, 'fighter', fighter);

          const isPlayerTeam = game.entityManager.hasComponent(entityId, 'partyMember');
          if (isPlayerTeam) {
            game.eventBus.emit('message', `¡El granizo daña a ${info.name}!`);
          }

          if (fighter.hp <= 0) {
            this._handleFainted(game, entityId, info);
          }
        }
      }
    });

    game.needsRender = true;
  }

  /**
   * Maneja el debilitamiento por clima
   */
  _handleFainted(game, entityId, info) {
    game.eventBus.emit('message', `¡${info.name} se ha debilitado por el clima!`);
    
    const isPlayer = (entityId === game._playerId);
    
    if (isPlayer) {
      // El líder cayó debilitado: intentar rotar líder
      const party = game.entityManager.getEntitiesWithComponents('partyMember', 'fighter')
        .filter(pid => pid !== entityId);
      
      const nextActive = party.find(pid => {
        const f = game.entityManager.getComponent(pid, 'fighter');
        return f && f.hp > 0;
      });

      if (nextActive) {
        // Cambiar líder
        game.swapLeader();
      } else {
        // Fin de la partida
        game.gameOver();
      }
    } else {
      // Es un enemigo o seguidor debilitado
      const pos = game.entityManager.getComponent(entityId, 'position');
      const sprite = game.entityManager.getComponent(entityId, 'sprite');
      
      game.eventBus.emit('pokemon_fainted', {
        entityId: entityId,
        speciesId: info.speciesId,
        pos: pos ? { x: pos.x, y: pos.y } : null,
        spriteUrl: sprite ? sprite.url : ''
      });
    }
  }
}
