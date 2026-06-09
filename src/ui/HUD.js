/**
 * HUD.js — Heads-Up Display del juego
 * Muestra información del Pokémon activo, piso, minimap
 */

import { COLORS, TILE_SIZE } from '../constants.js';

export class HUD {
  constructor() {
    this.showMinimap = false;
    this.animationFrame = 0;
  }

  /**
   * Renderiza el HUD completo
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {Object} gameState - Estado del juego
   * @param {number} canvasWidth - Ancho del canvas
   * @param {number} canvasHeight - Alto del canvas
   */
  render(ctx, gameState, canvasWidth, canvasHeight) {
    this.animationFrame++;
    
    this.renderFloorInfo(ctx, gameState, canvasWidth);
    
    // Estado del equipo (arriba a la izquierda)
    const team = [];
    if (gameState._playerId) {
      team.push(gameState._playerId);
      const partyIds = gameState.teamManager?.getParty() || [];
      partyIds.forEach(id => {
        if (id !== gameState._playerId && !team.includes(id)) {
          team.push(id);
        }
      });
    }

    if (team.length > 0) {
      this.renderPartyStatus(ctx, gameState, canvasWidth, canvasHeight);
    }

    // Controles (abajo derecha)
    this.renderControls(ctx, canvasWidth, canvasHeight);

    // Movimientos del jugador (abajo izquierda)
    if (gameState._playerId) {
      this.renderPlayerMoves(ctx, gameState, canvasWidth, canvasHeight);
    }

    // Minimapa (arriba derecha)
    if (this.showMinimap && gameState.tileMap) {
      this.renderMinimap(ctx, gameState, canvasWidth);
    }
  }

  /**
   * Info del piso actual (esquina superior izquierda)
   */
  renderFloorInfo(ctx, gameState, canvasWidth) {
    const padding = 8;
    const width = 200;
    const height = 30;

    ctx.save();

    // Fondo
    ctx.fillStyle = 'rgba(10, 10, 26, 0.9)';
    ctx.fillRect(padding, padding, width, height);
    ctx.strokeStyle = COLORS.UI_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, padding, width, height);

    // Título de la zona
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(gameState.zoneName || 'Mazmorra', padding + 8, padding + 8);
    
    // Piso
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText(`Piso ${gameState.floor || 1}`, padding + 8, padding + 22);

