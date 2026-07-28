import { RNG } from 'rot-js';
import { MAP_WIDTH, MAP_HEIGHT, ENEMY_DETECT_RANGE, ENEMY_DETECT_RANGE_EARLY } from '../constants.js';
import { spawnItems } from '../systems/ItemSystem.js';
import { triggerFloorEvent } from '../systems/FloorEvents.js';
import { spawnTraps } from '../systems/TrapSystem.js';

import { getBiomeForFloor } from './Biomes.js';
import { getAbility } from '../systems/AbilitySystem.js';

/**
 * Generación de pisos, spawn de enemigos y pre-carga de sprites.
 */
export class FloorManager {
  /** @param {import('../Game.js').Game} game */
  constructor(game) {
    this.game = game;
  }

  getZoneConfig() {
    const { floorsData, _currentFloor } = this.game;
    if (!floorsData || !floorsData.zones) return null;
    return floorsData.zones.find(z => _currentFloor >= z.floors[0] && _currentFloor <= z.floors[1]);
  }

  generateFloor() {
    const game = this.game;
    game.fovRadiusModifier = 0;
    game._stairsAnnounced = false;
    if (game._preserveSeedOnNextFloor && game.seed) {
      game._preserveSeedOnNextFloor = false;
    } else {
      game.seed = Math.floor(Math.random() * 1000000);
    }
    const zone = this.getZoneConfig();
    const theme = zone ? zone.theme : 'default';
    const isBossRoom = zone && zone.boss && game._currentFloor === zone.floors[1];
    const genResult = game.dungeonGenerator.generate(MAP_WIDTH, MAP_HEIGHT, game.seed, theme, isBossRoom);
    game.tileMap = genResult.tileMap;

    // Sin casas de monstruos en los primeros pisos (muy castigador)
    if (game._currentFloor <= 3 && game.tileMap.rooms) {
      for (const room of game.tileMap.rooms) {
        if (room.type === 'monster_house') {
          room.type = 'normal';
          room.monsterHouseTriggered = true;
        }
      }
    }
    
    // Setear el bioma estético para este piso
    game.tileMap.biome = getBiomeForFloor(game._currentFloor);
    
    game._stairsPos = genResult.stairsPos;
    game._spawnPoints = genResult.spawnPoints;
    game._itemPoints = genResult.itemPoints;
    game._playerStart = genResult.playerStart;

    const minItems = zone ? zone.itemsPerFloor[0] : 3;
    const maxItems = zone ? zone.itemsPerFloor[1] : 5;
    let count = minItems + Math.floor(RNG.getUniform() * (maxItems - minItems + 1));
    const isBossFloor = zone && zone.boss && game._currentFloor === zone.floors[1];
    if (isBossFloor) count += 2; // botín extra en sala de jefe
    if (game._pendingFloorItems != null) {
      const nItems = game._pendingFloorItems.length;
      if (nItems) {
        this._restoreFloorItems(game._pendingFloorItems);
        game._restoredItemCount = nItems;
      }
      // [] = piso vaciado: no re-spawnear
      game._pendingFloorItems = null;
    } else {
      spawnItems(game._itemPoints, count, game.itemsData, game.entityManager, game._currentFloor);
    }

    // Spawn traps (menos en pisos tempranos) — o restaurar al cargar
    if (game._pendingFloorTraps != null) {
      if (game._pendingFloorTraps.length) {
        this._restoreFloorTraps(game._pendingFloorTraps);
      }
      // [] = sin trampas guardadas: no re-spawnear
      game._pendingFloorTraps = null;
    } else {
      let trapCount = 2 + Math.floor(RNG.getUniform() * 3);
      if (game._currentFloor <= 3) trapCount = Math.min(trapCount, 1);
      else if (game._currentFloor <= 8) trapCount = Math.min(trapCount, 2);
      else trapCount = Math.min(trapCount, 4);
      spawnTraps(game._itemPoints, trapCount, game.entityManager, game._currentFloor || 1);
    }

    if (game.weatherSystem) {
      if (game._preserveWeatherOnLoad) {
        game._preserveWeatherOnLoad = false;
      } else {
        game.weatherSystem.generateFloorWeather(game);
      }
    }
  }

