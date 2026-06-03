/**
 * TileTypes.js
 * 
 * Definiciones de tipos de tiles para el mapa de la mazmorra.
 * Cada tile tiene propiedades que determinan su comportamiento
 * (transitable, transparente) y su representación visual (carácter, colores).
 * 
 * Los colores siguen la paleta púrpura oscura estilo PMD (Pokémon Mystery Dungeon).
 */

/**
 * Enumeración de todos los tipos de tile disponibles.
 * 
 * @property {number} id - Identificador numérico único del tile
 * @property {boolean} walkable - Si las entidades pueden caminar sobre este tile
 * @property {boolean} transparent - Si la luz/visión puede pasar a través (para FOV)
 * @property {string} char - Carácter ASCII para representación en texto
 * @property {Object} colors - Par de colores para renderizado
 * @property {string} colors.floor - Color principal del tile
 * @property {string} colors.wall - Color secundario/sombra del tile
 */
export const TILES = {
  /** Vacío - fuera de los límites del mapa */
  VOID: {
    id: -1,
    walkable: false,
    transparent: false,
    char: ' ',
    colors: { floor: '#000000', wall: '#000000' }
  },

  /** Muro - bloquea movimiento y visión */
  WALL: {
    id: 0,
    walkable: false,
    transparent: false,
    char: '#',
    colors: { floor: '#2a1f3d', wall: '#1a1230' }
  },

  /** Suelo de habitación - transitable y transparente */
  FLOOR: {
    id: 1,
    walkable: true,
    transparent: true,
    char: '.',
    colors: { floor: '#4a3f5d', wall: '#3d3350' }
  },

  /** Corredor - conecta habitaciones */
  CORRIDOR: {
    id: 2,
    walkable: true,
    transparent: true,
    char: '.',
    colors: { floor: '#3d3350', wall: '#302845' }
  },

  /** Escaleras descendentes - llevan al siguiente piso */
  STAIRS_DOWN: {
    id: 3,
    walkable: true,
    transparent: true,
    char: '>',
    colors: { floor: '#ffcc00', wall: '#cc9900' }
  },

  /** Agua - bloquea movimiento pero permite visión */
  WATER: {
    id: 4,
    walkable: false,
    transparent: true,
    char: '~',
    colors: { floor: '#1a3a5c', wall: '#0f2a4a' }
  },
};

/**
 * Mapa inverso: dado un ID numérico, devuelve el objeto tile correspondiente.
 * Útil para buscar rápidamente las propiedades de un tile por su ID.
 * 
 * @type {Object.<number, Object>}
 */
export const TILE_BY_ID = {};
for (const [nombre, tile] of Object.entries(TILES)) {
  TILE_BY_ID[tile.id] = { ...tile, name: nombre };
}
