/**
 * EntityRenderer.js
 * 
 * Renderizador de entidades del juego (Pokémon, items) sobre el mapa.
 * Solo dibuja entidades que están en tiles actualmente visibles (FOV).
 * 
 * Para Pokémon:
 * - Sprite o placeholder centrado en el tile
 * - Barra de HP encima (verde → amarillo → rojo según %)
 * - Indicador de aliado (borde azul) o enemigo (borde rojo)
 * 
 * Para Items:
 * - Orbe/icono coloreado según tipo de item
 * - Animación de rebote sutil
 */

import { SpriteManager } from './SpriteManager.js';

/** Colores de la barra de HP según porcentaje */
const HP_COLORES = {
  alto: '#2ecc71',      // Verde - HP > 50%
  medio: '#f1c40f',     // Amarillo - HP 25-50%
  bajo: '#e74c3c',      // Rojo - HP < 25%
  fondo: 'rgba(0, 0, 0, 0.6)',  // Fondo de la barra
};

/** Dimensiones de la barra de HP (relativas al tamaño del tile) */
const HP_BAR = {
  anchoPorcentaje: 0.8,   // 80% del ancho del tile
  altoPx: 3,              // Alto en píxeles
  offsetY: 2,             // Separación desde el borde superior del tile
};

/** Colores para indicadores de equipo */
const INDICADOR_ALIADO = 'rgba(52, 152, 219, 0.7)';   // Azul
const INDICADOR_ENEMIGO = 'rgba(231, 76, 60, 0.5)';   // Rojo

/** Colores de orbes de items según tipo */
const ITEM_COLORES = {
  pocion: '#e74c3c',     // Rojo
  baya: '#2ecc71',       // Verde
  semilla: '#f1c40f',    // Amarillo
  orbe: '#3498db',       // Azul
  tm: '#9b59b6',         // Púrpura
  default: '#95a5a6',    // Gris
};

/** Velocidad y amplitud de la animación de rebote de items */
const REBOTE_VELOCIDAD = 0.005;
const REBOTE_AMPLITUD = 2; // píxeles

/** Duración de efectos VFX en ms */
const FLOAT_DURATION = 800;
const FLASH_DURATION = 150;

/** Iconos de estado sobre el sprite */
const STATUS_ICONS = {
  sleep: { text: 'zZz', color: '#a8b8ff' },
  poison: { text: '~', color: '#a040a0' },
  burn: { text: '*', color: '#f08030' },
  paralyze: { text: '~', color: '#f8d030' },
  freeze: { text: '*', color: '#98d8d8' },
};

export class EntityRenderer {
  /**
   * Crea el renderizador de entidades.
   * 
   * @param {SpriteManager} spriteManager - Gestor de sprites para cargar/dibujar imágenes
   */
  constructor(spriteManager) {
    /** @type {SpriteManager} */
    this.spriteManager = spriteManager;

    /** Timestamp para animaciones */
    this._tiempo = 0;

    /** @type {Array<{entityId: number, text: string, startTime: number, duration: number, color: string}>} */
    this._danosFlotantes = [];

    /** @type {Array<{entityId: number, startTime: number, duration: number}>} */
    this._damageFlashes = [];

    /** @type {Array<{entityId: number, pos: Object, spriteUrl: string, startTime: number, duration: number}>} */
    this._faintingEntities = [];
  }

  /**
   * Añade una animación de debilitamiento (sink & fade out).
   * @param {number} entityId
   * @param {Object} pos
   * @param {string} spriteUrl
   */
  spawnFaintAnimation(entityId, pos, spriteUrl) {
    this._faintingEntities.push({
      entityId,
      pos: { x: pos.x, y: pos.y },
      spriteUrl,
      startTime: performance.now(),
      duration: 500
    });
  }

