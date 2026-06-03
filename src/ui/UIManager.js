/**
 * UIManager.js — Gestor de UI HTML para PokéRogue
 * Maneja las pantallas de Título, Selección de Starter, Menú de Inventario/Equipo,
 * Diálogos y pantallas de Fin de Partida en overlays HTML superpuestos.
 */

import { GAME_STATES } from '../constants.js';

export class UIManager {
  /**
   * @param {Object} game - Instancia del juego principal
   */
  constructor(game) {
    /** @type {Object} */
    this.game = game;
    /** @type {import('../core/EventBus.js').EventBus} */
    this.eventBus = game.eventBus;

    // Elementos del DOM
    this.overlay = document.getElementById('ui-overlay');
    this.menuContainer = document.getElementById('menu-container');
    this.loadingScreen = document.getElementById('loading-screen');

    // Estado de menús
    this.currentMenuType = null; // 'title', 'starter', 'pause', 'inventory', 'team', 'use_item_target', 'item_actions', 'pokemon_actions', 'moves_view'
    this.selectedIndex = 0;
    this.menuOptions = []; // Array de funciones o datos de opción
    this.selectedItem = null; // Guardar referencia de objeto seleccionado en submenús
    this.selectedPokemon = null; // Guardar Pokémon seleccionado en submenús

    // Estado de diálogos
    this.dialogQueue = [];
    this.currentDialogCallback = null;

    // Desvanecer pantalla de carga inicial
    if (this.loadingScreen) {
      setTimeout(() => {
        this.loadingScreen.classList.add('fade-out');
        setTimeout(() => this.loadingScreen.remove(), 500);
      }, 1000);
    }

    // Soporte para clics del ratón (delegación de eventos en el contenedor de menús)
    this.menuContainer.addEventListener('click', (event) => {
      const ctx = this.game.inputHandler._context;
      
      // Si estamos en un diálogo, avanzar con el clic
      if (ctx === 'dialog') {
        this.handleDialogInput({ action: 'advance' });
        return;
      }
      
      // Ignorar clics si la entrada de teclado está explorando
      if (ctx !== 'menu' && ctx !== 'game_over' && ctx !== 'victory') return;

      const optionEl = event.target.closest('.menu-option');
      if (!optionEl) return;

      const idx = parseInt(optionEl.getAttribute('data-index'), 10);
      if (isNaN(idx)) return;

      // Un clic directamente selecciona y confirma la opción
      this.selectedIndex = idx;
      this.updateSelectionVisuals();
      const callback = this.menuOptions[this.selectedIndex];
      if (callback) {
        this.playConfirmSound();
        callback();
      }
    });

    // Soporte para hover del ratón (actualiza la selección visualmente)
    this.menuContainer.addEventListener('mouseover', (event) => {
      if (!this.game.inputHandler.enabled || this.currentMenuType === 'dialog') return;
      const optionEl = event.target.closest('.menu-option');
      if (!optionEl) return;
      const idx = parseInt(optionEl.getAttribute('data-index'), 10);
      if (!isNaN(idx) && this.selectedIndex !== idx) {
        this.selectedIndex = idx;
        this.updateSelectionVisuals();
        this.playMenuSound();
      }
    });

    this._setupEventListeners();
  }

  /**
   * Suscribe a los eventos del juego e inputs
   * @private
   */
  _setupEventListeners() {
    // Escuchar cambios de estado del juego
    this.eventBus.on('state_changed', (data) => {
      this.handleStateChange(data.state);
    });

    // Escuchar inputs del menú desde el teclado
    this.eventBus.on('menu_input', (data) => {
      this.handleMenuInput(data);
    });

    // Escuchar inputs de diálogos
    this.eventBus.on('dialog_input', (data) => {
      this.handleDialogInput(data);
    });

    // Escuchar eventos específicos de apertura de menús en exploración
    this.eventBus.on('ui_action', (data) => {
      if (this.game.getState() !== GAME_STATES.EXPLORING && this.game.getState() !== GAME_STATES.MENU) return;

      switch (data.action) {
        case 'open_inventory':
          this.game.changeState(GAME_STATES.MENU);
          this.openInventoryMenu();
          break;
        case 'open_team':
          this.game.changeState(GAME_STATES.MENU);
          this.openTeamMenu();
          break;
        case 'toggle_minimap':
          if (this.game.renderer && this.game.renderer.hud) {
            this.game.renderer.hud.toggleMinimap();
            this.game.needsRender = true;
          }
          break;
      }
    });

    // Escuchar peticiones de diálogos desde cualquier parte del juego
    this.eventBus.on('show_dialog', (data) => {
      this.showDialog(data.text, data.callback);
    });

    // SFX de combate y progresión
    this.eventBus.on('damage_dealt', () => {
      this.playDamageSound();
    });

    this.eventBus.on('level_up', () => {
      this.playLevelUpSound();
    });

    this.eventBus.on('capture_attempt', (data) => {
      for (let i = 0; i < data.shakes; i++) {
        setTimeout(() => this.playCaptureShakeSound(i), i * 400);
      }
      if (data.success) {
        setTimeout(() => this.playLevelUpSound(), data.shakes * 400 + 200);
      }
    });
  }

