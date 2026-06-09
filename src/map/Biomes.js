/**
 * Biomes.js
 * Define los diferentes biomas estéticos para la generación de la mazmorra.
 * Cada bioma tiene colores específicos para el suelo, paredes, pasillos y elementos especiales.
 */

export const BIOMES = {
  FOREST: {
    name: 'Bosque Misterioso',
    floor: '#2d4c1e',
    wall: '#1a2f11',
    corridor: '#3a5f27',
    stairs: '#8b5a2b',
    water: '#3b8b88',
    gridLines: 'rgba(0, 0, 0, 0.15)',
    void: '#0a1405'
  },
  CAVE: {
    name: 'Cueva Rocosa',
    floor: '#4a4a50',
    wall: '#2b2b30',
    corridor: '#5c5c63',
    stairs: '#808080',
    water: '#2c3e50',
    gridLines: 'rgba(0, 0, 0, 0.2)',
    void: '#111114'
  },
  VOLCANO: {
    name: 'Caverna Volcánica',
    floor: '#5c2a2a',
    wall: '#3b1414',
    corridor: '#7a3b3b',
    stairs: '#3b1414',
    water: '#cc4400', // Lava
    gridLines: 'rgba(0, 0, 0, 0.25)',
    void: '#210808'
  },
  ICE_RUINS: {
    name: 'Ruinas Heladas',
    floor: '#a5c8d6',
    wall: '#6b92a3',
    corridor: '#badeeb',
    stairs: '#ffffff',
    water: '#56a0d3',
    gridLines: 'rgba(255, 255, 255, 0.1)',
    void: '#2c4352'
  },
  CELESTIAL_TOWER: {
    name: 'Torre Celestial',
    floor: '#d6cd98',
    wall: '#9c9264',
    corridor: '#ebe2ab',
    stairs: '#ffea00',
    water: '#87ceeb', // Nubes
    gridLines: 'rgba(0, 0, 0, 0.1)',
    void: '#4a4530'
  }
};

/**
 * Obtiene el bioma correspondiente según el piso actual.
 * @param {number} floor - Piso actual (1-50)
 * @returns {Object} Bioma configurado
 */
export function getBiomeForFloor(floor) {
  if (floor <= 10) return BIOMES.FOREST;
  if (floor <= 20) return BIOMES.CAVE;
  if (floor <= 30) return BIOMES.VOLCANO;
  if (floor <= 40) return BIOMES.ICE_RUINS;
  return BIOMES.CELESTIAL_TOWER;
}
