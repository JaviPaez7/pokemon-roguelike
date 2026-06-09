/**
 * DungeonGenerator.js
 * 
 * Generador procedural de mazmorras al estilo Pokémon Mystery Dungeon (PMD).
 * 
 * Algoritmo de generación:
 * 1. Dividir el mapa en una cuadrícula de celdas (GRID_COLS × GRID_ROWS)
 * 2. Seleccionar aleatoriamente 60-80% de las celdas como "celdas de habitación"
 * 3. Generar habitaciones rectangulares dentro de cada celda seleccionada
 * 4. Conectar habitaciones adyacentes con corredores en forma de L
 * 5. Validar conectividad con flood fill y añadir corredores extra si es necesario
 * 6. Colocar escaleras en la habitación más lejana al inicio
 * 7. Calcular puntos de aparición para enemigos e items
 * 
 * Usa ROT.RNG para generación determinística con semilla (seed).
 */

import { RNG } from 'rot-js';
import { TileMap } from './TileMap.js';
import { TILES } from './TileTypes.js';

/** Columnas de la cuadrícula de celdas */
const GRID_COLS = 5;
/** Filas de la cuadrícula de celdas */
const GRID_ROWS = 4;

/** Dimensiones mínimas y máximas de las habitaciones */
const ROOM_MIN_WIDTH = 4;
const ROOM_MAX_WIDTH = 10;
const ROOM_MIN_HEIGHT = 3;
const ROOM_MAX_HEIGHT = 7;

/** Porcentaje mínimo y máximo de celdas que contendrán habitaciones */
const ROOM_DENSITY_MIN = 0.6;
const ROOM_DENSITY_MAX = 0.8;

/** Margen mínimo entre una habitación y el borde de su celda */
const CELL_PADDING = 1;

/**
 * Densidad de puntos de aparición de enemigos e items.
 * Expresados como probabilidad por tile de suelo válido.
 */
const ENEMY_DENSITY = 0.08;
const ITEM_DENSITY = 0.02;
const TRAP_DENSITY = 0.01;

export class DungeonGenerator {
  /**
   * Genera una mazmorra completa de forma procedural.
   * 
   * @param {number} width - Ancho del mapa en tiles (ej: 50)
   * @param {number} height - Alto del mapa en tiles (ej: 40)
   * @param {number} [seed] - Semilla para generación determinística
   * @returns {{
   *   tileMap: TileMap,
   *   rooms: {x: number, y: number, w: number, h: number}[],
   *   spawnPoints: {x: number, y: number}[],
   *   itemPoints: {x: number, y: number}[],
   *   playerStart: {x: number, y: number},
   *   stairsPos: {x: number, y: number}
   * }} Datos completos de la mazmorra generada
   */
  generate(width, height, seed, floorNumber = 1, isBossFloor = false) {
    const isBoss = isBossFloor || (floorNumber > 0 && floorNumber % 10 === 0);

    // Inicializar el generador de números aleatorios con la semilla
    if (seed !== undefined) {
      RNG.setSeed(seed);
    }

    // Crear el mapa lleno de muros
    const tileMap = new TileMap(width, height);
    // (TileMap ya se inicializa con WALL por defecto, no hace falta rellenar)

    if (isBoss) {
      return this._generateBossRoom(width, height, tileMap);
    }

    // === PASO 1: División en cuadrícula ===
    const celdas = this._crearCuadricula(width, height);

    // === PASO 2: Selección de celdas con habitación ===
    this._seleccionarCeldasConHabitacion(celdas);

    // === PASO 3: Generación de habitaciones ===
    const rooms = this._generarHabitaciones(celdas, tileMap);

    // === PASO 3.5: Tipos de habitaciones ===
    this._asignarTiposEspeciales(rooms);

    // === PASO 4: Conexión con corredores ===
    this._conectarHabitaciones(celdas, tileMap);

    // === PASO 5: Validación de conectividad ===
    this._validarConectividad(rooms, tileMap, celdas);

    // === PASO 6: Posición inicial del jugador ===
    const playerStart = this._calcularInicioJugador(rooms);

    // === PASO 7: Colocación de escaleras ===
    const stairsPos = this._colocarEscaleras(rooms, playerStart, tileMap);

    // === PASO 7.5: Añadir terrenos especiales (Agua, Lava) ===
    this._addSpecialTerrain(rooms, stairsPos, tileMap);

    // === PASO 8: Puntos de aparición ===
    const spawnPoints = this._generarPuntosAparicion(rooms, playerStart, stairsPos, tileMap);
    const itemPoints = this._generarPuntosItems(rooms, playerStart, stairsPos, tileMap);

    // === PASO 9: Generación de trampas ===
    this._colocarTrampas(rooms, playerStart, stairsPos, tileMap);

    // === PASO 10: Generación de agua ===
    this._generarLagos(rooms, tileMap, playerStart, stairsPos);

    // === PASO 11: Generación de baldosas mágicas ===
    this._generarBaldosasMagicas(rooms, tileMap, playerStart, stairsPos);

    tileMap.rooms = rooms;
    return {
      tileMap,
      rooms,
      spawnPoints,
      itemPoints,
      playerStart,
      stairsPos,
    };
  }

