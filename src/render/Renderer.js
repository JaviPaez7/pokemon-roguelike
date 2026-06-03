/**
 * Renderer.js
 * 
 * Orquestador principal de renderizado del juego.
 * Coordina todos los sub-renderizadores (mapa, entidades, UI/HUD)
 * y gestiona el pipeline de dibujo en el canvas.
 * 
 * Orden de renderizado (capas):
 * 1. Limpiar canvas con color de fondo
 * 2. MapRenderer - tiles del mapa con FOV
 * 3. EntityRenderer - Pokémon e items visibles
 * 4. HUD - información del jugador, equipo, controles y minimapa
 */

import { MapRenderer } from './MapRenderer.js';
import { EntityRenderer } from './EntityRenderer.js';
import { SpriteManager } from './SpriteManager.js';
import { HUD } from '../ui/HUD.js';

/** Color de fondo del canvas (negro puro para las áreas no exploradas) */
const COLOR_FONDO = '#0a0a0f';

export class Renderer {
  /**
   * Crea el renderizador principal.
   * 
   * @param {HTMLCanvasElement} canvas - Elemento canvas del DOM
   */
  constructor(canvas) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    /** @type {CanvasRenderingContext2D} */
    this.ctx = canvas.getContext('2d');

    // Desactivar suavizado de imagen para pixel art nítido
    this.ctx.imageSmoothingEnabled = false;

    /** @type {SpriteManager} Gestor de sprites compartido */
    this.spriteManager = new SpriteManager();

    /** @type {MapRenderer} Sub-renderizador del mapa */
    this.mapRenderer = new MapRenderer();

    /** @type {EntityRenderer} Sub-renderizador de entidades */
    this.entityRenderer = new EntityRenderer(this.spriteManager);

    /** @type {HUD} HUD del juego (minimap, equipo, log) */
    this.hud = new HUD();
  }

  /**
   * Ejecuta el pipeline completo de renderizado para un frame.
   * 
   * @param {Object} game - Estado actual del juego
   */
  render(game) {
    const { ctx, canvas } = this;

    // === CAPA 1: Limpiar canvas ===
    ctx.fillStyle = COLOR_FONDO;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Asegurar que imageSmoothingEnabled siga desactivado
    ctx.imageSmoothingEnabled = false;

    // Verificar que tenemos los datos mínimos para renderizar
    if (!game || !game.tileMap || !game.camera) {
      this._dibujarPantallaError(ctx, 'Cargando aventura...');
      return;
    }

    // === CAPA 2: Renderizar mapa de tiles ===
    this.mapRenderer.render(ctx, game.tileMap, game.camera);

    // === CAPA 3: Renderizar entidades (Pokémon, items) ===
    if (game.entityManager) {
      this.entityRenderer.render(ctx, game.entityManager, game.camera, game.tileMap);
    }

    // === CAPA 4: HUD (Heads-Up Display) ===
    this.hud.render(ctx, game, canvas.width, canvas.height);
  }

  /**
   * Dibuja una pantalla de error o carga cuando no hay datos del juego.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {string} mensaje - Mensaje a mostrar
   * @private
   */
  _dibujarPantallaError(ctx, mensaje) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mensaje, this.canvas.width / 2, this.canvas.height / 2);
  }

  /**
   * Redimensiona el canvas para ajustarse al contenedor o ventana.
   * 
   * @param {number} width - Nuevo ancho en píxeles
   * @param {number} height - Nuevo alto en píxeles
   */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;

    // Restaurar configuración de pixel art tras redimensionar
    this.ctx.imageSmoothingEnabled = false;
  }
}
