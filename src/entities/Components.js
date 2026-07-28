/**
 * Components.js
 * Definiciones de componentes para el sistema ECS (Entity-Component-System).
 *
 * Cada tipo de componente es un Map<entityId, componentData>.
 * Esto permite iterar eficientemente sobre todas las entidades
 * que poseen un componente específico.
 *
 * Tipos de componentes:
 * - position:    Posición en la cuadrícula y dirección de mirada
 * - pokemonInfo: Datos de especie, nivel, XP, movimientos y tipos
 * - fighter:     Estadísticas de combate (HP, ataque, defensa, etc.)
 * - aiControlled: Datos de comportamiento para entidades controladas por IA
 * - partyMember: Información de pertenencia al equipo del jugador
 * - itemDrop:    Datos de objeto en el suelo
 * - trap:        Datos de trampa en el suelo
 * - sprite:      Datos de renderizado visual
 */

/**
 * Crear un almacén de componentes vacío.
 * Cada juego/partida debe tener su propia instancia.
 *
 * @returns {Object} Objeto con un Map por cada tipo de componente
 *
 * Estructura de cada componente:
 *
 * position: {
 *   x: number,          // Posición X en la cuadrícula
 *   y: number,          // Posición Y en la cuadrícula
 *   facing: string,     // Dirección: 'up' | 'down' | 'left' | 'right'
 *   prevX: number,      // Posición X anterior (para animación)
 *   prevY: number,      // Posición Y anterior (para animación)
 *   moveStartTime: number // Tiempo inicio movimiento
 * }
 *
 * pokemonInfo: {
 *   speciesId: number,  // ID de la especie en el Pokédex
 *   name: string,       // Nombre localizado del Pokémon
 *   level: number,      // Nivel actual
 *   xp: number,         // Experiencia acumulada en el nivel actual
 *   currentMoves: [{    // Movimientos actuales (máx. 4)
 *     moveId: number,   // ID del movimiento
 *     currentPP: number,// PP restantes
 *     maxPP: number     // PP máximos del movimiento
 *   }],
 *   types: string[]     // Tipos del Pokémon (ej. ['fuego', 'volador'])
 * }
 *
 * fighter: {
 *   hp: number,         // Puntos de vida actuales
 *   maxHp: number,      // Puntos de vida máximos
 *   attack: number,     // Estadística de ataque físico
 *   defense: number,    // Estadística de defensa física
 *   spAtk: number,      // Estadística de ataque especial
 *   spDef: number,      // Estadística de defensa especial
 *   speed: number,      // Estadística de velocidad
 *   statusEffects: [{   // Efectos de estado activos
 *     type: string,     // Tipo: 'poison', 'burn', 'paralysis', 'sleep', 'freeze'
 *     turnsLeft: number // Turnos restantes (-1 para permanente)
 *   }]
 * }
 *
 * aiControlled: {
 *   behavior: string,   // Comportamiento: 'wander' | 'chase' | 'flee'
 *   detectRange: number,// Rango de detección del jugador en tiles
 *   alertedTo: number|null // ID de la entidad a la que está alerta (null si no)
 * }
 *
 * npcFriendly: {
 *   // Componente sin datos (tag). 
 *   // Si una entidad lo tiene, no ataca y puede unirse al equipo si hablas con él.
 * }
 *
 * partyMember: {
 *   slot: number,       // Posición en el equipo (0-3)
 *   isLeader: boolean   // Si es el Pokémon líder (aparece en el mapa)
 * }
 *
 * itemDrop: {
 *   itemId: string,     // ID del objeto
 *   quantity: number    // Cantidad
 * }
 *
 * trap: {
 *   type: string,       // Tipo: 'poison', 'sleep', 'explosion', 'warp', 'sticky'
 *   isHidden: boolean,  // Si está oculta (true) o revelada (false)
 *   uses: number        // Usos restantes
 * }
 *
 * sprite: {
 *   url: string,        // URL/ruta de la imagen del sprite
 *   image: Image|null,  // Objeto Image cargado (null hasta que se cargue)
 *   loaded: boolean     // Si la imagen ya se cargó correctamente
 * }
 */
export function createComponentStore() {
  return {
    /** @type {Map<number, {x: number, y: number, facing: string}>} */
    position: new Map(),

    /** @type {Map<number, {speciesId: number, name: string, level: number, xp: number, currentMoves: Array, types: string[]}>} */
    pokemonInfo: new Map(),

    /** @type {Map<number, {hp: number, maxHp: number, attack: number, defense: number, spAtk: number, spDef: number, speed: number, statusEffects: Array}>} */
    fighter: new Map(),

    /** @type {Map<number, {behavior: string, detectRange: number, alertedTo: number|null}>} */
    aiControlled: new Map(),

    /** @type {Map<number, {}>} */
    npcFriendly: new Map(),

    /** @type {Map<number, {slot: number, isLeader: boolean}>} */
    partyMember: new Map(),

    /** @type {Map<number, {itemId: string, quantity: number}>} */
    itemDrop: new Map(),

    /** @type {Map<number, {type: string, isHidden: boolean, uses: number}>} */
    trap: new Map(),

    /** @type {Map<number, {url: string, image: Image|null, loaded: boolean}>} */
    sprite: new Map(),

    /** @type {Map<number, {active: boolean}>} */
    boss: new Map(),
    /** @type {Map<number, boolean>} */
    isBoss: new Map(),

    /** @type {Map<number, {shopInventory: Array, gold: number}>} */
    npcMerchant: new Map()
  };
}