  // ========================================================================
  // MÉTODOS PRIVADOS - Cada paso del algoritmo
  // ========================================================================

  /**
   * PASO 1: Divide el mapa en una cuadrícula de celdas.
   * Cada celda tiene una posición y tamaño, y un flag de si contendrá habitación.
   * 
   * @param {number} mapWidth - Ancho total del mapa
   * @param {number} mapHeight - Alto total del mapa
   * @returns {Object[][]} Cuadrícula 2D de celdas [fila][columna]
   * @private
   */
  _crearCuadricula(mapWidth, mapHeight) {
    const anchoCelda = Math.floor(mapWidth / GRID_COLS);
    const altoCelda = Math.floor(mapHeight / GRID_ROWS);
    const celdas = [];

    for (let fila = 0; fila < GRID_ROWS; fila++) {
      celdas[fila] = [];
      for (let col = 0; col < GRID_COLS; col++) {
        celdas[fila][col] = {
          // Posición de la celda en el mapa (en tiles)
          x: col * anchoCelda,
          y: fila * altoCelda,
          // Dimensiones de la celda
          w: anchoCelda,
          h: altoCelda,
          // Índices en la cuadrícula
          col,
          fila,
          // ¿Tendrá habitación?
          tieneHabitacion: false,
          // Referencia a la habitación generada (si existe)
          habitacion: null,
        };
      }
    }

    return celdas;
  }

  /**
   * PASO 2: Marca aleatoriamente 60-80% de las celdas como "celdas con habitación".
   * Garantiza que al menos 3 celdas tengan habitación para un juego funcional.
   * 
   * @param {Object[][]} celdas - Cuadrícula de celdas
   * @private
   */
  _seleccionarCeldasConHabitacion(celdas) {
    const totalCeldas = GRID_ROWS * GRID_COLS;
    // Calcular cuántas celdas tendrán habitación (60-80%)
    const densidad = ROOM_DENSITY_MIN + RNG.getUniform() * (ROOM_DENSITY_MAX - ROOM_DENSITY_MIN);
    const numHabitaciones = Math.max(3, Math.round(totalCeldas * densidad));

    // Crear lista plana de todas las celdas y mezclarla aleatoriamente
    const todasLasCeldas = [];
    for (let fila = 0; fila < GRID_ROWS; fila++) {
      for (let col = 0; col < GRID_COLS; col++) {
        todasLasCeldas.push(celdas[fila][col]);
      }
    }

    // Mezcla Fisher-Yates con RNG determinístico
    for (let i = todasLasCeldas.length - 1; i > 0; i--) {
      const j = Math.floor(RNG.getUniform() * (i + 1));
      [todasLasCeldas[i], todasLasCeldas[j]] = [todasLasCeldas[j], todasLasCeldas[i]];
    }

    // Marcar las primeras N celdas como habitaciones
    for (let i = 0; i < numHabitaciones && i < todasLasCeldas.length; i++) {
      todasLasCeldas[i].tieneHabitacion = true;
    }
  }

