import { RNG } from 'rot-js';
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

/**
 * Probabilidad de que un piso tenga clima y climas posibles. Una zona puede
 * fijar los suyos con `weather` en floors.json (granizo en la Cumbre Escarcha).
 * - Pisos 1-3: sin clima dañino.
 * - Pisos 4-7: 20 %, solo lluvia o sol.
 * - Desde el 8: 20 %, también tormenta de arena y granizo.
 * @param {number} floor - Piso global
 * @param {{ weather?: { chance: number, types: string[] } } | null} [zone]
 * @returns {{ chance: number, types: string[] }}
 */
export function weatherOptions(floor, zone = null) {
  if (floor <= 3) return { chance: 0, types: [] };
  if (zone?.weather) return zone.weather;
  return { chance: 0.2, types: floor < 8 ? ['lluvia', 'sol'] : ['lluvia', 'sol', 'tormenta_arena', 'granizo'] };
}

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
    const floor = game._currentFloor || 1;
    const { chance, types } = weatherOptions(floor, game.floorManager?.getZoneConfig?.());
    if (chance <= 0 || types.length === 0) {
      game.currentWeather = 'normal';
      return;
    }

    if (RNG.getUniform() < chance) {
      game.currentWeather = types[Math.floor(RNG.getUniform() * types.length)];
      
      let message = '';
      switch (game.currentWeather) {
        case 'lluvia':
          message = '¡Está empezando a llover!';
          break;
        case 'sol':
          message = '¡El sol brilla intensamente!';
          break;
        case 'tormenta_arena':
          message = '¡Una tormenta de arena se levanta!';
          break;
        case 'granizo':
          message = '¡Empieza a caer granizo!';
          break;
      }
      game.eventBus.emit('message', message);
    } else {
      game.currentWeather = 'normal';
    }
  }

}
