/**
 * Renderer.js
 * 
 * Orquestador principal de renderizado del juego.
 * Coordina todos los sub-renderizadores (mapa, entidades, UI/HUD)
 * y gestiona el pipeline de dibujo en el canvas.
 * 
 * Orden de renderizado (capas):
 * 1. Limpiar canvas con color de fondo
 * 2. MapRenderer - tiles del mapa con FOV (con screen shake)
 * 3. EntityRenderer - Pokémon e items visibles (con screen shake)
 * 4. HUD - información del jugador, equipo, controles y minimapa (sin shake)
 */

import { MapRenderer } from './MapRenderer.js';
import { EntityRenderer } from './EntityRenderer.js';
import { SpriteManager } from './SpriteManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { HUD } from '../ui/HUD.js';
import { GAME_STATES } from '../constants.js';

/** Color de fondo del canvas (negro puro para las áreas no exploradas) */
const COLOR_FONDO = '#0a0a0f';

export class Renderer {
  /**
   * Crea el renderizador principal.
   * 
   * @param {HTMLCanvasElement} canvas - Elemento canvas del DOM
   * @param {import('../core/EventBus.js').EventBus} eventBus - Bus de eventos del juego
   * @param {() => void} [onRenderRequested] - Callback para solicitar un frame de render
   */
  constructor(canvas, eventBus, onRenderRequested) {
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

    /** @type {ParticleSystem} Sistema de partículas */
    this.particleSystem = new ParticleSystem();

    /** @type {HUD} HUD del juego (minimap, equipo, log) */
    this.hud = new HUD();

    /** @type {() => void} */
    this._onRenderRequested = onRenderRequested || (() => {});

    /** @type {{ intensity: number, duration: number, startTime: number }|null} */
    this._screenShake = null;

    /** @type {{ state: 'in'|'out', duration: number, startTime: number, resolve: Function|null }|null} */
    this._fade = null;
    /** @type {number} */
    this._currentFadeAlpha = 0;

    /** @type {number} */
    this._lastUpdateTime = 0;

    if (eventBus) {
      this._setupEventListeners(eventBus);
    }
  }

  /**
   * Suscribe a eventos de combate para disparar VFX.
   * @param {import('../core/EventBus.js').EventBus} eventBus
   * @private
   */
  _setupEventListeners(eventBus) {
    eventBus.on('damage_dealt', (data) => {
      this.entityRenderer.spawnFloatingDamage(
        data.defenderId,
        data.damage,
        data.isCritical,
        data.effectiveness
      );
      this.entityRenderer.spawnDamageFlash(data.defenderId);

      // Flash de pantalla según efectividad / crítico
      if (data.isCritical) {
        this.screenFlash('rgba(255, 140, 0, 0.35)', 180);
      } else if (data.effectiveness > 1) {
        this.screenFlash('rgba(255, 220, 60, 0.28)', 160);
      } else if (data.effectiveness > 0 && data.effectiveness < 1) {
        this.screenFlash('rgba(120, 120, 140, 0.22)', 140);
      }

      // Partículas
      const game = typeof window !== 'undefined' ? window.game : null;
      if (game && game.entityManager) {
        const pos = game.entityManager.getComponent(data.defenderId, 'position');
        if (pos) {
          let color = '#ff4444';
          if (data.isCritical) color = '#ffcc00';
          else if (data.effectiveness > 1) color = '#ffee66';
          else if (data.effectiveness > 0 && data.effectiveness < 1) color = '#8899aa';
          this.particleSystem.spawn(pos.x, pos.y, 'hit', color, data.isCritical ? 15 : 8);
        }
      }

      if (data.isCritical || data.damage >= 20) {
        this.addScreenShake(
          data.isCritical ? 6 : 3,
          data.isCritical ? 300 : 150
        );
      }

      this._onRenderRequested();
    });

    eventBus.on('pokemon_fainted', (data) => {
      if (data.pos && data.spriteUrl) {
        this.entityRenderer.spawnFaintAnimation(data.entityId, data.pos, data.spriteUrl);
        this._onRenderRequested();
      }
    });

    eventBus.on('throw_projectile', (data) => {
      this.entityRenderer.spawnProjectileAnimation(data);
      this._onRenderRequested();
    });
  }

