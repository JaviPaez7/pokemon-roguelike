import { GAME_STATES } from '../../constants.js';

/**
 * Abre el menú de confirmación para usar las escaleras.
 * 
 * @param {import('../UIManager.js').UIManager} ui
 */
export function openStairsMenu(ui) {
  const floor = ui.game._currentFloor || ui.game.floor || 1;
  const nextFloor = floor + 1;
  let nextZone = '';
  let bossHint = '';
  let zoneProgress = '';
  if (ui.game.floorsData && ui.game.floorsData.zones) {
    const z = ui.game.floorsData.zones.find(zone => nextFloor >= zone.floors[0] && nextFloor <= zone.floors[1]);
    if (z) {
      nextZone = z.name;
      const idx = nextFloor - z.floors[0] + 1;
      const total = z.floors[1] - z.floors[0] + 1;
      zoneProgress = `<br><span style="color:#aaccff;">Progreso zona: ${idx}/${total}</span>`;
      if (z.boss && nextFloor === z.floors[1]) {
        bossHint = `<br><span style="color:#ff6666;">¡Sala del jefe: ${z.boss.name}!</span>`;
      }
    }
  }

  // Resumen rápido del equipo (PS bajos / tripa / debilitados)
  const partyIds = ui.game.entityManager.getEntitiesWithComponents('partyMember', 'fighter', 'pokemonInfo');
  const lowHp = [];
  const fainted = [];
  let leaderBelly = null;
  let bagSlots = (ui.game.inventory || []).length;
  let bagMax = ui.game.maxInventorySize || 24;
  for (const id of partyIds) {
    const f = ui.game.entityManager.getComponent(id, 'fighter');
    const info = ui.game.entityManager.getComponent(id, 'pokemonInfo');
    if (!f || !info) continue;
    if (f.hp <= 0) fainted.push(info.name);
    else if (f.hp / f.maxHp <= 0.35) lowHp.push(info.name);
    if (id === ui.game._playerId) leaderBelly = Math.ceil(f.belly ?? 100);
  }
  let teamHint = '';
  if (fainted.length) {
    teamHint += `<br><span style="color:#ff6666;">Debilitados: ${fainted.join(', ')} (no pelearán)</span>`;
  }
  if (lowHp.length) {
    teamHint += `<br><span style="color:#ffaa66;">PS bajos: ${lowHp.join(', ')}</span>`;
  }
  if (leaderBelly != null && leaderBelly <= 0) {
    teamHint += `<br><span style="color:#ff4444;">¡Sin tripa! Baja con comida o arriesgas desfallecer.</span>`;
  } else if (leaderBelly != null && leaderBelly <= 20) {
    teamHint += `<br><span style="color:#ff8844;">Tripa baja (${leaderBelly}). ¿Llevas comida?</span>`;
  }
  if (bagSlots >= bagMax) {
    teamHint += `<br><span style="color:#ffaa00;">Bolsa llena (${bagSlots}/${bagMax})</span>`;
  }
  const leaderInfo = ui.game.entityManager.getComponent(ui.game._playerId, 'pokemonInfo');
  if (leaderInfo && leaderInfo.currentMoves) {
    const lowPp = leaderInfo.currentMoves.filter(m => m && m.maxPP > 0 && m.currentPP / m.maxPP <= 0.25).length;
    if (lowPp >= 2) {
      teamHint += `<br><span style="color:#88aaff;">PP bajos en ${lowPp} movimientos — ¿Éter?</span>`;
    }
  }
  const hostilesLeft = (ui.game.entityManager.getEntitiesWithComponents('fighter', 'position') || []).filter(id => {
    if (ui.game.entityManager.hasComponent(id, 'partyMember')) return false;
    if (ui.game.entityManager.hasComponent(id, 'npcMerchant')) return false;
    if (ui.game.entityManager.hasComponent(id, 'npcFriendly')) return false;
    const f = ui.game.entityManager.getComponent(id, 'fighter');
    return f && f.hp > 0;
  }).length;
  if (hostilesLeft > 0) {
    teamHint += `<br><span style="color:#ff9966;">Quedan ${hostilesLeft} salvaje${hostilesLeft === 1 ? '' : 's'} en el piso</span>`;
  }

  const html = `
    <div class="game-panel" style="width: 280px; margin: auto; transform: translateY(40px);">
      <h2 class="game-panel-title">¿Bajar las escaleras?</h2>
      <p style="font-size: 7px; color: var(--text-secondary); margin: 0 10px 12px; line-height: 1.5; text-align: center;">
        Piso ${floor} → <strong style="color:#ffcc00;">Piso ${nextFloor}</strong>
        ${nextZone ? `<br>${nextZone}` : ''}${zoneProgress}${bossHint}${teamHint}
        <br><span style="color:#ffd700;">${ui.game.coins || 0} Poké</span>
      </p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Sí, bajar</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Quedarme</div>
      </div>
    </div>
  `;

  ui.currentMenuType = 'stairs_menu';
  ui.game.changeState(GAME_STATES.MENU);
  ui.showMenu('stairs_menu', html);

  ui.menuOptions = [
    () => {
      ui.closeMenu();
      try {
        if (ui.sfx && ui.sfx.playStairsSound) ui.sfx.playStairsSound();
      } catch (e) {}
      ui.game.eventBus.emit('floor_change', { direction: 'down' });
    },
    () => {
      ui.closeMenu();
      ui.game.changeState(GAME_STATES.EXPLORING);
    }
  ];

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