  /**
   * PASO 3: Genera habitaciones rectangulares dentro de las celdas marcadas.
   * Cada habitación tiene dimensiones aleatorias y se posiciona dentro de su celda
   * respetando un margen (padding) de al menos 1 tile.
   * 
   * @param {Object[][]} celdas - Cuadrícula de celdas
   * @param {TileMap} tileMap - Mapa donde se tallan las habitaciones
   * @returns {{x: number, y: number, w: number, h: number}[]} Lista de habitaciones
   * @private
   */
  _generarHabitaciones(celdas, tileMap) {
    const rooms = [];

    for (let fila = 0; fila < GRID_ROWS; fila++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const celda = celdas[fila][col];
        if (!celda.tieneHabitacion) continue;

        // Calcular espacio disponible dentro de la celda (con padding)
        const espacioW = celda.w - CELL_PADDING * 2;
        const espacioH = celda.h - CELL_PADDING * 2;

        // Dimensiones aleatorias de la habitación (respetando mín/máx y espacio)
        const roomW = Math.min(
          ROOM_MIN_WIDTH + Math.floor(RNG.getUniform() * (ROOM_MAX_WIDTH - ROOM_MIN_WIDTH + 1)),
          espacioW
        );
        const roomH = Math.min(
          ROOM_MIN_HEIGHT + Math.floor(RNG.getUniform() * (ROOM_MAX_HEIGHT - ROOM_MIN_HEIGHT + 1)),
          espacioH
        );

        // Posición aleatoria dentro de la celda (con padding)
        const maxOffsetX = Math.max(0, espacioW - roomW);
        const maxOffsetY = Math.max(0, espacioH - roomH);
        const roomX = celda.x + CELL_PADDING + Math.floor(RNG.getUniform() * (maxOffsetX + 1));
        const roomY = celda.y + CELL_PADDING + Math.floor(RNG.getUniform() * (maxOffsetY + 1));

        // Asegurar que la habitación esté dentro de los límites del mapa
        const room = {
          x: Math.max(1, Math.min(roomX, tileMap.width - roomW - 1)),
          y: Math.max(1, Math.min(roomY, tileMap.height - roomH - 1)),
          w: roomW,
          h: roomH,
          type: 'normal'
        };

        // Tallar la habitación en el mapa (convertir muros a suelo)
        this._tallarHabitacion(room, tileMap);

        celda.habitacion = room;
        rooms.push(room);
      }
    }

