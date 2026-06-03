/**
 * constants.js
 * Constantes globales del juego PokéRogue.
 * Define tamaños de tile, viewport, mapa, límites de equipo/inventario,
 * estados del juego, acciones posibles y paleta de colores.
 */

// ─── Dimensiones del renderizado ─────────────────────────────────────────────
/** Tamaño de cada tile en píxeles */
export const TILE_SIZE = 24;

/** Ancho del viewport en tiles (cuántos tiles se ven horizontalmente) */
export const VIEWPORT_WIDTH = 21;

/** Alto del viewport en tiles (cuántos tiles se ven verticalmente) */
export const VIEWPORT_HEIGHT = 15;

// ─── Dimensiones del mapa ────────────────────────────────────────────────────
/** Ancho del mapa de la mazmorra en tiles */
export const MAP_WIDTH = 50;

/** Alto del mapa de la mazmorra en tiles */
export const MAP_HEIGHT = 40;

// ─── Límites del juego ──────────────────────────────────────────────────────
/** Máximo de Pokémon en el equipo */
export const MAX_PARTY_SIZE = 4;

/** Máximo de objetos en el inventario */
export const MAX_INVENTORY = 20;

/** Radio de visión (Field of View) en tiles */
export const FOV_RADIUS = 7;

/** Rango de detección de enemigos en tiles */
export const ENEMY_DETECT_RANGE = 5;

// ─── Estados del juego (máquina de estados) ─────────────────────────────────
/**
 * Todos los estados posibles del juego.
 * Las transiciones entre estados se gestionan desde Game.js.
 */
export const GAME_STATES = {
  /** Pantalla de título */
  TITLE: 'TITLE',
  /** Selección del Pokémon inicial */
  STARTER_SELECT: 'STARTER_SELECT',
  /** Exploración de la mazmorra (jugabilidad principal) */
  EXPLORING: 'EXPLORING',
  /** Menú de pausa / inventario / equipo */
  MENU: 'MENU',
  /** Animación de combate en curso */
  COMBAT_ANIM: 'COMBAT_ANIM',
  /** Mostrando un diálogo */
  DIALOG: 'DIALOG',
  /** El jugador ha perdido */
  GAME_OVER: 'GAME_OVER',
  /** El jugador ha completado la mazmorra */
  VICTORY: 'VICTORY'
};

// ─── Acciones del jugador / entidades ───────────────────────────────────────
/**
 * Tipos de acciones que pueden realizar las entidades.
 * Se usan como comandos desde InputHandler y EnemyAI.
 */
export const ACTIONS = {
  /** Moverse en una dirección */
  MOVE: 'move',
  /** Atacar a una entidad adyacente */
  ATTACK: 'attack',
  /** Usar un objeto del inventario */
  USE_ITEM: 'use_item',
  /** Lanzar un objeto (ej. Poké Ball) */
  THROW: 'throw',
  /** Esperar un turno sin hacer nada */
  WAIT: 'wait',
  /** Usar las escaleras para cambiar de piso */
  STAIRS: 'stairs',
  /** Recoger un objeto del suelo */
  PICKUP: 'pickup'
};

// ─── Paleta de colores (estilo retro pixel art) ─────────────────────────────
/**
 * Colores utilizados por el renderizador y la interfaz.
 * Diseñados para un estilo oscuro con acentos vibrantes.
 */
export const COLORS = {
  /** Fondo general del juego */
  BG: '#0f0f1a',
  /** Fondo de los paneles de la interfaz */
  UI_BG: '#1a1a2e',
  /** Borde de los paneles de la interfaz */
  UI_BORDER: '#4a4a6a',
  /** Texto general de la interfaz */
  UI_TEXT: '#e0e0e0',
  /** Barra de vida: verde (HP alto) */
  HP_GREEN: '#4ade80',
  /** Barra de vida: amarillo (HP medio) */
  HP_YELLOW: '#fbbf24',
  /** Barra de vida: rojo (HP bajo) */
  HP_RED: '#ef4444',
  /** Barra de experiencia */
  XP_BLUE: '#60a5fa',
  /** Indicador de ataque supereficaz */
  SUPER_EFFECTIVE: '#fbbf24',
  /** Indicador de ataque poco eficaz */
  NOT_EFFECTIVE: '#9ca3af',
  /** Indicador de golpe crítico */
  CRITICAL: '#f97316'
};