  /**
   * Cierra cualquier menú abierto y vuelve a exploración
   */
  closeMenu() {
    this.currentMenuType = null;
    this.selectedIndex = 0;
    this.menuOptions = [];
    this.selectedItem = null;
    this.selectedPokemon = null;

    this.overlay.classList.add('hidden');
    this.menuContainer.innerHTML = '';

    if (this.game.getState() === GAME_STATES.MENU) {
      this.game.changeState(GAME_STATES.EXPLORING);
    }
  }

  /**
   * Abre un menú específico e inyecta su HTML en el DOM
   * @param {string} type - Tipo de menú
   * @param {string} htmlContent - Código HTML a inyectar
   */
  showMenu(type, htmlContent) {
    this.currentMenuType = type;
    this.overlay.classList.remove('hidden');
    this.menuContainer.innerHTML = htmlContent;
    this.updateSelectionVisuals();
  }

  /**
   * Reacciona ante cambios en la máquina de estados del juego
   */
  handleStateChange(state) {
    switch (state) {
      case GAME_STATES.TITLE:
        this.openTitleScreen();
        break;
      case GAME_STATES.STARTER_SELECT:
        this.openStarterSelectScreen();
        break;
      case GAME_STATES.EXPLORING:
        this.closeMenu();
        break;
      case GAME_STATES.MENU:
        // Si entra a MENU por pausa
        if (this.currentMenuType === null) {
          this.openPauseMenu();
        }
        break;
      case GAME_STATES.GAME_OVER:
        this.openGameOverScreen();
        break;
      case GAME_STATES.VICTORY:
        this.openVictoryScreen();
        break;
    }
  }

  // ─── LÓGICA DE CADA PANTALLA ──────────────────────────────────────────────

  /**
   * Pantalla de título
   */
  openTitleScreen() {
    let hasSave = false;
    try {
      hasSave = localStorage.getItem('pokerogue_save') !== null;
    } catch (e) {
      console.warn('localStorage no está disponible:', e);
    }
    
    const html = `
      <div class="game-panel" style="text-align: center; width: 340px;">
        <h1 class="loading-title" style="margin-bottom: 20px; font-size: 24px;">POKÉROGUE</h1>
        <p style="font-size: 8px; color: var(--text-secondary); margin-bottom: 30px; line-height: 1.5;">Roguelike de Pokémon</p>
        
        <div id="options-list">
          <div class="menu-option selected" data-index="0">
            <span class="cursor">▶</span> Nueva Partida
          </div>
          <div class="menu-option ${hasSave ? '' : 'hidden'}" data-index="1" style="opacity: ${hasSave ? 1 : 0.5};">
            <span class="cursor">▶</span> Continuar Run
          </div>
          <div class="menu-option" data-index="2">
            <span class="cursor">▶</span> Controles
          </div>
        </div>
      </div>
    `;

    this.showMenu('title', html);

    // Mapear opciones
    this.menuOptions = [
      () => this.game.changeState(GAME_STATES.STARTER_SELECT),
      () => {
        if (hasSave) {
          this.game.loadSavedGame();
        }
      },
      () => this.showControlsDialog()
    ];
    this.selectedIndex = 0;
    this.updateSelectionVisuals();
  }

  /**
   * Diálogo de controles del juego
   */
  showControlsDialog() {
    this.showDialog(
      'Controles:\\nWASD / Flechas - Mover y Atacar\\nZ - Confirmar / Interactuar / Escaleras\\nX - Mochila / Volver\\nC - Ver Equipo\\n1,2,3,4 - Ataque rápido\\nM - Mapa\\nEsc - Pausa',
      () => this.openTitleScreen()
    );
  }