    return rooms;
  }

  /**
   * Talla una habitación rectangular en el mapa, convirtiendo muros en suelo.
   * 
   * @param {{x: number, y: number, w: number, h: number}} room - Datos de la habitación
   * @param {TileMap} tileMap - Mapa donde tallar
   * @private
   */
  _tallarHabitacion(room, tileMap) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (tileMap.isInBounds(x, y)) {
          tileMap.setTile(x, y, TILES.FLOOR.id);
        }
      }
    }
  }

  /**
   * Asigna tipos especiales a las habitaciones de forma aleatoria.
   * @param {{x: number, y: number, w: number, h: number, type: string}[]} rooms
   */
  _asignarTiposEspeciales(rooms) {
    if (rooms.length <= 2) return;
    
    // 10% de probabilidad de tener una monster house
    if (RNG.getUniform() < 0.10) {
      const idx = 1 + Math.floor(RNG.getUniform() * (rooms.length - 1));
      rooms[idx].type = 'monster_house';
    }

    // 15% de probabilidad de tener una habitación del tesoro
    if (RNG.getUniform() < 0.15) {
      const idx = 1 + Math.floor(RNG.getUniform() * (rooms.length - 1));
      if (rooms[idx].type === 'normal') {
        rooms[idx].type = 'treasure';
      }
    }

    // 15% de probabilidad de tener una habitación de descanso
    if (RNG.getUniform() < 0.15) {
      const idx = 1 + Math.floor(RNG.getUniform() * (rooms.length - 1));
      if (rooms[idx].type === 'normal') {
        rooms[idx].type = 'rest';
      }
    }
  }

  /**
   * PASO 4: Conecta habitaciones adyacentes con corredores en forma de L.
   * Itera sobre pares de celdas vecinas (horizontal y verticalmente).
   * Solo conecta celdas que ambas tengan habitación.
   * 
   * @param {Object[][]} celdas - Cuadrícula de celdas
   * @param {TileMap} tileMap - Mapa donde tallar los corredores
   * @private
   */
  _conectarHabitaciones(celdas, tileMap) {
    // Conexiones horizontales (celda a la derecha)
    for (let fila = 0; fila < GRID_ROWS; fila++) {
      for (let col = 0; col < GRID_COLS - 1; col++) {
        const celdaA = celdas[fila][col];
        const celdaB = celdas[fila][col + 1];

        if (celdaA.tieneHabitacion && celdaB.tieneHabitacion) {
          this._trazarCorredorEnL(celdaA.habitacion, celdaB.habitacion, tileMap);
        }
      }
    }

    // Conexiones verticales (celda abajo)
    for (let fila = 0; fila < GRID_ROWS - 1; fila++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const celdaA = celdas[fila][col];
        const celdaB = celdas[fila + 1][col];

        if (celdaA.tieneHabitacion && celdaB.tieneHabitacion) {
          this._trazarCorredorEnL(celdaA.habitacion, celdaB.habitacion, tileMap);
        }
      }
    }
  }

  /**
   * Traza un corredor en forma de L entre dos habitaciones.
   * Elige aleatoriamente si va primero horizontal y luego vertical, o viceversa.
   * 
   * @param {{x: number, y: number, w: number, h: number}} roomA - Habitación origen
   * @param {{x: number, y: number, w: number, h: number}} roomB - Habitación destino
   * @param {TileMap} tileMap - Mapa donde tallar
   * @private
   */
  _trazarCorredorEnL(roomA, roomB, tileMap) {
    // Punto de inicio: posición aleatoria dentro de la habitación A
    const startX = roomA.x + Math.floor(RNG.getUniform() * roomA.w);
    const startY = roomA.y + Math.floor(RNG.getUniform() * roomA.h);

    // Punto de fin: posición aleatoria dentro de la habitación B
    const endX = roomB.x + Math.floor(RNG.getUniform() * roomB.w);
    const endY = roomB.y + Math.floor(RNG.getUniform() * roomB.h);

    // Elegir aleatoriamente el orden: horizontal-vertical o vertical-horizontal
    if (RNG.getUniform() < 0.5) {
      // Primero horizontal, luego vertical
      this._trazarLineaHorizontal(startX, endX, startY, tileMap);
      this._trazarLineaVertical(startY, endY, endX, tileMap);
    } else {
      // Primero vertical, luego horizontal
      this._trazarLineaVertical(startY, endY, startX, tileMap);
      this._trazarLineaHorizontal(startX, endX, endY, tileMap);
    }
  }

  /**
   * Traza una línea horizontal de corredor.
   * Solo convierte tiles que son muros; no sobreescribe suelos existentes.
   * 
   * @param {number} x1 - Coordenada X de inicio
   * @param {number} x2 - Coordenada X de fin
   * @param {number} y - Coordenada Y (fija)
   * @param {TileMap} tileMap - Mapa donde tallar
   * @private
   */
  _trazarLineaHorizontal(x1, x2, y, tileMap) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    for (let x = minX; x <= maxX; x++) {
      if (tileMap.isInBounds(x, y) && tileMap.getTile(x, y).id === TILES.WALL.id) {
        tileMap.setTile(x, y, TILES.CORRIDOR.id);
      }
    }
  }

  /**
   * Traza una línea vertical de corredor.
   * Solo convierte tiles que son muros; no sobreescribe suelos existentes.
   * 
   * @param {number} y1 - Coordenada Y de inicio
   * @param {number} y2 - Coordenada Y de fin
   * @param {number} x - Coordenada X (fija)
   * @param {TileMap} tileMap - Mapa donde tallar
   * @private
   */
  _trazarLineaVertical(y1, y2, x, tileMap) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    for (let y = minY; y <= maxY; y++) {
      if (tileMap.isInBounds(x, y) && tileMap.getTile(x, y).id === TILES.WALL.id) {
        tileMap.setTile(x, y, TILES.CORRIDOR.id);
      }
    }
  }

  /**
   * PASO 5: Valida que todas las habitaciones estén conectadas mediante flood fill.
   * Si hay habitaciones desconectadas, las conecta con corredores adicionales.
   * 
   * @param {{x: number, y: number, w: number, h: number}[]} rooms - Lista de habitaciones
   * @param {TileMap} tileMap - Mapa actual
   * @param {Object[][]} celdas - Cuadrícula de celdas
   * @private
   */
  _validarConectividad(rooms, tileMap, celdas) {
    if (rooms.length <= 1) return;

    // Obtener un punto representativo de cada habitación (centro)
    const centros = rooms.map(r => ({
      x: Math.floor(r.x + r.w / 2),
      y: Math.floor(r.y + r.h / 2),
    }));

    // Flood fill desde la primera habitación
    const visitados = this._floodFill(centros[0].x, centros[0].y, tileMap);

    // Verificar qué habitaciones son alcanzables
    const desconectadas = [];
    for (let i = 1; i < centros.length; i++) {
      const clave = `${centros[i].x},${centros[i].y}`;
      if (!visitados.has(clave)) {
        desconectadas.push(i);
      }
    }

    // Conectar habitaciones desconectadas a la más cercana del grupo conectado
    for (const indice of desconectadas) {
      const roomDesconectada = rooms[indice];

      // Encontrar la habitación conectada más cercana
      let mejorDistancia = Infinity;
      let mejorRoom = rooms[0];

      for (let i = 0; i < rooms.length; i++) {
        if (desconectadas.includes(i)) continue; // Saltar otras desconectadas
        const dist = this._distanciaManhattan(
          centros[indice], centros[i]
        );
        if (dist < mejorDistancia) {
          mejorDistancia = dist;
          mejorRoom = rooms[i];
        }
      }

      // Trazar corredor de emergencia
      this._trazarCorredorEnL(roomDesconectada, mejorRoom, tileMap);
    }
  }

  /**
   * Realiza flood fill desde una posición para encontrar todos los tiles alcanzables.
   * Solo recorre tiles transitables (FLOOR, CORRIDOR, STAIRS_DOWN).
   * 
   * @param {number} startX - Coordenada X de inicio
   * @param {number} startY - Coordenada Y de inicio
   * @param {TileMap} tileMap - Mapa a recorrer
   * @returns {Set<string>} Conjunto de claves "x,y" de tiles visitados
   * @private
   */
  _floodFill(startX, startY, tileMap) {
    const visitados = new Set();
    const cola = [{ x: startX, y: startY }];

    while (cola.length > 0) {
      const { x, y } = cola.shift();
      const clave = `${x},${y}`;

      // Saltar si ya visitado o fuera de límites
      if (visitados.has(clave)) continue;
      if (!tileMap.isInBounds(x, y)) continue;
      if (!tileMap.isWalkable(x, y)) continue;

      visitados.add(clave);

      // Expandir a las 4 direcciones cardinales
      cola.push({ x: x + 1, y });
      cola.push({ x: x - 1, y });
      cola.push({ x, y: y + 1 });
      cola.push({ x, y: y - 1 });
    }

    return visitados;
  }

  /**
   * Calcula la distancia Manhattan entre dos puntos.
   * 
   * @param {{x: number, y: number}} a - Punto A
   * @param {{x: number, y: number}} b - Punto B
   * @returns {number} Distancia Manhattan (|dx| + |dy|)
   * @private
   */
  _distanciaManhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  /**
   * PASO 6: Determina la posición inicial del jugador.
   * Se elige el centro de la primera habitación.
   * 
   * @param {{x: number, y: number, w: number, h: number}[]} rooms - Lista de habitaciones
   * @returns {{x: number, y: number}} Posición inicial del jugador
   * @private
   */
  _calcularInicioJugador(rooms) {
    const primeraRoom = rooms[0];
    return {
      x: Math.floor(primeraRoom.x + primeraRoom.w / 2),
      y: Math.floor(primeraRoom.y + primeraRoom.h / 2),
    };
  }

  /**
   * PASO 7: Coloca las escaleras en la habitación más lejana al jugador.
   * Usa la distancia Manhattan desde el centro de cada habitación
   * hasta la posición de inicio del jugador.
   * 
   * @param {{x: number, y: number, w: number, h: number}[]} rooms - Lista de habitaciones
   * @param {{x: number, y: number}} playerStart - Posición inicial del jugador
   * @param {TileMap} tileMap - Mapa donde colocar las escaleras
   * @returns {{x: number, y: number}} Posición de las escaleras
   * @private
   */
  _colocarEscaleras(rooms, playerStart, tileMap) {
    let mejorDistancia = -1;
    let mejorRoom = rooms[rooms.length - 1]; // Fallback: última habitación

    for (const room of rooms) {
      const centro = {
        x: Math.floor(room.x + room.w / 2),
        y: Math.floor(room.y + room.h / 2),
      };
      const dist = this._distanciaManhattan(playerStart, centro);

      if (dist > mejorDistancia) {
        mejorDistancia = dist;
        mejorRoom = room;
      }
    }

    // Colocar las escaleras en el centro de la habitación más lejana
    const stairsPos = {
      x: Math.floor(mejorRoom.x + mejorRoom.w / 2),
      y: Math.floor(mejorRoom.y + mejorRoom.h / 2),
    };

    tileMap.setTile(stairsPos.x, stairsPos.y, TILES.STAIRS_DOWN.id);
    return stairsPos;
  }

  /**
   * PASO 8a: Genera puntos de aparición para enemigos.
   * Se eligen posiciones aleatorias en tiles de suelo de habitaciones,
   * evitando la posición del jugador, las escaleras y los corredores.
   * 
   * @param {{x: number, y: number, w: number, h: number}[]} rooms - Lista de habitaciones
   * @param {{x: number, y: number}} playerStart - Posición del jugador (excluida)
   * @param {{x: number, y: number}} stairsPos - Posición de escaleras (excluida)
   * @param {TileMap} tileMap - Mapa para verificar tiles
   * @returns {{x: number, y: number}[]} Lista de posiciones de aparición
   * @private
   */
  _generarPuntosAparicion(rooms, playerStart, stairsPos, tileMap) {
    const puntos = [];

    for (const room of rooms) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          // Solo tiles de suelo (no corredores, no escaleras)
          if (tileMap.getTile(x, y).id !== TILES.FLOOR.id) continue;
          // No en la posición del jugador
          if (x === playerStart.x && y === playerStart.y) continue;
          // No en las escaleras
          if (x === stairsPos.x && y === stairsPos.y) continue;

          // Probabilidad de ser punto de aparición
          let density = ENEMY_DENSITY;
          if (room.type === 'rest') density = 0;
          if (room.type === 'monster_house') density = 0; // Se generan cuando entras

          if (density > 0 && RNG.getUniform() < density) {
            puntos.push({ x, y });
          }
        }
      }
    }

    return puntos;
  }

  /**
   * PASO 8b: Genera puntos de aparición para items.
   * Similar a los enemigos pero con menor densidad.
   * 
   * @param {{x: number, y: number, w: number, h: number}[]} rooms - Lista de habitaciones
   * @param {{x: number, y: number}} playerStart - Posición del jugador (excluida)
   * @param {{x: number, y: number}} stairsPos - Posición de escaleras (excluida)
   * @param {TileMap} tileMap - Mapa para verificar tiles
   * @returns {{x: number, y: number}[]} Lista de posiciones de items
   * @private
   */
  _generarPuntosItems(rooms, playerStart, stairsPos, tileMap) {
    const puntos = [];

    for (const room of rooms) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          // Solo tiles de suelo (no corredores, no escaleras)
          if (tileMap.getTile(x, y).id !== TILES.FLOOR.id) continue;
          // No en la posición del jugador
          if (x === playerStart.x && y === playerStart.y) continue;
          // No en las escaleras
          if (x === stairsPos.x && y === stairsPos.y) continue;

          // Probabilidad de ser punto de item
          let density = ITEM_DENSITY;
          if (room.type === 'treasure') density = ITEM_DENSITY * 8;
          if (room.type === 'monster_house') density = ITEM_DENSITY * 6;

          if (density > 0 && RNG.getUniform() < density) {
            puntos.push({ x, y });
          }
        }
      }
    }
    return puntos;
  }

  /**
   * PASO 9: Coloca trampas en el mapa.
   * Se modifican directamente los tiles del mapa a TILES.TRAP.
   * 
   * @param {{x: number, y: number, w: number, h: number, type: string}[]} rooms
   * @param {{x: number, y: number}} playerStart
   * @param {{x: number, y: number}} stairsPos
   * @param {TileMap} tileMap
   * @private
   */
  _colocarTrampas(rooms, playerStart, stairsPos, tileMap) {
    for (const room of rooms) {
      if (room.type === 'rest' || room.type === 'treasure') continue; // No traps in rest/treasure rooms

      let density = TRAP_DENSITY;
      if (room.type === 'monster_house') density = TRAP_DENSITY * 5;

      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (tileMap.getTile(x, y).id !== TILES.FLOOR.id) continue;
          if (x === playerStart.x && y === playerStart.y) continue;
          if (x === stairsPos.x && y === stairsPos.y) continue;

          if (RNG.getUniform() < density) {
            tileMap.setTile(x, y, TILES.TRAP_HIDDEN.id);
          }
        }
      }
    }
  }

  /**
   * PASO 10: Genera lagos o charcos de agua en las habitaciones.
   * 
   * @param {Object[]} rooms - Lista de habitaciones
   * @param {TileMap} tileMap - Mapa de tiles
   * @param {Object} playerStart - Posición inicial del jugador
   * @param {Object} stairsPos - Posición de las escaleras
   * @private
   */
  _generarLagos(rooms, tileMap, playerStart, stairsPos) {
    for (const room of rooms) {
      // No generar agua en la habitación del jugador o de las escaleras
      if (playerStart.x >= room.x && playerStart.x < room.x + room.w &&
          playerStart.y >= room.y && playerStart.y < room.y + room.h) {
        continue;
      }
      if (stairsPos.x >= room.x && stairsPos.x < room.x + room.w &&
          stairsPos.y >= room.y && stairsPos.y < room.y + room.h) {
        continue;
      }

      // No generar agua en habitaciones muy pequeñas
      if (room.w < 6 || room.h < 6) continue;

      // 30% de probabilidad de tener agua por habitación
      if (RNG.getUniform() < 0.3) {
        const cx = Math.floor(room.x + room.w / 2);
        const cy = Math.floor(room.y + room.h / 2);
        const maxSafeRadius = Math.floor(Math.min(room.w, room.h) / 2) - 2;
        if (maxSafeRadius < 1) continue;
        
        const radius = Math.floor(RNG.getUniform() * Math.min(2, maxSafeRadius)) + 1; // Radio de 1 a 2 tiles
        
        for (let y = cy - radius; y <= cy + radius; y++) {
          for (let x = cx - radius; x <= cx + radius; x++) {
            // Forma circular (aproximada)
            if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius + 0.5) {
              if (tileMap.isInBounds(x, y)) {
                // Solo reemplazar suelo normal
                if (tileMap.getTile(x, y).id === TILES.FLOOR.id) {
                  tileMap.setTile(x, y, TILES.WATER.id);
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Genera charcos de agua o lava aleatorios dentro de algunas habitaciones.
   */
  _addSpecialTerrain(rooms, stairsPos, tileMap) {
    const specialRooms = RNG.shuffle([...rooms]).slice(0, Math.max(1, Math.floor(rooms.length * 0.3))); // 30% of rooms

    for (const room of specialRooms) {
      if (room.isStart) continue; // No water in start room
      
      const terrainType = RNG.getUniform() > 0.5 ? TILES.WATER.id : TILES.LAVA.id;
      
      // Random walk para generar un "charco"
      let cx = Math.floor(room.x + room.w / 2);
      let cy = Math.floor(room.y + room.h / 2);
      
      const puddleSize = Math.floor((room.w * room.h) * 0.3); // 30% of room area

      for (let i = 0; i < puddleSize; i++) {
        // Mover centro de forma aleatoria
        cx += RNG.getUniformInt(-1, 1);
        cy += RNG.getUniformInt(-1, 1);
        
        // Mantener dentro de la sala, con 1 tile de margen para no bloquear puertas
        cx = Math.max(room.x + 1, Math.min(room.x + room.w - 2, cx));
        cy = Math.max(room.y + 1, Math.min(room.y + room.h - 2, cy));
        
        // No sobreescribir escaleras
        if (cx === stairsPos.x && cy === stairsPos.y) continue;
        
        tileMap.setTile(cx, cy, terrainType);
      }
    }
  }

  /**
   * Genera proceduralmente baldosas mágicas en el mapa (1-2).
   */
  _generarBaldosasMagicas(rooms, tileMap, playerStart, stairsPos) {
    if (!rooms || rooms.length === 0) return;
    
    // Decidir cuántas baldosas colocar (1 a 2)
    const numTiles = 1 + Math.floor(RNG.getUniform() * 2);
    let placed = 0;
    
    const shuffledRooms = RNG.shuffle([...rooms]);
    
    for (const room of shuffledRooms) {
      if (placed >= numTiles) break;
      
      const validCoords = [];
      for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
        for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
          if (tileMap.getTile(x, y).id === TILES.FLOOR.id) {
            if (x === playerStart.x && y === playerStart.y) continue;
            if (x === stairsPos.x && y === stairsPos.y) continue;
            validCoords.push({ x, y });
          }
        }
      }
      
      if (validCoords.length > 0) {
        const choice = validCoords[Math.floor(RNG.getUniform() * validCoords.length)];
        tileMap.setTile(choice.x, choice.y, TILES.WONDER_TILE.id);
        placed++;
      }
    }
  }

  /**
   * Genera una habitación de Jefe única (arena abierta).
   */
  _generateBossRoom(width, height, tileMap) {
    const w = 20;
    const h = 16;
    
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    
    const rx = cx - Math.floor(w / 2);
    const ry = cy - Math.floor(h / 2);
    
    const bossRoom = {
      x: rx,
      y: ry,
      w: w,
      h: h,
      type: 'boss'
    };
    
    this._tallarHabitacion(bossRoom, tileMap);
    
    const playerStart = {
      x: cx,
      y: ry + h - 3
    };
    
    const bossSpawnPoint = {
      x: cx,
      y: ry + 3
    };
    
    const stairsPos = {
      x: cx,
      y: cy
    };
    
    tileMap.rooms = [bossRoom];
    
    return {
      tileMap,
      rooms: [bossRoom],
      spawnPoints: [bossSpawnPoint],
      itemPoints: [],
      playerStart,
      stairsPos
    };
  }
}