  _restoreFloorItems(items) {
    const game = this.game;
    if (!game.tileMap || !items) return;
    const used = new Set();
    const tryPlace = (x, y) => {
      const key = `${x},${y}`;
      if (used.has(key)) return false;
      if (!game.tileMap.isWalkable(x, y)) return false;
      if (game.entityManager.getItemAt(x, y) != null) return false;
      if (game._stairsPos && game._stairsPos.x === x && game._stairsPos.y === y) return false;
      return true;
    };
    for (const it of items) {
      if (!it || !it.itemId) continue;
      let x = it.x, y = it.y;
      if (!tryPlace(x, y)) {
        const pts = game._itemPoints || [];
        let found = null;
        for (const p of pts) {
          if (tryPlace(p.x, p.y)) { found = p; break; }
        }
        if (!found) {
          outer: for (let r = 1; r <= 6; r++) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if (tryPlace(it.x + dx, it.y + dy)) {
                  found = { x: it.x + dx, y: it.y + dy };
                  break outer;
                }
              }
            }
          }
        }
        if (!found) continue;
        x = found.x; y = found.y;
      }
      used.add(`${x},${y}`);
      const meta = (game.itemsData || []).find(i => i.id === it.itemId);
      game.entityManager.createItemEntity(it.itemId, it.quantity || 1, x, y, meta ? meta.spriteUrl : '');
    }
  }

  _restoreFloorTraps(traps) {
    const game = this.game;
    if (!game.tileMap || !traps) return;
    for (const tr of traps) {
      if (!tr || !tr.type) continue;
      let x = tr.x, y = tr.y;
      if (!game.tileMap.isWalkable(x, y)) {
        const pts = game._itemPoints || [];
        const p = pts.find(pt => game.tileMap.isWalkable(pt.x, pt.y));
        if (!p) continue;
        x = p.x; y = p.y;
      }
      game.entityManager.createTrapEntity(tr.type, x, y, tr.isHidden !== false);
    }
  }

  spawnEnemies() {
    const game = this.game;
    if (!game.tileMap || !game._spawnPoints) return;

    const zone = this.getZoneConfig();
    if (!zone) return;

    const isBossRoom = zone.boss && game._currentFloor === zone.floors[1];

    if (isBossRoom) {
      if (game._spawnPoints && game._spawnPoints.length > 0) {
        const point = game._spawnPoints[0];
        const bossInfo = zone.boss;
        const bossId = game.entityManager.createPokemon(
          bossInfo.id, bossInfo.level, point.x, point.y, true
        );
        game.entityManager.setComponent(bossId, 'isBoss', true);
        game.entityManager.setComponent(bossId, 'boss', { active: true });
        
        // Boost de PS para el jefe (Mewtwo un poco menos muro)
        const fighter = game.entityManager.getComponent(bossId, 'fighter');
        if (fighter) {
          const mult = bossInfo.name === 'Mewtwo' ? 1.85
            : bossInfo.name === 'Onix' ? 2.0
            : bossInfo.name === 'Gengar' ? 2.1
            : 2.2;
          fighter.maxHp = Math.floor(fighter.maxHp * mult);
          fighter.hp = fighter.maxHp;
          game.entityManager.setComponent(bossId, 'fighter', fighter);
        }
        
        game.turnManager.addEntity(bossId, fighter ? fighter.speed : 50, false);
        game.pokedexSeen.add(bossInfo.id);
      }
      return;
    }

    const minEnemies = zone.enemiesPerFloor[0];
    const maxEnemies = zone.enemiesPerFloor[1];
    let enemyCount = minEnemies + Math.floor(RNG.getUniform() * (maxEnemies - minEnemies + 1));
    if ((game._currentFloor || 1) <= 2) enemyCount = Math.min(enemyCount, 2);
    else if ((game._currentFloor || 1) <= 4) enemyCount = Math.min(enemyCount, 3);

    const points = [...game._spawnPoints];
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(RNG.getUniform() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }

    const actualCount = Math.min(enemyCount, points.length);
    for (let i = 0; i < actualCount; i++) {
      const point = points[i];
      const speciesId = this._selectRandomEnemySpecies(zone.pokemon);
      const minLvl = zone.levelRange[0];
      const maxLvl = zone.levelRange[1];
      const span = Math.max(1, zone.floors[1] - zone.floors[0]);
      const t = (game._currentFloor - zone.floors[0]) / span;
      const base = minLvl + (maxLvl - minLvl) * t;
      const level = Math.max(minLvl, Math.min(maxLvl, Math.round(base + (RNG.getUniform() * 2 - 1))));

      const enemyId = game.entityManager.createPokemon(speciesId, level, point.x, point.y, true);
      const ai = game.entityManager.getComponent(enemyId, 'aiControlled');
      if (ai) {
        ai.detectRange = game._currentFloor <= 5 ? ENEMY_DETECT_RANGE_EARLY : ENEMY_DETECT_RANGE;
        game.entityManager.setComponent(enemyId, 'aiControlled', ai);
      }
      const fighter = game.entityManager.getComponent(enemyId, 'fighter');
      game.turnManager.addEntity(enemyId, fighter ? fighter.speed : 50, false);
      game.pokedexSeen.add(speciesId);
    }
  }

  spawnMonsterHouse(room) {
    const game = this.game;
    if (!game.tileMap) return;

    const zone = this.getZoneConfig();
    if (!zone) return;

    // Flash y diálogo (pausa el combate un instante)
    if (game.renderer && game.renderer.screenFlash) {
      game.renderer.screenFlash('rgba(255, 0, 0, 0.6)', 1000);
    }
    if (!game._seenMonsterHouseDialog) {
      game._seenMonsterHouseDialog = true;
      game.eventBus.emit('show_dialog', {
        text: '¡ES UNA CASA DE MONSTRUOS!\n\n¡Varios Pokémon cayeron del techo a la vez!'
      });
    }
    game.eventBus.emit('message', { text: '¡Casa de monstruos!', color: '#ff4444' });

    // Recolectar tiles transitables y desocupados dentro de la habitación
    const validPoints = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (game.tileMap.isWalkable(x, y)) {
          if (!game.entityManager.getEntityAt(x, y, false)) {
            validPoints.push({ x, y });
          }
        }
      }
    }

    // Barajar
    for (let i = validPoints.length - 1; i > 0; i--) {
      const j = Math.floor(RNG.getUniform() * (i + 1));
      [validPoints[i], validPoints[j]] = [validPoints[j], validPoints[i]];
    }

    // Menos overwhelm; aún más suave en pisos tempranos
    let enemyCount = 2 + Math.floor(RNG.getUniform() * 3); // 2–4
    if ((game._currentFloor || 1) <= 5) enemyCount = 2;
    else if ((game._currentFloor || 1) <= 12) enemyCount = Math.min(enemyCount, 3);
    const actualCount = Math.min(enemyCount, validPoints.length);

    for (let i = 0; i < actualCount; i++) {
      const point = validPoints[i];
      const speciesId = this._selectRandomEnemySpecies(zone.pokemon);
      const minLvl = zone.levelRange[0];
      const maxLvl = zone.levelRange[1];
      // Casa de monstruos: niveles hacia el mínimo de la zona
      const level = minLvl + Math.floor(RNG.getUniform() * Math.max(1, Math.floor((maxLvl - minLvl) * 0.6) + 1));

      const enemyId = game.entityManager.createPokemon(speciesId, level, point.x, point.y, true);
      const fighter = game.entityManager.getComponent(enemyId, 'fighter');
      game.turnManager.addEntity(enemyId, fighter ? fighter.speed : 50, false);
      game.pokedexSeen.add(speciesId);
    }
    // Botín extra en casa de monstruos
    if (validPoints.length > actualCount && game.itemsData) {
      const lootPool = game.itemsData.filter(i =>
        ['food', 'heal', 'capture', 'status_cure', 'pp_restore'].includes(i.type) || i.id === 'oran_berry'
      );
      if (lootPool.length) {
        const item = lootPool[Math.floor(RNG.getUniform() * lootPool.length)];
        const pt = validPoints[actualCount];
        game.entityManager.createItemEntity(item.id, 1, pt.x, pt.y, item.spriteUrl || '');
        game.eventBus.emit('message', { text: '¡Algo cayó del techo junto a los Pokémon!', color: '#ffcc66' });
      }
    }
    
    game.needsRender = true;
  }

  async changeFloor(direction) {
    const game = this.game;

    game.inputHandler.enabled = false;
    try {
      await this._changeFloorInner(direction);
    } catch (err) {
      console.error('[FloorManager] Error al cambiar de piso:', err);
      game.eventBus.emit('message', {
        text: 'Error al cambiar de piso. Inténtalo de nuevo.',
        color: '#ff6666'
      });
    } finally {
      game.inputHandler.enabled = true;
    }
  }

  async _changeFloorInner(direction) {
    const game = this.game;

    if (game.renderer) {
      await game.renderer.startFadeOut(300);
    }

    if (direction === 'down') {
      game._currentFloor++;
      game.stats.floorsExplored = Math.max(game.stats.floorsExplored, game._currentFloor);
    } else if (direction === 'up' && game._currentFloor > 1) {
      game._currentFloor--;
    }

    console.log(`[Game] Cambiando al piso ${game._currentFloor}`);
    game._autoHealUsedThisFloor = false;
    game._critHpWarnedThisFloor = false;
    game._bagAlmostFullWarned = false;
    game._autoStatusCureUsedThisFloor = false;
    game._lowPpWarnedThisFloor = false;

    game.entityManager.clear(true);
    game.turnManager.reset();

    const partyEntities = game.entityManager.getEntitiesWithComponents('partyMember', 'fighter');
    let leaderId = null;
    let firstLiving = null;
    partyEntities.forEach(pid => {
      const fighter = game.entityManager.getComponent(pid, 'fighter');
      const mem = game.entityManager.getComponent(pid, 'partyMember');
      if (!fighter || fighter.hp <= 0) return; // debilitados no actúan
      if (!firstLiving) firstLiving = pid;
      game.turnManager.addEntity(pid, fighter.speed || 50, !!(mem && mem.isLeader));
      if (mem && mem.isLeader) leaderId = pid;
    });
    // Garantizar líder / jugador en el sistema de turnos
    const playerId = leaderId || firstLiving;
    if (playerId != null) {
      game._playerId = playerId;
      game.turnManager.setPlayerEntityId(playerId);
      const mem = game.entityManager.getComponent(playerId, 'partyMember');
      if (mem && !mem.isLeader) {
        mem.isLeader = true;
        game.entityManager.setComponent(playerId, 'partyMember', mem);
      }
      // Quitar isLeader de los demás
      partyEntities.forEach(pid => {
        if (pid === playerId) return;
        const m = game.entityManager.getComponent(pid, 'partyMember');
        if (m && m.isLeader) {
          m.isLeader = false;
          game.entityManager.setComponent(pid, 'partyMember', m);
        }
      });
    }

    this.generateFloor();

    const startPos = game._playerStart;
    const offsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 1, y: -1 }
    ];
    partyEntities.forEach((pid, idx) => {
      let placed = false;
      for (const off of offsets) {
        const tx = startPos.x + off.x;
        const ty = startPos.y + off.y;
        if (!game.tileMap.isWalkable(tx, ty)) continue;
        const occupied = partyEntities.some((other, oi) => {
          if (oi >= idx) return false;
          const op = game.entityManager.getComponent(other, 'position');
          return op && op.x === tx && op.y === ty;
        });
        if (occupied) continue;
        game.entityManager.setComponent(pid, 'position', {
          x: tx,
          y: ty,
          facing: 'down',
          prevX: tx,
          prevY: ty,
          moveStartTime: 0
        });
        placed = true;
        break;
      }
      if (!placed) {
        game.entityManager.setComponent(pid, 'position', {
          x: startPos.x,
          y: startPos.y,
          facing: 'down',
          prevX: startPos.x,
          prevY: startPos.y,
          moveStartTime: 0
        });
      }
    });

    this.spawnEnemies();
    // Tras cargar partida el mapa se regenera: despejar enemigos junto al equipo
    if (game._safeSpawnOnLoad) {
      game._safeSpawnOnLoad = false;
      const start = game._playerStart;
      if (start) {
        const hostiles = game.entityManager.getEntitiesWithComponents('fighter', 'aiControlled');
        for (const eid of hostiles) {
          if (game.entityManager.hasComponent(eid, 'partyMember')) continue;
          if (game.entityManager.hasComponent(eid, 'npcMerchant')) continue;
          if (game.entityManager.hasComponent(eid, 'npcFriendly')) continue;
          if (game.entityManager.hasComponent(eid, 'isBoss') || game.entityManager.hasComponent(eid, 'boss')) continue;
          const ep = game.entityManager.getComponent(eid, 'position');
          if (!ep) continue;
          const cheb = Math.max(Math.abs(ep.x - start.x), Math.abs(ep.y - start.y));
          if (cheb <= 2) {
            game.turnManager.removeEntity(eid);
            game.entityManager.destroyEntity(eid);
          }
        }
        game.eventBus.emit('message', {
          text: `Partida cargada: mapa nuevo. Objetos restaurados: ${game._restoredItemCount || 0}. Zona segura cerca del equipo.`,
          color: '#aaddff'
        });
        game._restoredItemCount = 0;
      }
    }
    triggerFloorEvent(game);
    this.preloadVisibleSprites();

    game._updateCamera();
    game._updateFOV();
    game.saveGameData();

    const zone = this.getZoneConfig();
    if (zone) {
      if (game.uiManager && game.uiManager.music) {
        game.uiManager.music.playZone(zone.name);
      }
    }

    // Pequeña recuperación al cambiar de piso (no al cargar partida)
    const skipHeal = !!game._skipFloorHealOnLoad;
    if (skipHeal) game._skipFloorHealOnLoad = false;
    partyEntities.forEach(pid => {
      const fighter = game.entityManager.getComponent(pid, 'fighter');
      if (fighter && fighter.hp > 0) {
        if (!skipHeal) {
          fighter.hp = Math.min(fighter.maxHp, fighter.hp + Math.max(1, Math.floor(fighter.maxHp * 0.12)));
          if (fighter.belly !== undefined) {
            const bellyGain = pid === game._playerId ? 8 : 3;
            fighter.belly = Math.min(fighter.maxBelly || 100, fighter.belly + bellyGain);
          }
          // Limpiar estados de combate al cambiar de piso (evita Excavar fantasma, etc.)
          const hadCombat = !!(fighter.charging || fighter.biding || fighter.mustRecharge ||
            fighter.substitute || fighter.reflect || fighter.lightScreen || fighter.rage || fighter.focusEnergy);
          fighter.charging = null;
          fighter.biding = null;
          fighter.mustRecharge = false;
          fighter.substitute = 0;
          fighter.reflect = 0;
          fighter.lightScreen = 0;
          fighter.rage = false;
          fighter.focusEnergy = false;
          fighter.protectStats = 0;
          fighter.flinched = false;
          delete fighter._rageTurns;
          delete fighter._focusTurns;
          if (hadCombat && pid === game._playerId) {
            game.eventBus.emit('message', {
              text: 'La tensión del combate se disipa al cambiar de piso.',
              color: '#aaccff'
            });
          }
        }
        const pinfo = game.entityManager.getComponent(pid, 'pokemonInfo');
        if (!skipHeal && pinfo && getAbility(pinfo) === 'natural_cure' && fighter.statusEffects?.length) {
          fighter.statusEffects = [];
          game.eventBus.emit('message', { text: `¡Cura Natural de ${pinfo.name} eliminó los estados!`, color: '#aaffaa' });
        }
        game.entityManager.setComponent(pid, 'fighter', fighter);
      }
    });

    game.eventBus.emit('message', {
      text: `Entrando a ${game.zoneName || 'Zona Desconocida'} (Piso ${game._currentFloor})`
    });
    if (!skipHeal) {
      game.eventBus.emit('message', {
        text: 'El equipo recupera un poco de energía al bajar.',
        color: '#8f8'
      });
    }

    const tips = [
      'Consejo: mira a un salvaje y pulsa Z para ver PS y captura.',
      'Consejo: Tab cambia de líder (salta debilitados).',
      'Consejo: la Baldosa Mágica restaura stats y PP.',
      'Consejo: en Opciones puedes desactivar recoger al andar.',
      'Consejo: Kecleon compra y vende si te sobran objetos.',
      'Consejo: Kecleon tiene precios tope; vende basura para hacer sitio en la bolsa.',
      'Consejo: si el líder cae, un aliado toma el mando automáticamente.',
      'Consejo: 1-4 mirando a un enemigo muestra si el golpe es eficaz.',
      'Consejo: en Equipo puedes cambiar la táctica de cada aliado.',
      'Consejo: guardar conserva equipo, piso, objetos y trampas; el mapa se regenera al cargar.',
      'Consejo: la Cuerda Huida guarda y te saca al menú si la cosa se pone fea.',
      'Consejo: algunas salas son casas de monstruos: ¡prepárate al entrar!',
      'Consejo: algunos salvajes intimidan y bajan tu Ataque al verte.',
      'Consejo: las salas doradas del minimapa suelen ser de descanso; busca tesoros también.',
      'Consejo: a veces hay claros de descanso que curan PS y tripa.',
      'Consejo: las gomas suben stats de forma permanente (se conservan al guardar).',
      'Consejo: la Bolsa del HUD se pone naranja cuando quedan 2 huecos o menos.',
      'Consejo: reclutar (captura o amigable) guarda automáticamente la partida.',
      'Consejo: derrotar a Mewtwo completa la aventura al instante.',
      'Consejo: Danza Espada y Agilidad te potencian a ti, no al enemigo.',
      'Consejo: Descanso y Recuperación se pueden usar sin enemigo al lado.',
      'Consejo: Lanzar una Poké Ball en línea recta también captura.',
      'Consejo: Vista Lince hace que tus ataques no fallen por precisión.',
      'Consejo: la quemadura reduce el daño físico (Agallas lo anula).',
      'Consejo: si un objeto no hace efecto (PS llenos), no gastas turno.',
      'Consejo: Excavar y Vuelo tardan 2 turnos; mientras, no te alcanzan.',
      'Consejo: Reflejo y Pantalla de Luz reducen a la mitad el daño recibido.',
      'Consejo: el Sustituto absorbe golpes a cambio de PS.',
      'Consejo: capturar es más fácil en los primeros pisos y con estados.',
      'Consejo: el contador enem. del HUD muestra cuántos salvajes quedan en el piso.',
      'Consejo: Atadura/Giro Fuego impiden moverse hasta liberarte.',
      'Consejo: con tripa alta recuperas PP poco a poco cada cierto tiempo.',
      'Consejo: Remolino y Rugido expulsan al enemigo; Teletransporte te mueve a ti.',
      'Consejo: si te golpean mientras cargas Excavar/Vuelo, se cancela.',
      'Consejo: Venganza acumula daño 2 turnos; luego úsala otra vez para devolver el doble.',
      'Consejo: Mimético copia un movimiento del enemigo al hueco de Mimético.',
      'Consejo: dormir o congelar al salvaje duplica la probabilidad de captura.',
      'Consejo: Meowth con Recogida puede encontrar objetos al derrotar enemigos.',
      'Consejo: Anulación bloquea un movimiento; el HUD muestra turnos (ANULADO 3t).',
      'Consejo: en el minimapa, naranja = trampa revelada; amarillo = baldosa mágica.',
      'Consejo: puedes lanzar comida o pociones a un aliado (X → Lanzar).',
      'Consejo: Transformación copia tipo, stats y habilidad; se revierte al debilitarte o en salas de descanso.',
      'Consejo: sin PP, el combate usa Forcejeo (con retroceso). Choca para atacar sin PP.',
      'Consejo: en tormenta de arena, tipo Roca recibe menos daño físico; en granizo, Hielo aguanta mejor lo especial.',
      'Consejo: no te golpeen mientras miras la tienda de Kecleon (ya no pasa turno).',
      'Consejo: al derrotarte se borra el guardado al instante (permadeath).',
      'Consejo: los primeros pisos tienen menos salvajes: explora con calma.',
      'Consejo: en pisos bajos no hay trampas explosivas; la Baldosa Mágica también restaura tripa.',
      'Consejo: Rastro copia la habilidad del rival al contactar (solo una vez).',
      'Consejo: los aliados usan curación propia si bajan de mitad de PS (Descanso solo si están muy mal).',
      'Consejo: golpear a un dormido puede despertarlo; el hielo siempre se rompe al impactar.',
      'Consejo: si guardas con Kecleon en el piso, la tienda se conserva al cargar.',
      'Consejo: el veneno grave (Tóxico) empeora con el tiempo; cúralo pronto.',
      'Consejo: las orbes de sala respetan Insomnio/Espíritu Vital.',
      'Consejo: el Sustituto absorbe golpes y también estados del impacto.',
      'Consejo: choques contra muros no gastan turno ni avanzan veneno/quemadura.',
      'Consejo: si un movimiento está anulado, pulsar su tecla gasta el turno y baja el contador.',
      'Consejo: Hiperrayo y similares obligan a un turno de descanso (DESCANSO en el HUD).',
      'Consejo: al cambiar de piso se cancelan carga, Venganza, Sustituto y pantallas.',
    ];
    // Recordatorio suave de guardado
    if (game._currentFloor > 1 && game._currentFloor % 5 === 0) {
      game.eventBus.emit('message', {
        text: 'Recuerda: Esc → Guardar (objetos/trampas se conservan; el mapa se regenera).',
        color: '#aaccff'
      });
    }

    if (game._currentFloor > 1 && game._currentFloor % 2 === 0) {
      const tip = tips[Math.floor((game._currentFloor || 1) / 2) % tips.length];
      game.eventBus.emit('message', { text: tip, color: '#aaccff' });
    }

    // Anunciar cambio de zona (primer piso de cada zona)
    if (zone && game._currentFloor === zone.floors[0] && game._currentFloor > 1) {
      game.eventBus.emit('show_dialog', {
        text: `¡Nueva zona!\n\n${zone.name}\nPisos ${zone.floors[0]}–${zone.floors[1]}${zone.boss ? `\nJefe al final: ${zone.boss.name}` : ''}`
      });
    }

    if (game.currentWeather === 'lluvia') {
      game.eventBus.emit('message', { text: 'Una lluvia constante cae en este piso...', color: '#6ab0ff' });
    } else if (game.currentWeather === 'sol') {
      game.eventBus.emit('message', { text: 'El sol brilla con mucha intensidad aquí.', color: '#ffcc00' });
    } else if (game.currentWeather === 'tormenta_arena') {
      game.eventBus.emit('message', { text: '¡Una violenta tormenta de arena ruge en la zona!', color: '#ffaa44' });
    } else if (game.currentWeather === 'granizo') {
      game.eventBus.emit('message', { text: '¡Está cayendo granizo con fuerza!', color: '#ffffff' });
    }

    if (zone && zone.boss && game._currentFloor === zone.floors[1] && zone.boss.name === 'Mewtwo') {
      game.eventBus.emit('show_dialog', {
        text: '¡Una presencia abrumadora te acecha en este laboratorio!\n\n¡Mewtwo bloquea el camino de salida!'
      });
    }

    game.needsRender = true;
    
    if (game.renderer) {
      game.renderer.startFadeIn(300);
    }
  }

  preloadVisibleSprites() {
    const game = this.game;
    if (!game.renderer?.spriteManager) return;

    const entityIds = game.entityManager.getEntitiesWithComponents('sprite');
    for (const entityId of entityIds) {
      const sprite = game.entityManager.getComponent(entityId, 'sprite');
      if (sprite?.url) {
        game.renderer.spriteManager.loadSprite(sprite.url).then(() => {
          game.needsRender = true;
        });
      }
    }
  }

  _selectRandomEnemySpecies(pokemonList) {
    if (!pokemonList || pokemonList.length === 0) return 19;
    const totalWeight = pokemonList.reduce((sum, p) => sum + p.weight, 0);
    let roll = RNG.getUniform() * totalWeight;
    for (const p of pokemonList) {
      roll -= p.weight;
      if (roll <= 0) return p.id;
    }
    return pokemonList[0].id;
  }
}