  /**
   * Añade un número de daño flotante sobre un Pokémon.
   * @param {number} entityId
   * @param {number} damage
   * @param {boolean} isCritical
   */
  spawnFloatingDamage(entityId, damage, isCritical) {
    const text = isCritical ? `CRIT! -${damage}` : `-${damage}`;
    const color = isCritical ? '#ff8800' : '#ff4444';
    this._danosFlotantes.push({
      entityId,
      text,
      startTime: performance.now(),
      duration: FLOAT_DURATION,
      color,
    });
  }

  /**
   * Activa parpadeo de daño en el sprite del Pokémon.
   * @param {number} entityId
   */
  spawnDamageFlash(entityId) {
    this._damageFlashes.push({
      entityId,
      startTime: performance.now(),
      duration: FLASH_DURATION,
    });
  }

  /**
   * Actualiza y elimina efectos VFX expirados.
   * @param {number} now - Timestamp actual (performance.now)
   */
  update(now) {
    this._danosFlotantes = this._danosFlotantes.filter(
      (d) => now - d.startTime < d.duration
    );
    this._damageFlashes = this._damageFlashes.filter(
      (f) => now - f.startTime < f.duration
    );
    this._faintingEntities = this._faintingEntities.filter(
      (f) => now - f.startTime < f.duration
    );
  }

  /**
   * @returns {boolean} true si hay animaciones VFX activas
   */
  hasActiveEffects() {
    return this._danosFlotantes.length > 0 || this._damageFlashes.length > 0 || this._faintingEntities.length > 0;
  }

  /**
   * Renderiza todas las entidades visibles en el mapa.
   * Solo dibuja entidades cuyo tile tiene visibilidad = 2 (actualmente visible).
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas 2D
   * @param {Object} entityManager - Gestor de entidades con método getEntities()
   * @param {import('./Camera.js').Camera} camera - Cámara/viewport actual
   * @param {import('../map/TileMap.js').TileMap} tileMap - Mapa de tiles para comprobar visibilidad
   * @param {Array} itemsData - Datos de los items (para los sprites)
   */
  render(ctx, entityManager, camera, tileMap, itemsData = []) {
    this._tiempo = performance.now();

    // Verificar que el entityManager existe y tiene el método correcto
    if (!entityManager || typeof entityManager.getEntitiesWithComponents !== 'function') {
      return;
    }

    const entidades = entityManager.getEntitiesWithComponents('position');

    for (const entityId of entidades) {
      const pos = entityManager.getComponent(entityId, 'position');
      
      // Solo dibujar entidades en tiles actualmente visibles
      if (tileMap.getVisibility(pos.x, pos.y) !== 2) continue;

      // Solo dibujar entidades dentro del viewport de la cámara
      if (!camera.isVisible(pos.x, pos.y)) continue;

      // Elegir método de renderizado según tipo de entidad
      if (entityManager.hasComponent(entityId, 'pokemonInfo')) {
        this._dibujarPokemon(ctx, entityId, entityManager, camera, pos);
      } else if (entityManager.hasComponent(entityId, 'itemDrop')) {
        this._dibujarItem(ctx, entityId, entityManager, camera, pos, itemsData);
      }
    }

    this._dibujarDanosFlotantes(ctx, entityManager, camera, tileMap);
    this._dibujarFaintingEntities(ctx, camera);
  }

  /**
   * Dibuja entidades que están debilitándose (animación de fade/sink).
   * @private
   */
  _dibujarFaintingEntities(ctx, camera) {
    if (this._faintingEntities.length === 0) return;

    const tileSize = camera.tileSize;
    for (const f of this._faintingEntities) {
      if (!camera.isVisible(f.pos.x, f.pos.y)) continue;

      const screenPos = camera.worldToScreen(f.pos.x, f.pos.y);
      const elapsed = this._tiempo - f.startTime;
      const progress = Math.min(1, elapsed / f.duration);
      
      const sinkY = progress * (tileSize / 2); // se hunde
      const alpha = 1 - progress; // se desvanece

      const margen = Math.floor(tileSize * 0.1);
      const spriteSize = tileSize - margen * 2;

      ctx.save();
      ctx.globalAlpha = alpha;
      this.spriteManager.drawSprite(
        ctx,
        f.spriteUrl,
        screenPos.x + margen,
        screenPos.y + margen + sinkY,
        spriteSize,
        spriteSize,
        ''
      );
      ctx.restore();
    }
  }

