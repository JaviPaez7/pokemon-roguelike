import { MAP_WIDTH, MAP_HEIGHT } from '../../constants.js';
import { spawnItems } from '../../systems/ItemSystem.js';
import { triggerFloorEvent } from '../../systems/FloorEvents.js';

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
    game.seed = Math.floor(Math.random() * 1000000);
    const zone = this.getZoneConfig();
    const theme = zone ? zone.theme : 'default';
    const genResult = game.dungeonGenerator.generate(MAP_WIDTH, MAP_HEIGHT, game.seed, theme);
    game.tileMap = genResult.tileMap;
    game._stairsPos = genResult.stairsPos;
    game._spawnPoints = genResult.spawnPoints;
    game._itemPoints = genResult.itemPoints;
    game._playerStart = genResult.playerStart;

    game.tileMap.setTile(game._stairsPos.x, game._stairsPos.y, 3);

    const minItems = zone ? zone.itemsPerFloor[0] : 3;
    const maxItems = zone ? zone.itemsPerFloor[1] : 5;
    const count = minItems + Math.floor(Math.random() * (maxItems - minItems + 1));
    spawnItems(game._itemPoints, count, game.itemsData, game.entityManager);

    if (game.weatherSystem) {
      game.weatherSystem.generateFloorWeather(game);
    }
  }

  spawnEnemies() {
    const game = this.game;
    if (!game.tileMap || !game._spawnPoints) return;

    const zone = this.getZoneConfig();
    if (!zone) return;

    const minEnemies = zone.enemiesPerFloor[0];
    const maxEnemies = zone.enemiesPerFloor[1];
    const enemyCount = minEnemies + Math.floor(Math.random() * (maxEnemies - minEnemies + 1));

    const points = [...game._spawnPoints];
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }

    const actualCount = Math.min(enemyCount, points.length);
    for (let i = 0; i < actualCount; i++) {
      const point = points[i];
      const speciesId = this._selectRandomEnemySpecies(zone.pokemon);
      const minLvl = zone.levelRange[0];
      const maxLvl = zone.levelRange[1];
      const level = minLvl + Math.floor(Math.random() * (maxLvl - minLvl + 1));

      const enemyId = game.entityManager.createPokemon(speciesId, level, point.x, point.y, true);
      const fighter = game.entityManager.getComponent(enemyId, 'fighter');
      game.turnManager.addEntity(enemyId, fighter ? fighter.speed : 50, false);
      game.pokedexSeen.add(speciesId);
    }

    if (zone.boss && game._currentFloor === zone.floors[1]) {
      const bossPoint = points[actualCount] || game._stairsPos;
      const bossId = game.entityManager.createPokemon(zone.boss.id, zone.boss.level, bossPoint.x, bossPoint.y, true);

      const info = game.entityManager.getComponent(bossId, 'pokemonInfo');
      if (info) {
        info.name = `JEFE: ${zone.boss.name}`;
        game.entityManager.setComponent(bossId, 'pokemonInfo', info);
      }

      const fighter = game.entityManager.getComponent(bossId, 'fighter');
      if (fighter) {
        fighter.maxHp = fighter.maxHp * 2;
        fighter.hp = fighter.maxHp;
        game.entityManager.setComponent(bossId, 'fighter', fighter);
      }

      game.turnManager.addEntity(bossId, fighter ? fighter.speed : 60, false);
      game.pokedexSeen.add(zone.boss.id);
      game.eventBus.emit('message', `¡Alerta! ¡${zone.boss.name} ha aparecido!`);
    }
  }

  async changeFloor(direction) {
    const game = this.game;

    game.inputHandler.enabled = false;

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

    game.entityManager.clear(true);
    game.turnManager.reset();

    const partyEntities = game.entityManager.getEntitiesWithComponents('partyMember', 'fighter');
    partyEntities.forEach(pid => {
      const fighter = game.entityManager.getComponent(pid, 'fighter');
      const mem = game.entityManager.getComponent(pid, 'partyMember');
      game.turnManager.addEntity(pid, fighter ? fighter.speed : 50, mem.isLeader);
      if (mem.isLeader) {
        game._playerId = pid;
      }
    });

    this.generateFloor();

    const startPos = game._playerStart;
    partyEntities.forEach(pid => {
      game.entityManager.setComponent(pid, 'position', {
        x: startPos.x,
        y: startPos.y,
        facing: 'down'
      });
    });

    this.spawnEnemies();
    triggerFloorEvent(game);
    this.preloadVisibleSprites();

    game._updateCamera();
    game._updateFOV();
    game.saveGameData();

    const zone = this.getZoneConfig();
    if (zone) {
      game.zoneName = zone.name;
      if (game.uiManager && game.uiManager.music) {
        game.uiManager.music.playZone(zone.name);
      }
    }

    game.eventBus.emit('message', {
      text: `Entrando a ${game.zoneName || 'Zona Desconocida'} (Piso ${game._currentFloor})`
    });

    if (zone && zone.boss && game._currentFloor === zone.floors[1] && zone.boss.name === 'Mewtwo') {
      game.eventBus.emit('show_dialog', {
        text: '¡Una presencia abrumadora te acecha en este laboratorio!\n\n¡Mewtwo bloquea el camino de salida!'
      });
    }

    game.needsRender = true;
    
    if (game.renderer) {
      game.renderer.startFadeIn(300);
    }
    game.inputHandler.enabled = true;
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
    let roll = Math.random() * totalWeight;
    for (const p of pokemonList) {
      roll -= p.weight;
      if (roll <= 0) return p.id;
    }
    return pokemonList[0].id;
  }
}