  /**
   * Activa sacudida de pantalla temporal.
   * @param {number} intensity - Amplitud máxima en píxeles
   * @param {number} durationMs - Duración en milisegundos
   */
  addScreenShake(intensity, durationMs) {
    this._screenShake = {
      intensity,
      duration: durationMs,
      startTime: performance.now(),
    };
    this._onRenderRequested();
  }

  /**
   * Destello de color temporal en la pantalla
   * @param {string} color - Color (ej. 'rgba(255, 0, 0, 0.5)')
   * @param {number} durationMs - Duración en ms
   */
  screenFlash(color, durationMs) {
    this._flash = {
      color,
      duration: durationMs,
      startTime: performance.now(),
    };
    this._onRenderRequested();
  }

  /**
   * Inicia un fade out a negro.
   * @param {number} durationMs - Duración del fade out en ms
   * @returns {Promise<void>} Promesa que se resuelve al terminar
   */
  startFadeOut(durationMs = 300) {
    return new Promise((resolve) => {
      this._fade = {
        state: 'out',
        duration: durationMs,
        startTime: performance.now(),
        resolve
      };
      this._onRenderRequested();
    });
  }

  /**
   * Inicia un fade in desde negro.
   * @param {number} durationMs - Duración del fade in en ms
   */
  startFadeIn(durationMs = 300) {
    this._fade = {
      state: 'in',
      duration: durationMs,
      startTime: performance.now(),
      resolve: null
    };
    this._currentFadeAlpha = 1;
    this._onRenderRequested();
  }

  /**
   * Actualiza animaciones (shake + VFX de entidades).
   * @param {number} now - Timestamp actual
   */
  update(now) {
    this._lastUpdateTime = now;
    this.entityRenderer.update(now);

    if (this._screenShake) {
      const elapsed = now - this._screenShake.startTime;
      if (elapsed >= this._screenShake.duration) {
        this._screenShake = null;
      } else {
        // Necesitamos seguir renderizando mientras tiembla
        this._onRenderRequested();
      }
    }

    if (this._flash) {
      const elapsed = now - this._flash.startTime;
      if (elapsed >= this._flash.duration) {
        this._flash = null;
      } else {
        this._onRenderRequested();
      }
    }

    if (this._fade) {
      const elapsed = now - this._fade.startTime;
      const progress = Math.min(1, elapsed / this._fade.duration);
      
      if (this._fade.state === 'out') {
        this._currentFadeAlpha = progress;
      } else {
        this._currentFadeAlpha = 1 - progress;
      }

      if (progress === 1) {
        if (this._fade.resolve) {
          this._fade.resolve();
        }
        if (this._fade.state === 'in') {
          this._currentFadeAlpha = 0;
        }
        this._fade = null;
      }
    }

    this.particleSystem.update(now);
  }

  /**
   * @returns {boolean} true si hay animaciones activas que requieren frames continuos
   */
  hasActiveAnimations() {
    return (
      this._screenShake !== null ||
      this._fade !== null ||
      this.entityRenderer.hasActiveEffects() ||
      this.particleSystem.particles.length > 0
    );
  }

  /**
   * Calcula el offset de sacudida actual con decaimiento.
   * @returns {{ x: number, y: number }}
   * @private
   */
  _getShakeOffset() {
    if (!this._screenShake) return { x: 0, y: 0 };

    const elapsed = this._lastUpdateTime - this._screenShake.startTime;
    const progress = Math.min(1, elapsed / this._screenShake.duration);
    const decay = 1 - progress;
    const intensity = this._screenShake.intensity * decay;

    return {
      x: (Math.random() - 0.5) * 2 * intensity,
      y: (Math.random() - 0.5) * 2 * intensity,
    };
  }