  /**
   * Dibuja un Pokémon en el mapa con su sprite, barra de HP e indicador de equipo.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {number} entityId - ID de la entidad
   * @param {Object} entityManager - Gestor de entidades ECS
   * @param {import('./Camera.js').Camera} camera - Cámara actual
   * @param {Object} pos - Componente de posición {x, y}
   * @private
   */
  _dibujarPokemon(ctx, entityId, entityManager, camera, pos) {
    const tileSize = camera.tileSize;
    
    // Lerp (animación de movimiento suave)
    let drawX = pos.x;
    let drawY = pos.y;
    if (pos.moveStartTime) {
      const elapsed = this._tiempo - pos.moveStartTime;
      const MOVE_DURATION = 150; // ms
      if (elapsed < MOVE_DURATION) {
        const t = elapsed / MOVE_DURATION;
        // Ease out quad
        const ease = t * (2 - t);
        drawX = pos.prevX + (pos.x - pos.prevX) * ease;
        drawY = pos.prevY + (pos.y - pos.prevY) * ease;
      } else {
        // Movimiento terminado, sincronizar prev
        pos.prevX = pos.x;
        pos.prevY = pos.y;
      }
    }
    
    const screenPos = camera.worldToScreen(drawX, drawY);
    const sx = screenPos.x;
    const sy = screenPos.y;

    const pokemonInfo = entityManager.getComponent(entityId, 'pokemonInfo');
    const sprite = entityManager.getComponent(entityId, 'sprite');
    const fighter = entityManager.getComponent(entityId, 'fighter');
    const partyMember = entityManager.getComponent(entityId, 'partyMember');
    const isEnemy = entityManager.hasComponent(entityId, 'aiControlled');

    // Indicador de aliado/enemigo (borde coloreado detrás del sprite)
    if (partyMember) {
      this._dibujarIndicadorEquipo(ctx, sx, sy, tileSize, INDICADOR_ALIADO);
    } else if (isEnemy) {
      this._dibujarIndicadorEquipo(ctx, sx, sy, tileSize, INDICADOR_ENEMIGO);
    }

    // Dibujar sprite o placeholder
    // El sprite se dibuja ligeramente más pequeño y centrado para dar margen visual
    const margen = Math.floor(tileSize * 0.1);
    const spriteSize = tileSize - margen * 2;

    this.spriteManager.drawSprite(
      ctx,
      sprite ? sprite.url : '',
      sx + margen,
      sy + margen,
      spriteSize,
      spriteSize,
      pokemonInfo ? pokemonInfo.name : '?'
    );

    // Parpadeo de daño sobre el sprite
    if (this._isFlashing(entityId)) {
      const flashProgress = this._getFlashProgress(entityId);
      const alpha = 0.6 * (1 - flashProgress);
      ctx.fillStyle = flashProgress < 0.5 ? `rgba(255, 255, 255, ${alpha})` : `rgba(255, 60, 60, ${alpha})`;
      ctx.fillRect(sx + margen, sy + margen, spriteSize, spriteSize);
    } else if (fighter && fighter.statusEffects && fighter.statusEffects.length > 0) {
      // Tinte de estado persistente
      const tintColors = {
          'poison': 'rgba(128, 0, 128, 0.3)',
          'burn': 'rgba(255, 69, 0, 0.3)',
          'paralyze': 'rgba(255, 255, 0, 0.3)',
          'sleep': 'rgba(100, 149, 237, 0.3)',
          'freeze': 'rgba(0, 255, 255, 0.3)',
          'confusion': 'rgba(255, 105, 180, 0.3)'
      };
      const effectObj = fighter.statusEffects[0];
      const effectType = typeof effectObj === 'string' ? effectObj : effectObj.type;
      if (tintColors[effectType]) {
          ctx.fillStyle = tintColors[effectType];
          ctx.fillRect(sx + margen, sy + margen, spriteSize, spriteSize);
      }
    }

    // Indicadores de alerta y estado
    this._dibujarIndicadoresEstado(ctx, entityId, entityManager, sx, sy, tileSize);

    // Dibujar barra de HP si el Pokémon tiene datos de vida
    if (fighter && fighter.hp !== undefined && fighter.maxHp !== undefined) {
      this._dibujarBarraHP(ctx, sx, sy, tileSize, fighter.hp, fighter.maxHp);
    }
  }