    ctx.restore();
  }

  /**
   * Estado del equipo (esquina superior derecha)
   */
  renderPartyStatus(ctx, gameState, canvasWidth, canvasHeight) {
    if (!gameState.party || gameState.party.length === 0) return;

    const padding = 8;
    const panelWidth = 180;
    const pokemonHeight = 36;
    const panelHeight = gameState.party.length * pokemonHeight + 12;
    const x = canvasWidth - panelWidth - padding;

    ctx.save();

    // Fondo
    ctx.fillStyle = 'rgba(10, 10, 26, 0.9)';
    ctx.fillRect(x, padding, panelWidth, panelHeight);
    ctx.strokeStyle = COLORS.UI_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, padding, panelWidth, panelHeight);

    // Cada Pokémon del equipo
    for (let i = 0; i < gameState.party.length; i++) {
      const poke = gameState.party[i];
      const py = padding + 6 + i * pokemonHeight;
      
      // Indicador de líder
      if (poke.isLeader) {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.15)';
        ctx.fillRect(x + 2, py - 2, panelWidth - 4, pokemonHeight - 2);
      }

      // Nombre y nivel
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillStyle = poke.hp > 0 ? COLORS.UI_TEXT : '#666';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${poke.name}`, x + 8, py);
      ctx.fillStyle = '#aaa';
      ctx.fillText(`Nv.${poke.level}`, x + panelWidth - 50, py);

      // Tipos
      if (poke.types && poke.types.length > 0) {
        ctx.fillStyle = '#66a';
        ctx.fillText(poke.types.join('/'), x + 8, py + 8);
      }

      // Barra de HP
      const barX = x + 8;
      const barY = py + 16;
      const barWidth = panelWidth - 20;
      const barHeight = 4;
      const hpPercent = poke.maxHp > 0 ? poke.hp / poke.maxHp : 0;

      // Fondo de la barra
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      // Relleno de HP
      if (hpPercent > 0.5) {
        ctx.fillStyle = COLORS.HP_GREEN;
      } else if (hpPercent > 0.25) {
        ctx.fillStyle = COLORS.HP_YELLOW;
      } else {
        ctx.fillStyle = COLORS.HP_RED;
      }
      ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);

      // Borde de la barra
      ctx.strokeStyle = 'rgba(74, 74, 106, 0.5)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(barX, barY, barWidth, barHeight);

      // Texto HP
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillStyle = '#888';
      ctx.fillText(`${poke.hp}/${poke.maxHp}`, barX + barWidth + 2 - 44, barY - 1);

      // Tripa (Solo para el líder)
      if (poke.isLeader && poke.belly !== undefined) {
        ctx.fillStyle = '#ffaa00';
        const displayBelly = Math.ceil(poke.belly);
        ctx.fillText(`Tripa: ${displayBelly}/${poke.maxBelly}`, barX, barY + barHeight + 4);
      }

      // Barra de XP
      const xpBarY = barY + 12;
      const xpBarHeight = 2;
      
      let xpProgress = 0;
      if (poke.level < 100 && poke.nextLevelXp > poke.currentLevelXp) {
        xpProgress = (poke.xp - poke.currentLevelXp) / (poke.nextLevelXp - poke.currentLevelXp);
        xpProgress = Math.max(0, Math.min(1, xpProgress));
      }

      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(barX, xpBarY, barWidth, xpBarHeight);
      
      ctx.fillStyle = '#4ade80'; // XP color (verde brillante)
      ctx.fillRect(barX, xpBarY, barWidth * xpProgress, xpBarHeight);
    }

    ctx.restore();
  }

  /**
   * Recordatorio de controles (esquina inferior derecha)
   */
  renderControls(ctx, canvasWidth, canvasHeight) {
    const controls = [
      'WASD:Mover  Z:Atacar',
      'X:Items  C:Equipo',
      'M:Mapa   Esc:Pausa',
      '1-4:Usar Movimiento'
    ];

    const padding = 8;
    const lineHeight = 11;
    const bgHeight = controls.length * lineHeight + 8;
    const bgWidth = 170;
    const x = canvasWidth - bgWidth - padding;
    const y = canvasHeight - bgHeight - padding;

    ctx.save();

    ctx.fillStyle = 'rgba(10, 10, 26, 0.7)';
    ctx.fillRect(x, y, bgWidth, bgHeight);

    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(160, 160, 200, 0.6)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let i = 0; i < controls.length; i++) {
      ctx.fillText(controls[i], x + 6, y + 4 + i * lineHeight);
    }

    ctx.restore();
  }

  /**
   * HUD de movimientos del jugador (esquina inferior izquierda)
   */
  renderPlayerMoves(ctx, game, canvasWidth, canvasHeight) {
    const info = game.entityManager.getComponent(game._playerId, 'pokemonInfo');
    if (!info || !info.currentMoves) return;

    const moves = info.currentMoves;
    const selectedIdx = game._selectedMoveIndex || 0;

    const padding = 8;
    const lineHeight = 12;
    const bgHeight = moves.length * lineHeight + 8;
    const bgWidth = 140;
    const x = padding;
    const y = canvasHeight - bgHeight - padding;

    ctx.save();

    // Fondo del panel de movimientos
    ctx.fillStyle = 'rgba(10, 10, 26, 0.7)';
    ctx.fillRect(x, y, bgWidth, bgHeight);
    
    // Borde
    ctx.strokeStyle = 'rgba(74, 74, 106, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, bgWidth, bgHeight);

    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let i = 0; i < moves.length; i++) {
      const moveData = moves[i];
      const moveDef = game.movesData.find(m => m.id === moveData.moveId);
      if (!moveDef) continue;

      const isSelected = i === selectedIdx;
      
      // Resaltar el seleccionado
      if (isSelected) {
        ctx.fillStyle = 'rgba(255, 200, 50, 0.3)';
        ctx.fillRect(x + 2, y + 2 + i * lineHeight, bgWidth - 4, lineHeight);
        ctx.fillStyle = '#ffcc44'; // Texto amarillo brillante
      } else {
        ctx.fillStyle = '#a0a0c8'; // Texto apagado
      }

      const text = `[${i + 1}] ${moveDef.name} (${moveData.currentPP}/${moveData.maxPP})`;
      ctx.fillText(text, x + 6, y + 5 + i * lineHeight);
    }

    ctx.restore();
  }

  /**
   * Minimap (esquina superior derecha, debajo del party status)
   */
  renderMinimap(ctx, gameState, canvasWidth) {
    const tileMap = gameState.tileMap;
    if (!tileMap) return;

    const scale = 2;
    const mapW = tileMap.width * scale;
    const mapH = tileMap.height * scale;
    const padding = 8;
    const x = canvasWidth - mapW - padding;
    const y = canvasWidth > 600 ? 180 : 100; // Debajo del party

    ctx.save();

    // Fondo
    ctx.fillStyle = 'rgba(10, 10, 26, 0.95)';
    ctx.fillRect(x - 2, y - 2, mapW + 4, mapH + 4);
    ctx.strokeStyle = COLORS.UI_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2, y - 2, mapW + 4, mapH + 4);

    // Dibujar tiles
    for (let ty = 0; ty < tileMap.height; ty++) {
      for (let tx = 0; tx < tileMap.width; tx++) {
        const vis = tileMap.getVisibility(tx, ty);
        if (vis === 0) continue;

        const tile = tileMap.getTile(tx, ty);
        if (!tile) continue;

        let isRestRoom = false;
        if (tileMap.rooms && tile.walkable) {
            const room = tileMap.rooms.find(r => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
            if (room && room.type === 'rest') isRestRoom = true;
        }

        if (vis === 2) {
          if (isRestRoom) ctx.fillStyle = '#4ade80';
          else ctx.fillStyle = tile.walkable ? '#6a6a8a' : '#3a3a5a';
        } else {
          if (isRestRoom) ctx.fillStyle = '#166534';
          else ctx.fillStyle = tile.walkable ? '#3a3a4a' : '#2a2a3a';
        }
        ctx.fillRect(x + tx * scale, y + ty * scale, scale, scale);
      }
    }

    // Posición del jugador (punto parpadeante)
    if (gameState.playerPos) {
      const blink = Math.sin(this.animationFrame * 0.1) > 0;
      ctx.fillStyle = blink ? '#ffcc44' : '#ff8800';
      ctx.fillRect(
        x + gameState.playerPos.x * scale - 1,
        y + gameState.playerPos.y * scale - 1,
        scale + 2,
        scale + 2
      );
    }

    // Posición de escaleras (verde brillante)
    if (gameState.stairsPos && tileMap.getVisibility(gameState.stairsPos.x, gameState.stairsPos.y) > 0) {
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(
        x + gameState.stairsPos.x * scale,
        y + gameState.stairsPos.y * scale,
        scale,
        scale
      );
    }

    // Dibujar items y enemigos
    if (gameState.entityManager) {
      // Ítems (cyan)
      const items = gameState.entityManager.getEntitiesWithComponents('item', 'position');
      items.forEach(id => {
        const pos = gameState.entityManager.getComponent(id, 'position');
        if (tileMap.getVisibility(pos.x, pos.y) > 0) {
          ctx.fillStyle = '#00ffff';
          ctx.fillRect(x + pos.x * scale, y + pos.y * scale, scale, scale);
        }
      });

      // Enemigos (rojo)
      const enemies = gameState.entityManager.getEntitiesWithComponents('ai', 'position', 'fighter');
      enemies.forEach(id => {
        const fighter = gameState.entityManager.getComponent(id, 'fighter');
        if (fighter.hp <= 0) return; // Enemigo derrotado
        const pos = gameState.entityManager.getComponent(id, 'position');
        if (tileMap.getVisibility(pos.x, pos.y) === 2) { // Solo si están en FOV directo
          ctx.fillStyle = '#ff4444';
          ctx.fillRect(x + pos.x * scale, y + pos.y * scale, scale, scale);
        }
      });
    }

    ctx.restore();
  }

  /**
   * Toggle minimap
   */
  toggleMinimap() {
    this.showMinimap = !this.showMinimap;
  }
}
