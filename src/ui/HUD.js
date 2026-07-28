/**
 * HUD.js — Heads-Up Display del juego
 * Muestra información del Pokémon activo, piso, minimap
 */

import { COLORS, TILE_SIZE, TYPE_NAMES_ES } from '../constants.js';

export class HUD {
  constructor() {
    this.showMinimap = true;
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
    
    // Estado del equipo
    if (gameState.party && gameState.party.length > 0) {
      this.renderPartyStatus(ctx, gameState, canvasWidth, canvasHeight);
    }

    // Movimientos del jugador (abajo izquierda)
    if (gameState._playerId) {
      this.renderPlayerMoves(ctx, gameState, canvasWidth, canvasHeight);
    }

    // Minimapa (arriba derecha, debajo del equipo)
    if (this.showMinimap && gameState.tileMap) {
      this.renderMinimap(ctx, gameState, canvasWidth, canvasHeight);
    }
  }

  /**
   * Info del piso actual (esquina superior izquierda)
   */
  renderFloorInfo(ctx, gameState, canvasWidth) {
    const padding = 8;
    const width = 230;
    const height = 48;

    ctx.save();

    // Fondo
    ctx.fillStyle = 'rgba(10, 10, 26, 0.7)';
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
    
    // Piso + monedas + mochila
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText(`Piso ${gameState.floor || 1}`, padding + 8, padding + 22);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`${gameState.coins || 0} Poké`, padding + 90, padding + 22);
    const invLen = (gameState.inventory || []).length;
    const invMax = gameState.maxInventorySize || 24;
    ctx.fillStyle = invLen >= invMax ? '#ff6666' : (invLen >= invMax - 2 ? '#ffaa66' : '#aaaacc');
    ctx.fillText(`Bolsa ${invLen}/${invMax}`, padding + 8, padding + 32);

    // Enemigos vivos en el piso
    let hostiles = 0;
    try {
      const em = gameState.entityManager;
      if (em) {
        for (const id of em.getEntitiesWithComponents('fighter', 'aiControlled')) {
          if (em.hasComponent(id, 'partyMember')) continue;
          if (em.hasComponent(id, 'npcMerchant') || em.hasComponent(id, 'npcFriendly')) continue;
          const f = em.getComponent(id, 'fighter');
          if (f && f.hp > 0) hostiles++;
        }
      }
    } catch (e) {}
    if (hostiles > 0) {
      ctx.fillStyle = '#ff8866';
      ctx.fillText(`${hostiles} enem.`, padding + 150, padding + 22);
    }

    const w = gameState.currentWeather;
    if (w && w !== 'normal') {
      const labels = { lluvia: 'Lluvia', sol: 'Sol', tormenta_arena: 'Arena', granizo: 'Granizo' };
      ctx.fillStyle = '#6ab0ff';
      ctx.fillText(labels[w] || w, padding + 110, padding + 32);
    }
    if ((gameState.fovRadiusModifier || 0) < 0) {
      ctx.fillStyle = '#cc99ff';
      ctx.fillText('Niebla', padding + 150, padding + 32);
    }