  /**
   * Ejecuta el pipeline completo de renderizado para un frame.
   * 
   * @param {Object} game - Estado actual del juego
   */
  render(game) {
    const { ctx, canvas } = this;

    // === CAPA 1: Limpiar canvas ===
    let bgColor = COLOR_FONDO;
    if (game && game.tileMap && game.tileMap.biome && game.tileMap.biome.void) {
      bgColor = game.tileMap.biome.void;
    }
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Asegurar que imageSmoothingEnabled siga desactivado
    ctx.imageSmoothingEnabled = false;

    // Sin mapa aún: pantalla de menú (HTML encima) o carga real
    if (!game || !game.tileMap || !game.camera) {
      const state = game?.getState?.();
      const isMenuScreen = state === GAME_STATES.TITLE
        || state === GAME_STATES.STARTER_SELECT
        || state === GAME_STATES.MENU
        || state === GAME_STATES.GAME_OVER
        || state === GAME_STATES.VICTORY
        || state === GAME_STATES.DIALOG;
      if (!isMenuScreen) {
        this._dibujarPantallaError(ctx, 'Cargando aventura...');
      }
      return;
    }

    const shake = this._getShakeOffset();

    // === CAPAS 2-3: Mapa y entidades (con screen shake) ===
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this.mapRenderer.render(ctx, game.tileMap, game.camera);

    if (game.entityManager) {
      this.entityRenderer.render(ctx, game.entityManager, game.camera, game.tileMap, game.itemsData);
    }

    this.particleSystem.render(ctx, game.camera);

    this._renderWeather(ctx, game.currentWeather || game.weather, canvas.width, canvas.height);

    ctx.restore();

    // === CAPA 4: Fade overlay ===
    if (this._currentFadeAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${this._currentFadeAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // === CAPA 4.5: Flash temporal ===
    if (this._flash) {
      const elapsed = this._lastUpdateTime - this._flash.startTime;
      const progress = Math.max(0, Math.min(1, elapsed / this._flash.duration));
      // El alpha va de 1 a 0
      const alpha = 1 - progress;
      
      // Parsear el color para aplicarle la opacidad
      ctx.fillStyle = this._flash.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    }

    // === CAPA 5: HUD (sin shake, legible, encima del fade) ===
    this.hud.render(ctx, game, canvas.width, canvas.height);

    // Log compacto abajo-izquierda (no tapa el centro del mapa)
    if (game.messageLog) {
      const logW = Math.min(280, Math.max(160, canvas.width - 360));
      const logX = 8;
      const logY = canvas.height - 78;
      game.messageLog.render(ctx, logX, logY, logW);
    }
  }

  /**
   * Dibuja los efectos de clima globales
   * @private
   */
  _renderWeather(ctx, weather, width, height) {
    if (!weather || weather === 'none' || weather === 'normal') return;

    // Aceptar IDs en español (canónicos) e inglés (legacy)
    const w = weather === 'lluvia' ? 'rain'
      : weather === 'sol' ? 'sun'
      : weather === 'tormenta_arena' ? 'sandstorm'
      : weather === 'granizo' ? 'hail'
      : weather;
    
    ctx.save();
    const time = performance.now();

    if (w === 'rain') {
      ctx.strokeStyle = 'rgba(150, 200, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Lluvia discreta (no tapa el suelo)
      for (let i = 0; i < 22; i++) {
        // Pseudoaleatorio basado en el índice y el tiempo
        const x = (i * 47 + time * 0.5) % width;
        const y = (i * 31 + time * 1.5) % height;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 15);
      }
      ctx.stroke();
    } else if (w === 'sun') {
      ctx.fillStyle = 'rgba(255, 200, 50, 0.08)';
      ctx.fillRect(0, 0, width, height);
    } else if (w === 'sandstorm') {
      ctx.fillStyle = 'rgba(210, 180, 140, 0.12)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(210, 150, 80, 0.6)';
      for (let i = 0; i < 40; i++) {
        const x = (i * 83 - time * 0.8) % width;
        const y = (i * 29 + Math.sin(time * 0.005 + i) * 20) % height;
        const drawX = x < 0 ? x + width : x;
        const drawY = y < 0 ? y + height : y;
        ctx.fillRect(drawX, drawY, 3, 1);
      }
    } else if (w === 'hail') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      for (let i = 0; i < 30; i++) {
        const x = (i * 61 + time * 0.2) % width;
        const y = (i * 43 + time * 0.8) % height;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
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
    const fontSize = Math.max(10, Math.floor(this.canvas.width / 40));
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
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
