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

}