  /**
   * @param {number} entityId
   * @returns {boolean}
   * @private
   */
  _isFlashing(entityId) {
    return this._damageFlashes.some((f) => f.entityId === entityId);
  }

  /**
   * @param {number} entityId
   * @returns {number} Progreso 0-1 del flash activo
   * @private
   */
  _getFlashProgress(entityId) {
    const flash = this._damageFlashes.find((f) => f.entityId === entityId);
    if (!flash) return 1;
    return Math.min(1, (this._tiempo - flash.startTime) / flash.duration);
  }

  /**
   * Dibuja iconos de alerta (!) y estados alterados sobre el Pokémon.
   * @private
   */
  _dibujarIndicadoresEstado(ctx, entityId, entityManager, sx, sy, tileSize) {
    const ai = entityManager.getComponent(entityId, 'aiControlled');
    const fighter = entityManager.getComponent(entityId, 'fighter');

    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Alerta de persecución
    if (ai && ai.behavior === 'chase' && ai.alertedTo !== null) {
      const pulse = 0.7 + Math.sin(this._tiempo * 0.012) * 0.3;
      ctx.fillStyle = `rgba(255, 204, 68, ${pulse})`;
      ctx.fillText('!', sx + tileSize / 2, sy - 4);
    }

    // Estados alterados (todos apilados hacia arriba)
    if (fighter && fighter.statusEffects && fighter.statusEffects.length > 0) {
      let iconY = sy + tileSize - 4; // Empezar desde abajo
      for (const effectObj of fighter.statusEffects) {
        const effectType = typeof effectObj === 'string' ? effectObj : effectObj.type;
        const icon = STATUS_ICONS[effectType];
        if (icon) {
          ctx.fillStyle = icon.color;
          ctx.fillText(icon.text, sx + tileSize - 6, iconY);
          iconY -= 8; // Apilar el siguiente más arriba
        }
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Dibuja todos los números de daño flotantes activos.
   * @private
   */
  _dibujarDanosFlotantes(ctx, entityManager, camera, tileMap) {
    if (this._danosFlotantes.length === 0) return;

    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const dano of this._danosFlotantes) {
      const pos = entityManager.getComponent(dano.entityId, 'position');
      if (!pos || tileMap.getVisibility(pos.x, pos.y) !== 2) continue;
      if (!camera.isVisible(pos.x, pos.y)) continue;

      const tileSize = camera.tileSize;
      const screenPos = camera.worldToScreen(pos.x, pos.y);
      const elapsed = this._tiempo - dano.startTime;
      const progress = Math.min(1, elapsed / dano.duration);
      const offsetY = progress * 30;
      const alpha = 1 - progress;

      ctx.fillStyle = dano.color;
      ctx.globalAlpha = alpha;
      ctx.fillText(
        dano.text,
        screenPos.x + tileSize / 2,
        screenPos.y + tileSize * 0.3 - offsetY
      );
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Dibuja el indicador de equipo (borde coloreado) alrededor del tile del Pokémon.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {number} sx - Posición X en pantalla
   * @param {number} sy - Posición Y en pantalla
   * @param {number} size - Tamaño del tile
   * @param {string} color - Color del indicador (rgba)
   * @private
   */
  _dibujarIndicadorEquipo(ctx, sx, sy, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
  }

  /**
   * Dibuja la barra de HP encima del Pokémon.
   * El color cambia según el porcentaje de vida:
   * - Verde (>50%), Amarillo (25-50%), Rojo (<25%)
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {number} sx - Posición X del tile en pantalla
   * @param {number} sy - Posición Y del tile en pantalla
   * @param {number} tileSize - Tamaño del tile
   * @param {number} hp - Puntos de vida actuales
   * @param {number} maxHp - Puntos de vida máximos
   * @private
   */
  _dibujarBarraHP(ctx, sx, sy, tileSize, hp, maxHp) {
    const porcentaje = Math.max(0, Math.min(1, hp / maxHp));

    // Dimensiones de la barra
    const anchoTotal = Math.floor(tileSize * HP_BAR.anchoPorcentaje);
    const alto = HP_BAR.altoPx;
    const barX = sx + (tileSize - anchoTotal) / 2;
    const barY = sy + HP_BAR.offsetY;

    // Fondo de la barra (oscuro semitransparente)
    ctx.fillStyle = HP_COLORES.fondo;
    ctx.fillRect(barX, barY, anchoTotal, alto);

    // Color de la vida según porcentaje
    let color;
    if (porcentaje > 0.5) {
      color = HP_COLORES.alto;
    } else if (porcentaje > 0.25) {
      color = HP_COLORES.medio;
    } else {
      color = HP_COLORES.bajo;
    }

    // Barra de vida
    const anchoVida = Math.floor(anchoTotal * porcentaje);
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, anchoVida, alto);

    // Borde fino de la barra
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, anchoTotal, alto);
  }

  /**
   * Dibuja un item en el mapa como un orbe coloreado con animación de rebote.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {number} entityId - ID de la entidad
   * @param {Object} entityManager - Gestor de entidades ECS
   * @param {import('./Camera.js').Camera} camera - Cámara actual
   * @param {Object} pos - Componente de posición {x, y}
   * @param {Array} itemsData - Array con datos de los items
   * @private
   */
  _dibujarItem(ctx, entityId, entityManager, camera, pos, itemsData) {
    const tileSize = camera.tileSize;
    const screenPos = camera.worldToScreen(pos.x, pos.y);

    const itemDrop = entityManager.getComponent(entityId, 'itemDrop');
    if (!itemDrop) return;

    // Animación de rebote: cada item tiene fase diferente basada en su posición
    const fase = (pos.x * 7 + pos.y * 13) + this._tiempo * REBOTE_VELOCIDAD;
    const offsetY = Math.sin(fase) * REBOTE_AMPLITUD;

    const itemData = itemsData.find(i => i.id === itemDrop.itemId);
    
    // Si tenemos un sprite URL, usamos el SpriteManager
    if (itemData && itemData.spriteUrl) {
      const margen = Math.floor(tileSize * 0.2);
      const spriteSize = tileSize - margen * 2;
      this.spriteManager.drawSprite(
        ctx,
        itemData.spriteUrl,
        screenPos.x + margen,
        screenPos.y + margen + offsetY,
        spriteSize,
        spriteSize,
        itemData.name
      );
      return;
    }

    // Fallback: dibujar orbe de color
    // Centro del tile con offset de rebote
    const centroX = screenPos.x + tileSize / 2;
    const centroY = screenPos.y + tileSize / 2 + offsetY;

    // Radio del orbe (25% del tamaño del tile)
    const radio = tileSize * 0.25;

    // Color según tipo de item
    const tipoItem = (itemDrop && itemDrop.itemId) ? itemDrop.itemId.toLowerCase() : 'default';
    const color = ITEM_COLORES[tipoItem] || ITEM_COLORES.default;

    // Dibujar el orbe con brillo
    // Brillo exterior (glow)
    ctx.fillStyle = color + '40'; // 25% opacidad
    ctx.beginPath();
    ctx.arc(centroX, centroY, radio * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Orbe principal
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(centroX, centroY, radio, 0, Math.PI * 2);
    ctx.fill();

    // Reflejo de luz (punto blanco)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(centroX - radio * 0.3, centroY - radio * 0.3, radio * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Borde del orbe
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centroX, centroY, radio, 0, Math.PI * 2);
    ctx.stroke();
  }
}