  /**
   * Pantalla de selección de Starter
   */
  openStarterSelectScreen() {
    const starters = [
      { id: 1, name: 'Bulbasaur', type: 'grass/poison', hp: 45, attack: 49, defense: 49, spAtk: 65, speed: 45, desc: 'Pokémon tipo Planta. Equilibrio defensivo.', color: 'var(--type-grass)' },
      { id: 4, name: 'Charmander', type: 'fire', hp: 39, attack: 52, defense: 43, spAtk: 60, speed: 65, desc: 'Pokémon tipo Fuego. Veloz y ofensivo.', color: 'var(--type-fire)' },
      { id: 7, name: 'Squirtle', type: 'water', hp: 44, attack: 48, defense: 65, spAtk: 50, speed: 43, desc: 'Pokémon tipo Agua. Alta defensa física.', color: 'var(--type-water)' }
    ];

    let html = `
      <div class="game-panel" style="width: 500px; max-width: 95vw;">
        <h2 class="game-panel-title">ELIJE TU COMPAÑERO INICIAL</h2>
        
        <div style="display: flex; gap: 16px; justify-content: space-between; margin-bottom: 20px;">
    `;

    starters.forEach((s, idx) => {
      const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${s.id}.png`;
      html += `
        <div class="menu-option" data-index="${idx}" style="flex: 1; flex-direction: column; padding: 12px; border: 2px solid var(--border-color); text-align: center; cursor: pointer; align-items: center; gap: 4px;">
          <img src="${spriteUrl}" style="image-rendering: pixelated; width: 80px; height: 80px; margin-bottom: 4px;">
          <div style="font-size: 10px; color: ${s.color}; font-weight: bold;">${s.name}</div>
          <div style="font-size: 6px; color: #88a; margin-top: 4px;">PS:${s.hp}  Atk:${s.attack}</div>
          <div style="font-size: 6px; color: #88a;">Def:${s.defense} Vel:${s.speed}</div>
        </div>
      `;
    });

    html += `
        </div>
        <div class="game-panel" id="starter-desc-panel" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); padding: 8px; font-size: 7px; line-height: 1.6; min-height: 50px; text-align: center;">
          Cargando descripción...
        </div>
      </div>
    `;

    this.showMenu('starter', html);

    this.menuOptions = starters.map(s => () => {
      // Confirmar starter y empezar partida
      this.closeMenu();
      this.game.startNewGame(s.id);
    });

    this.selectedIndex = 0;
    this.updateStarterDetails(starters[0]);
  }

  /**
   * Actualiza el panel de descripción del starter seleccionado
   */
  updateStarterDetails(starter) {
    const descPanel = document.getElementById('starter-desc-panel');
    if (descPanel) {
      descPanel.innerHTML = `
        <div style="color: var(--text-accent); margin-bottom: 4px; text-transform: uppercase;">${starter.name} — Tipo ${starter.type}</div>
        <div style="color: var(--text-primary);">${starter.desc}</div>
      `;
    }
  }

  /**
   * Menú de pausa básico
   */
  openPauseMenu() {
    const html = `
      <div class="game-panel" style="width: 260px;">
        <h2 class="game-panel-title">PAUSA</h2>
        <div id="options-list">
          <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Continuar</div>
          <div class="menu-option" data-index="1"><span class="cursor">▶</span> Mochila</div>
          <div class="menu-option" data-index="2"><span class="cursor">▶</span> Equipo Pokémon</div>
          <div class="menu-option" data-index="3"><span class="cursor">▶</span> Guardar y Salir</div>
        </div>
      </div>
    `;

    this.showMenu('pause', html);

    this.menuOptions = [
      () => this.closeMenu(),
      () => this.openInventoryMenu(),
      () => this.openTeamMenu(),
      () => {
        this.game.saveGameData();
        this.showDialog('Partida guardada correctamente.', () => {
          this.game.changeState(GAME_STATES.TITLE);
        });
      }
    ];
    this.selectedIndex = 0;
    this.updateSelectionVisuals();
  }

  /**
   * Menú de inventario/mochila
   */
  openInventoryMenu() {
    const inv = this.game.inventory || [];
    const maxInv = 20;

    let html = `
      <div class="game-panel" style="width: 380px;">
        <h2 class="game-panel-title">MOCHILA (${inv.length}/${maxInv})</h2>
        <div id="options-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 12px;">
    `;

    if (inv.length === 0) {
      html += `<div style="text-align: center; color: var(--text-secondary); font-size: 8px; padding: 20px;">Tu mochila está vacía.</div>`;
    } else {
      inv.forEach((slot, idx) => {
        const item = this.game.itemsData.find(i => i.id === slot.itemId);
        const name = item ? item.name : slot.itemId;
        const icon = item ? item.sprite || '📦' : '📦';
        html += `
          <div class="menu-option" data-index="${idx}">
            <span class="cursor">▶</span>
            <span style="margin-right: 8px;">${icon}</span>
            <span style="flex-grow: 1;">${name}</span>
            <span style="color: var(--text-accent);">x${slot.quantity}</span>
          </div>
        `;
      });
    }

    html += `
        </div>
        <div id="item-desc-panel" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); padding: 8px; font-size: 7px; min-height: 48px; line-height: 1.5; color: var(--text-secondary);">
          Elige un objeto para ver su descripción.
        </div>
      </div>
    `;

    this.showMenu('inventory', html);

    if (inv.length === 0) {
      this.menuOptions = [() => this.openPauseMenu()];
      this.selectedIndex = 0;
      // Añadir una opción ficticia para que al pulsar atrás vuelva
      const opt = document.createElement('div');
      opt.className = 'menu-option selected';
      opt.innerHTML = '<span class="cursor">▶</span> Volver al menú';
      opt.onclick = () => this.openPauseMenu();
      document.getElementById('options-list').appendChild(opt);
    } else {
      this.menuOptions = inv.map(slot => () => {
        this.selectedItem = slot.itemId;
        this.openItemActionsMenu();
      });
      this.selectedIndex = 0;
      this.updateItemDetails(inv[0].itemId);
    }
  }

  /**
   * Actualiza el panel de descripción del objeto seleccionado en el inventario
   */
  updateItemDetails(itemId) {
    const descPanel = document.getElementById('item-desc-panel');
    if (descPanel) {
      const item = this.game.itemsData.find(i => i.id === itemId);
      descPanel.innerHTML = item ? item.description : 'Sin descripción.';
    }
  }

  /**
   * Acciones posibles sobre un objeto (Usar, Tirar, Cancelar)
   */
  openItemActionsMenu() {
    const item = this.game.itemsData.find(i => i.id === this.selectedItem);
    const name = item ? item.name : this.selectedItem;

    const html = `
      <div class="game-panel" style="width: 280px;">
        <h2 class="game-panel-title">${name}</h2>
        <div id="options-list">
          <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Usar objeto</div>
          <div class="menu-option" data-index="1"><span class="cursor">▶</span> Tirar objeto</div>
          <div class="menu-option" data-index="2"><span class="cursor">▶</span> Atrás</div>
        </div>
      </div>
    `;

    this.showMenu('item_actions', html);

    this.menuOptions = [
      () => {
        // Si es una ball o escape rope, se usa directo sobre el jugador o la mazmorra
        if (item.type === 'capture' || item.type === 'escape') {
          this.closeMenu();
          // Obtener enemigo más cercano
          const enemyEntities = this.game.entityManager.getEntitiesWithComponents('aiControlled');
          if (item.type === 'capture') {
            if (enemyEntities.length > 0) {
              // Usar Poké Ball contra el primer enemigo cercano
              this.game.useInventoryItem(item.id, enemyEntities[0]);
            } else {
              this.showDialog('No hay ningún Pokémon salvaje cerca para capturar.', () => this.openInventoryMenu());
            }
          } else {
            // Escape rope
            this.game.useInventoryItem(item.id, this.game.getPlayerId());
          }
        } else {
          // Si es curativo, etc. pide elegir target del equipo
          this.openItemTargetMenu();
        }
      },
      () => {
        // Tirar objeto
        const slotIdx = this.game.inventory.findIndex(s => s.itemId === this.selectedItem);
        if (slotIdx > -1) {
          this.game.inventory.splice(slotIdx, 1);
        }
        this.showDialog('Objeto descartado.', () => this.openInventoryMenu());
      },
      () => this.openInventoryMenu()
    ];
    this.selectedIndex = 0;
    this.updateSelectionVisuals();
  }

  /**
   * Elegir un Pokémon del equipo para aplicar el objeto curativo/potenciador
   */
  openItemTargetMenu() {
    const party = this.game.party;
    const item = this.game.itemsData.find(i => i.id === this.selectedItem);

    let html = `
      <div class="game-panel" style="width: 320px;">
        <h2 class="game-panel-title">¿USAR ${item.name.toUpperCase()} EN?</h2>
        <div id="options-list">
    `;

    party.forEach((poke, idx) => {
      html += `
        <div class="menu-option" data-index="${idx}">
          <span class="cursor">▶</span>
          <span style="flex-grow: 1;">${poke.name}</span>
          <span style="color: var(--text-secondary);">PS: ${poke.hp}/${poke.maxHp}</span>
        </div>
      `;
    });

    html += `
          <div class="menu-option" data-index="${party.length}">
            <span class="cursor">▶</span> Volver atrás
          </div>
        </div>
      </div>
    `;

    this.showMenu('use_item_target', html);

    this.menuOptions = party.map(poke => () => {
      // Usar item curativo
      this.closeMenu();
      this.game.useInventoryItem(item.id, poke.id);
    });

    // Agregar opción volver
    this.menuOptions.push(() => this.openItemActionsMenu());
    this.selectedIndex = 0;
    this.updateSelectionVisuals();
  }

  /**
   * Menú de Equipo Pokémon
   */
  openTeamMenu() {
    const party = this.game.party;

    let html = `
      <div class="game-panel" style="width: 340px;">
        <h2 class="game-panel-title">EQUIPO POKÉMON</h2>
        <div id="options-list">
    `;

    party.forEach((poke, idx) => {
      const leaderIndicator = poke.isLeader ? '<span style="color: var(--xp-blue); font-size: 6px; font-weight: bold;">[LÍDER]</span>' : '';
      html += `
        <div class="menu-option" data-index="${idx}" style="flex-direction: column; align-items: flex-start; gap: 2px;">
          <div style="display: flex; justify-content: space-between; width: 100%;">
            <span><span class="cursor">▶</span> ${poke.name}</span>
            <span>Nv.${poke.level} ${leaderIndicator}</span>
          </div>
          <div style="font-size: 6px; color: var(--text-secondary); margin-left: 12px;">PS: ${poke.hp}/${poke.maxHp}</div>
        </div>
      `;
    });

    html += `
          <div class="menu-option" data-index="${party.length}">
            <span class="cursor">▶</span> Volver al menú
          </div>
        </div>
      </div>
    `;

    this.showMenu('team', html);

    this.menuOptions = party.map(poke => () => {
      this.selectedPokemon = poke.id;
      this.openPokemonActionsMenu();
    });

    // Volver
    this.menuOptions.push(() => this.openPauseMenu());
    this.selectedIndex = 0;
    this.updateSelectionVisuals();
  }

  /**
   * Acciones posibles sobre un Pokémon (Hacer Líder, Ver Movimientos, Cancelar)
   */
  openPokemonActionsMenu() {
    const info = this.game.entityManager.getComponent(this.selectedPokemon, 'pokemonInfo');
    const fighter = this.game.entityManager.getComponent(this.selectedPokemon, 'fighter');

    const html = `
      <div class="game-panel" style="width: 300px;">
        <h2 class="game-panel-title" style="text-transform: uppercase;">${info.name}</h2>
        <div id="options-list">
          <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Establecer como Líder</div>
          <div class="menu-option" data-index="1"><span class="cursor">▶</span> Ver movimientos</div>
          <div class="menu-option" data-index="2"><span class="cursor">▶</span> Atrás</div>
        </div>
      </div>
    `;

    this.showMenu('pokemon_actions', html);

    this.menuOptions = [
      () => {
        // Hacer líder
        if (fighter.hp <= 0) {
          this.showDialog('¡Un Pokémon debilitado no puede liderar el equipo!', () => this.openTeamMenu());
          return;
        }

        // Quitar líder actual
        const partyEntities = this.game.entityManager.getEntitiesWithComponents('partyMember');
        for (const pid of partyEntities) {
          const mem = this.game.entityManager.getComponent(pid, 'partyMember');
          if (mem) {
            mem.isLeader = (pid === this.selectedPokemon);
            this.game.entityManager.setComponent(pid, 'partyMember', mem);
          }
        }

        // Registrar nuevo jugador ID en el juego
        this.game._playerId = this.selectedPokemon;
        this.game.turnManager.setPlayerEntityId(this.selectedPokemon);
        
        this.showDialog(`¡${info.name} ahora lidera el equipo!`, () => this.openTeamMenu());
      },
      () => {
        // Ver movimientos
        this.openMovesViewMenu();
      },
      () => this.openTeamMenu()
    ];
    this.selectedIndex = 0;
    this.updateSelectionVisuals();
  }

  /**
   * Ver movimientos y sus PP de un Pokémon
   */
  openMovesViewMenu() {
    const info = this.game.entityManager.getComponent(this.selectedPokemon, 'pokemonInfo');
    const moves = info.currentMoves || [];

    let html = `
      <div class="game-panel" style="width: 360px;">
        <h2 class="game-panel-title">MOVIMIENTOS DE ${info.name.toUpperCase()}</h2>
        <div id="options-list">
    `;

    moves.forEach((slot, idx) => {
      const moveData = this.game.movesData.find(m => m.id === slot.moveId);
      const moveName = moveData ? moveData.name : slot.moveId;
      const type = moveData ? moveData.type : 'normal';
      
      html += `
        <div class="menu-option" data-index="${idx}" style="flex-direction: column; align-items: flex-start; gap: 2px;">
          <div style="display: flex; justify-content: space-between; width: 100%;">
            <span><span class="cursor">▶</span> ${moveName}</span>
            <span class="type-badge ${type}">${type}</span>
          </div>
          <div style="font-size: 6px; color: var(--text-secondary); margin-left: 12px; display: flex; gap: 16px;">
            <span>PP: ${slot.currentPP}/${slot.maxPP}</span>
            <span>Pot: ${moveData?.power || '—'}</span>
            <span>Prec: ${moveData?.accuracy || '—'}</span>
          </div>
        </div>
      `;
    });

    html += `
          <div class="menu-option" data-index="${moves.length}">
            <span class="cursor">▶</span> Volver atrás
          </div>
        </div>
      </div>
    `;

    this.showMenu('moves_view', html);

    this.menuOptions = moves.map(() => () => {}); // No hacen nada al confirmar, solo se listan
    this.menuOptions.push(() => this.openPokemonActionsMenu());
    this.selectedIndex = moves.length; // Selección en Volver
    this.updateSelectionVisuals();
  }

  /**
   * Pantalla de fin de partida (Game Over)
   */
  openGameOverScreen() {
    const floor = this.game.getCurrentFloor();
    const html = `
      <div class="game-panel" style="text-align: center; width: 340px; border-color: var(--hp-red);">
        <h1 class="loading-title" style="color: var(--hp-red); font-size: 24px; text-shadow: 2px 2px 0 #880000; margin-bottom: 20px;">FIN DE PARTIDA</h1>
        <p style="font-size: 8px; line-height: 1.6; margin-bottom: 24px; color: var(--text-primary);">
          Tu equipo ha caído debilitado en el <br>
          <span style="color: var(--text-accent); font-size: 12px;">PISO ${floor}</span>.
        </p>
        
        <div id="options-list">
          <div class="menu-option selected" data-index="0" style="justify-content: center;">
            <span class="cursor">▶</span> Volver al Menú Principal
          </div>
        </div>
      </div>
    `;

    this.showMenu('game_over', html);

    this.menuOptions = [
      () => {
        // Borrar el save al morir (permadeath roguelike)
        localStorage.removeItem('pokerogue_save');
        this.game.changeState(GAME_STATES.TITLE);
      }
    ];
    this.selectedIndex = 0;
    this.updateSelectionVisuals();
  }

  /**
   * Pantalla de victoria (Victory)
   */
  openVictoryScreen() {
    const html = `
      <div class="game-panel" style="text-align: center; width: 360px; border-color: var(--hp-green);">
        <h1 class="loading-title" style="color: var(--hp-green); font-size: 20px; text-shadow: 2px 2px 0 #006600; margin-bottom: 20px; animation: victoryBlink 1s infinite alternate;">¡VICTORIA!</h1>
        <p style="font-size: 8px; line-height: 1.8; margin-bottom: 24px;">
          ¡Has derrotado a Mewtwo en el Laboratorio Final y completado el PokéRogue!
        </p>
        
        <div id="options-list">
          <div class="menu-option selected" data-index="0" style="justify-content: center;">
            <span class="cursor">▶</span> Volver al Menú Principal
          </div>
        </div>
      </div>
    `;

    this.showMenu('victory', html);

    this.menuOptions = [
      () => {
        // Borrar el save completado
        try {
          localStorage.removeItem('pokerogue_save');
        } catch (e) {}
        this.game.changeState(GAME_STATES.TITLE);
      }
    ];
    this.selectedIndex = 0;
    this.updateSelectionVisuals();
  }

  // ─── CONTROL DE ENTRADA Y SELECCIÓN DE OPCIONES ───────────────────────────

  /**
   * Maneja el movimiento de selección por teclado
   */
  handleMenuInput(data) {
    const options = this.menuContainer.querySelectorAll('.menu-option');
    if (options.length === 0) return;

    if (data.direction === 'down' || data.direction === 'right') {
      this.selectedIndex = (this.selectedIndex + 1) % options.length;
      this.updateSelectionVisuals();
      this.playMenuSound();
    } else if (data.direction === 'up' || data.direction === 'left') {
      this.selectedIndex = (this.selectedIndex - 1 + options.length) % options.length;
      this.updateSelectionVisuals();
      this.playMenuSound();
    } else if (data.action === 'confirm') {
      const callback = this.menuOptions[this.selectedIndex];
      if (callback) {
        this.playConfirmSound();
        callback();
      }
    } else if (data.action === 'cancel') {
      // Regresar/Cancelar según el menú
      this.playCancelSound();
      this.handleCancelAction();
    }
  }

  /**
   * Controla qué pasa al pulsar "Atrás/Cancelar" (tecla X) en cada tipo de menú
   */
  handleCancelAction() {
    switch (this.currentMenuType) {
      case 'title':
        // No hace nada
        break;
      case 'starter':
        this.openTitleScreen();
        break;
      case 'pause':
        this.closeMenu();
        break;
      case 'inventory':
      case 'team':
        this.openPauseMenu();
        break;
      case 'item_actions':
      case 'use_item_target':
        this.openInventoryMenu();
        break;
      case 'pokemon_actions':
      case 'moves_view':
        this.openTeamMenu();
        break;
      default:
        this.closeMenu();
    }
  }

  /**
   * Actualiza las clases CSS para reflejar la opción seleccionada visualmente
   */
  updateSelectionVisuals() {
    const options = this.menuContainer.querySelectorAll('.menu-option');
    options.forEach((opt, idx) => {
      if (idx === this.selectedIndex) {
        opt.classList.add('selected');
        // Asegurar que el cursor se muestre
        const cursor = opt.querySelector('.cursor');
        if (cursor) cursor.style.opacity = '1';
      } else {
        opt.classList.remove('selected');
        const cursor = opt.querySelector('.cursor');
        if (cursor) cursor.style.opacity = '0';
      }
    });

    // Evento específico para actualizar descripciones al mover selección
    if (this.currentMenuType === 'inventory') {
      const inv = this.game.inventory || [];
      if (inv[this.selectedIndex]) {
        this.updateItemDetails(inv[this.selectedIndex].itemId);
      }
    } else if (this.currentMenuType === 'starter') {
      const starters = [
        { id: 1, name: 'Bulbasaur', type: 'grass/poison', hp: 45, attack: 49, defense: 49, spAtk: 65, speed: 45, desc: 'Pokémon tipo Planta. Equilibrio defensivo.', color: 'var(--type-grass)' },
        { id: 4, name: 'Charmander', type: 'fire', hp: 39, attack: 52, defense: 43, spAtk: 60, speed: 65, desc: 'Pokémon tipo Fuego. Veloz y ofensivo.', color: 'var(--type-fire)' },
        { id: 7, name: 'Squirtle', type: 'water', hp: 44, attack: 48, defense: 65, spAtk: 50, speed: 43, desc: 'Pokémon tipo Agua. Alta defensa física.', color: 'var(--type-water)' }
      ];
      if (starters[this.selectedIndex]) {
        this.updateStarterDetails(starters[this.selectedIndex]);
      }
    }
  }

  // ─── DIÁLOGOS TIPO RPG ───────────────────────────────────────────────────

  /**
   * Encola un diálogo RPG y lo muestra si es el único
   * @param {string} text - Texto del diálogo
   * @param {Function} [callback] - Función a llamar cuando finalice el diálogo
   */
  showDialog(text, callback = null) {
    this.dialogQueue.push({ text, callback });

    // Si es el único en cola, mostrarlo de inmediato
    if (this.dialogQueue.length === 1) {
      this.displayNextDialog();
    }
  }

  /**
   * Muestra el siguiente diálogo en cola
   */
  displayNextDialog() {
    if (this.dialogQueue.length === 0) {
      this.closeDialog();
      return;
    }

    const { text, callback } = this.dialogQueue[0];
    this.currentDialogCallback = callback;

    this.game.inputHandler.setContext('dialog');
    this.overlay.classList.remove('hidden');

    const html = `
      <div class="game-panel" style="position: absolute; bottom: 8px; left: 8px; width: calc(100% - 16px); min-height: 80px; display: flex; flex-direction: column; justify-content: space-between; border-color: var(--border-glow); padding: 12px;">
        <div id="dialog-text" style="font-size: 8px; line-height: 1.8; white-space: pre-wrap; color: var(--text-primary);"></div>
        <div style="text-align: right; font-size: 6px; color: var(--text-accent); animation: loadingDots 1s infinite alternate;">PULSA Z PARA CONTINUAR...</div>
      </div>
    `;

    this.menuContainer.innerHTML = html;
    this.currentMenuType = 'dialog';

    // Animación letra por letra del diálogo
    this.animateText(text);
  }

  /**
   * Animación letra por letra del diálogo RPG
   */
  animateText(text) {
    const el = document.getElementById('dialog-text');
    if (!el) return;

    let idx = 0;
    el.innerHTML = '';

    const timer = setInterval(() => {
      if (idx < text.length) {
        el.innerHTML += text[idx];
        idx++;
        // Sonido de clic sutil por letra
        if (idx % 2 === 0) this.playMenuSound();
      } else {
        clearInterval(timer);
      }
    }, 20);

    // Guardar timer para poder saltear
    this.dialogTimer = timer;
    this.dialogTextRaw = text;
  }

  /**
   * Saltea la animación letra por letra para mostrar el diálogo de golpe
   */
  skipTextAnimation() {
    if (this.dialogTimer) {
      clearInterval(this.dialogTimer);
      this.dialogTimer = null;
      const el = document.getElementById('dialog-text');
      if (el) el.innerHTML = this.dialogTextRaw;
    }
  }

  /**
   * Avanza al diálogo posterior o finaliza
   */
  handleDialogInput(data) {
    if (data.action === 'advance' || data.action === 'skip') {
      if (this.dialogTimer) {
        // Si aún se está animando, mostrar de golpe
        this.skipTextAnimation();
        this.playMenuSound();
      } else {
        // Pasar al siguiente diálogo
        this.playConfirmSound();
        const finishedDialog = this.dialogQueue.shift();
        
        // Llamar al callback de este diálogo antes de pasar al siguiente
        if (this.currentDialogCallback) {
          const cb = this.currentDialogCallback;
          this.currentDialogCallback = null;
          cb();
        }

        // Siguiente diálogo en cola
        this.displayNextDialog();
      }
    }
  }

  /**
   * Cierra la UI de diálogos
   */
  closeDialog() {
    this.currentMenuType = null;
    this.currentDialogCallback = null;
    this.overlay.classList.add('hidden');
    this.menuContainer.innerHTML = '';
    
    // Restaurar contexto de entrada del juego
    const state = this.game.getState();
    if (state === GAME_STATES.EXPLORING) {
      this.game.inputHandler.setContext('exploration');
    } else if (state === GAME_STATES.MENU) {
      this.game.inputHandler.setContext('menu');
    }
  }

  // ─── EFECTOS DE SONIDO CHIPTUNE ───────────────────────────────────────────

  /** @type {AudioContext|null} */
  _audioCtx = null;

  /**
   * Obtiene o crea el AudioContext compartido.
   * @returns {AudioContext|null}
   * @private
   */
  _getAudioContext() {
    try {
      if (!this._audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        this._audioCtx = new Ctx();
      }
      if (this._audioCtx.state === 'suspended') {
        this._audioCtx.resume();
      }
      return this._audioCtx;
    } catch (e) {
      return null;
    }
  }

  /**
   * Reproduce una nota con envolvente ADSR simple.
   * @param {number} freq - Frecuencia en Hz
   * @param {number} startTime - Tiempo de inicio en el contexto
   * @param {number} duration - Duración en segundos
   * @param {string} [waveform='square']
   * @param {number} [volume=0.03]
   * @private
   */
  _playTone(freq, startTime, duration, waveform = 'square', volume = 0.03) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveform;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  playMenuSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._playTone(880, t, 0.025, 'square', 0.015);
      this._playTone(660, t + 0.02, 0.02, 'square', 0.01);
    } catch (e) {}
  }

  playConfirmSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._playTone(523, t, 0.06, 'square', 0.025);
      this._playTone(659, t + 0.06, 0.08, 'square', 0.025);
    } catch (e) {}
  }

  playCancelSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._playTone(392, t, 0.05, 'triangle', 0.02);
      this._playTone(262, t + 0.05, 0.06, 'triangle', 0.015);
    } catch (e) {}
  }

  playDamageSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(80, t + 0.15);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(t);
      source.stop(t + 0.2);
    } catch (e) {}
  }

  playLevelUpSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        this._playTone(freq, t + i * 0.1, 0.12, 'square', 0.02);
      });
    } catch (e) {}
  }

  playCaptureShakeSound(shakeIndex) {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const freq = 440 + shakeIndex * 80;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq + 60, t + 0.3);
      gain.gain.setValueAtTime(0.025, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    } catch (e) {}
  }
}
