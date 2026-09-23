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

  /** Trampa oculta - se ve igual que el suelo, pero es una trampa */
  TRAP_HIDDEN: {
    id: 5,
    walkable: true,
    transparent: true,
    char: '.',
    colors: { floor: '#4a3f5d', wall: '#3d3350' } // Igual que FLOOR
  },

  /** Trampa revelada - se vuelve visible al pisarla (transitable) */
  TRAP_REVEALED: {
    id: 7,
    walkable: true,
    transparent: true,
    char: '^',
    colors: { floor: '#e74c3c', wall: '#c0392b' }
  },

  /** Lava - bloquea movimiento a no ser que seas fuego/volador */
  LAVA: {
    id: 6,
    walkable: false,
    transparent: true,
    char: '~',
    colors: { floor: '#e67e22', wall: '#d35400' }
  },

  /** Baldosa mágica (Wonder Tile) - limpia los modificadores de estadísticas */
  WONDER_TILE: {
    id: 8,
    walkable: true,
    transparent: true,
    char: '*',
    colors: { floor: '#00ccff', wall: '#0099cc' }
  },

  // ── Pueblo (ids 20+: MapRenderer los pinta con sus propios colores) ──
  TOWN_GRASS: {
    id: 20,
    walkable: true,
    transparent: true,
    char: '.',
    colors: { floor: '#3f7a3a', wall: '#37703a' }
  },
  TOWN_PATH: {
    id: 21,
    walkable: true,
    transparent: true,
    char: '=',
    colors: { floor: '#b99b69', wall: '#a88a5a' }
  },
  TOWN_TREE: {
    id: 22,
    walkable: false,
    transparent: false,
    char: 'T',
    colors: { floor: '#2f6a2b', wall: '#1d4a1b' }
  },
  TOWN_WALL: {
    id: 23,
    walkable: false,
    transparent: false,
    char: 'B',
    colors: { floor: '#d8c7a3', wall: '#9b8a69' }
  },
  TOWN_ROOF: {
    id: 24,
    walkable: false,
    transparent: false,
    char: 'R',
    colors: { floor: '#b8553c', wall: '#7c3524' }
  },
  TOWN_DOOR: {
    id: 25,
    walkable: false,
    transparent: false,
    char: 'D',
    colors: { floor: '#6e4b2a', wall: '#4a311a' }
  },
  TOWN_EXIT: {
    id: 26,
    walkable: true,
    transparent: true,
    char: 'E',
    colors: { floor: '#cdb685', wall: '#b39d6e' }
  },
  TOWN_BOARD: {
    id: 27,
    walkable: false,
    transparent: true,
    char: 'P',
    colors: { floor: '#3f7a3a', wall: '#5e3c1c' }
  },
  TOWN_FLOWERS: {
    id: 28,
    walkable: true,
    transparent: true,
    char: '*',
    colors: { floor: '#3f7a3a', wall: '#37703a' }
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