    ctx.restore();
  }

  /**
   * Estado del equipo (esquina superior derecha)
   */
  renderPartyStatus(ctx, gameState, canvasWidth, canvasHeight) {
    if (!gameState.party || gameState.party.length === 0) return;

    const padding = 4;
    // Franja mínima: nombre corto + barra HP; tripa solo en líder
    const panelWidth = 92;
    const leaderH = 15;
    const allyH = 10;
    let panelHeight = 4;
    for (const poke of gameState.party) {
      panelHeight += poke.isLeader ? leaderH : allyH;
    }
    const x = canvasWidth - panelWidth - padding;

    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 26, 0.42)';
    ctx.fillRect(x, padding, panelWidth, panelHeight);
    ctx.strokeStyle = 'rgba(74, 74, 106, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, padding, panelWidth, panelHeight);

    let py = padding + 2;
    for (let i = 0; i < gameState.party.length; i++) {
      const poke = gameState.party[i];
      const rowH = poke.isLeader ? leaderH : allyH;
      const hpPercent = poke.maxHp > 0 ? poke.hp / poke.maxHp : 0;

      ctx.font = '5px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = poke.hp > 0 ? (poke.isLeader ? COLORS.UI_TEXT : 'rgba(200,200,220,0.85)') : '#555';

      let nameLabel = poke.name.length > 7 ? poke.name.slice(0, 6) + '…' : poke.name;
      if (poke.isLeader && poke.hp > 0) {
        const arrows = { up: '↑', down: '↓', left: '←', right: '→' };
        let arrow = arrows[poke.facing] || '·';
        if (poke.facingDx && poke.facingDy) {
          if (poke.facingDy < 0 && poke.facingDx < 0) arrow = '↖';
          else if (poke.facingDy < 0 && poke.facingDx > 0) arrow = '↗';
          else if (poke.facingDy > 0 && poke.facingDx < 0) arrow = '↙';
          else if (poke.facingDy > 0 && poke.facingDx > 0) arrow = '↘';
        }
        nameLabel = `${arrow}${nameLabel}`;
      }
      ctx.fillText(nameLabel, x + 3, py);

      // Nivel / DEB a la derecha (muy corto)
      ctx.fillStyle = poke.hp <= 0 ? '#f66' : '#666';
      ctx.fillText(poke.hp <= 0 ? '×' : `${poke.level}`, x + panelWidth - 12, py);

      // Estados (1 letra máx. 2)
      const icons = { poison: 'V', burn: 'Q', paralyze: 'P', sleep: 'Z', freeze: 'H', confuse: '?', leech_seed: 'D', bound: 'A' };
      const parts = [];
      if (poke.statusEffects?.length) {
        for (const s of poke.statusEffects) {
          parts.push((s.type === 'poison' && s.badly) ? 'T' : (icons[s.type] || '!'));
          if (parts.length >= 2) break;
        }
      }
      if (poke.charging) parts.push('C');
      else if (poke.biding) parts.push('G');
      if (parts.length) {
        ctx.fillStyle = '#f66';
        ctx.fillText(parts.join(''), x + 3 + Math.min(ctx.measureText(nameLabel).width, 48) + 2, py);
      }

      // Barra HP ultrafina
      const barX = x + 3;
      const barY = py + 7;
      const barW = panelWidth - 6;
      const barH = 2;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpPercent > 0.5 ? COLORS.HP_GREEN : (hpPercent > 0.25 ? COLORS.HP_YELLOW : COLORS.HP_RED);
      ctx.fillRect(barX, barY, barW * hpPercent, barH);

      if (poke.isLeader && poke.belly !== undefined) {
        const displayBelly = Math.ceil(poke.belly);
        if (displayBelly <= 10) ctx.fillStyle = '#ff4444';
        else if (displayBelly <= 20) ctx.fillStyle = '#ffaa00';
        else ctx.fillStyle = '#5a5';
        ctx.fillText(`T${displayBelly}`, barX, barY + 3);
      }

      py += rowH;
    }

    ctx.restore();
  }

  /**
   * Recordatorio de controles (esquina inferior derecha)
   */
  renderControls(ctx, canvasWidth, canvasHeight) {
    // En táctil el D-pad ya muestra los controles
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    if (canvasWidth < 520) return;
    const controls = [
      'WASD:Mover  Chocar:Ataque',
      'X:Mochila  C:Equipo  Tab:Líder',
      'Z:Recoger/Examinar  M:Mapa',
      '1-4: Movimiento (PP)'
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
    const bgWidth = 168;
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

    const leaderF = game.entityManager.getComponent(game._playerId, 'fighter');
    const chargingId = leaderF?.charging?.moveId ?? leaderF?.biding?.moveId;

    for (let i = 0; i < moves.length; i++) {
      const moveData = moves[i];
      const moveDef = game.movesData.find(m => m.id === moveData.moveId);
      if (!moveDef) continue;

      const isCharging = chargingId != null && moveData.moveId === chargingId;
      const isBiding = !!(leaderF?.biding && moveData.moveId === leaderF.biding.moveId);
      // Color según PP restante / carga
      if (isBiding) ctx.fillStyle = '#ffcc66';
      else if (isCharging) ctx.fillStyle = '#66ccff';
      else if (moveData.enabled === false) ctx.fillStyle = '#aa66aa';
      else if (moveData.currentPP <= 0) ctx.fillStyle = '#ff4444';
      else if (moveData.currentPP <= 2) ctx.fillStyle = '#ffcc44';
      else ctx.fillStyle = '#c8c8e8';

      const text = (isCharging || isBiding)
        ? `[${i + 1}] ${moveDef.name} ¡OTRA!`
        : (moveData.enabled === false
          ? `[${i + 1}] ${moveDef.name} (ANULADO${moveData._disableTurns > 0 ? ' ' + moveData._disableTurns + 't' : ''})`
          : `[${i + 1}] ${moveDef.name} (${moveData.currentPP}/${moveData.maxPP})`);
      ctx.fillText(text, x + 6, y + 5 + i * lineHeight);
    }

    ctx.restore();
  }

  /**
   * Minimap (esquina superior derecha, debajo del party status)
   */
  renderMinimap(ctx, gameState, canvasWidth, canvasHeight = 480) {
    const tileMap = gameState.tileMap;
    if (!tileMap) return;

    const scale = 1.5;
    const mapW = tileMap.width * scale;
    const mapH = tileMap.height * scale;
    const padding = 8;
    const party = gameState.party || [];
    let partyPanelH = 4;
    for (const poke of party) partyPanelH += poke.isLeader ? 15 : 10;
    if (!party.length) partyPanelH = 24;
    const x = canvasWidth - mapW - padding;
    // Justo debajo del panel de equipo (sin solaparlo)
    let y = padding + partyPanelH + 3;
    // Si no cabe, pasar a esquina inferior derecha
    if (y + mapH + 8 > canvasHeight - 60) {
      y = Math.max(padding, canvasHeight - mapH - 56);
    }

    ctx.save();

    // Fondo
    ctx.fillStyle = 'rgba(10, 10, 26, 0.65)';
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
        if (tileMap.rooms && tile.walkable && typeof tileMap.isRestRoom === 'function') {
            isRestRoom = tileMap.isRestRoom(tx, ty);
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
    let playerPos = gameState.playerPos;
    if (!playerPos && gameState._playerId && gameState.entityManager) {
      playerPos = gameState.entityManager.getComponent(gameState._playerId, 'position');
    }
    if (playerPos) {
      const blink = Math.sin(this.animationFrame * 0.1) > 0;
      ctx.fillStyle = blink ? '#ffcc44' : '#ff8800';
      ctx.fillRect(
        x + playerPos.x * scale - 1,
        y + playerPos.y * scale - 1,
        scale + 2,
        scale + 2
      );
    }

    // Escaleras (verde brillante) — buscar en mapa si no hay stairsPos
    let stairsPos = gameState.stairsPos || gameState._stairsPos;
    if (!stairsPos && tileMap) {
      outer: for (let ty = 0; ty < tileMap.height; ty++) {
        for (let tx = 0; tx < tileMap.width; tx++) {
          if (typeof tileMap.isStairs === 'function' && tileMap.isStairs(tx, ty)) {
            stairsPos = { x: tx, y: ty };
            break outer;
          }
          const t = tileMap.getTile(tx, ty);
          if (t && t.id === 3) {
            stairsPos = { x: tx, y: ty };
            break outer;
          }
        }
      }
    }
    // Mostrar escaleras si se han visto alguna vez (SEEN o VISIBLE) — parpadeo suave
    if (stairsPos && tileMap.getVisibility(stairsPos.x, stairsPos.y) >= 1) {
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.animationFrame / 12));
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(
        x + stairsPos.x * scale - 1,
        y + stairsPos.y * scale - 1,
        scale + 2,
        scale + 2
      );
      ctx.globalAlpha = 1;
    }

    // Dibujar items, aliados y enemigos
    if (gameState.entityManager) {
      const em = gameState.entityManager;

      // Ítems (cyan)
      const items = em.getEntitiesWithComponents('itemDrop', 'position');
      items.forEach(id => {
        const pos = em.getComponent(id, 'position');
        if (pos && tileMap.getVisibility(pos.x, pos.y) > 0) {
          ctx.fillStyle = '#00ffff';
          ctx.fillRect(x + pos.x * scale, y + pos.y * scale, scale, scale);
        }
      });

      // Trampas reveladas / baldosa mágica (naranja)
      const traps = em.getEntitiesWithComponents('trap', 'position');
      traps.forEach(id => {
        const tr = em.getComponent(id, 'trap');
        const pos = em.getComponent(id, 'position');
        if (!tr || !pos || tr.isHidden) return;
        if (tileMap.getVisibility(pos.x, pos.y) > 0) {
          ctx.fillStyle = tr.type === 'wonder_tile' ? '#ffe066' : '#ff9933';
          ctx.fillRect(x + pos.x * scale, y + pos.y * scale, scale, scale);
        }
      });

      // Mercader / amigable (magenta)
      const npcs = em.getEntitiesWithComponents('position', 'fighter').filter(id =>
        em.hasComponent(id, 'npcMerchant') || em.hasComponent(id, 'npcFriendly')
      );
      npcs.forEach(id => {
        const pos = em.getComponent(id, 'position');
        if (pos && tileMap.getVisibility(pos.x, pos.y) > 0) {
          ctx.fillStyle = '#ff66ff';
          ctx.fillRect(x + pos.x * scale, y + pos.y * scale, scale, scale);
        }
      });

      // Aliados (azul)
      const allies = em.getEntitiesWithComponents('partyMember', 'position', 'fighter');
      allies.forEach(id => {
        if (id === gameState._playerId) return;
        const fighter = em.getComponent(id, 'fighter');
        const pos = em.getComponent(id, 'position');
        if (!fighter || !pos || fighter.hp <= 0) return;
        if (tileMap.getVisibility(pos.x, pos.y) > 0) {
          ctx.fillStyle = '#60a5fa';
          ctx.fillRect(x + pos.x * scale, y + pos.y * scale, scale, scale);
        }
      });

      // Enemigos (rojo) — solo en FOV
      const enemies = em.getEntitiesWithComponents('aiControlled', 'position', 'fighter');
      enemies.forEach(id => {
        if (em.hasComponent(id, 'partyMember')) return;
        if (em.hasComponent(id, 'npcMerchant') || em.hasComponent(id, 'npcFriendly')) return;
        const fighter = em.getComponent(id, 'fighter');
        if (!fighter || fighter.hp <= 0) return;
        const pos = em.getComponent(id, 'position');
        if (pos && tileMap.getVisibility(pos.x, pos.y) === 2) {
          const boss = em.hasComponent(id, 'isBoss') || em.hasComponent(id, 'boss');
          ctx.fillStyle = boss ? '#ff00aa' : '#ff4444';
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
