import { openPauseMenu } from './PauseMenu.js';

export function openOptionsMenu(ui) {
  const sfxVol = Math.round(ui.sfx._volume * 100);
  const musicVol = Math.round(ui.music.masterGain.gain.value * 100);
  if (ui.game.autoPickup == null) ui.game.autoPickup = true;
  const autoPickLabel = ui.game.autoPickup ? 'Sí' : 'No';
  const minimapOn = !!(ui.game.renderer && ui.game.renderer.hud && ui.game.renderer.hud.showMinimap);
  const minimapLabel = minimapOn ? 'Sí' : 'No';

  const html = `
    <div class="game-panel" style="width: 300px;">
      <h2 class="game-panel-title">OPCIONES</h2>
      <p style="font-size:6px;color:var(--text-secondary);margin:0 10px 8px;text-align:center;">Tras una actualización: recarga forzada (Ctrl+F5). Guardar conserva objetos, trampas, Kecleon y clima del piso.</p>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Volumen SFX: <span id="sfx-vol">${sfxVol}</span>%</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Volumen Música: <span id="music-vol">${musicVol}</span>%</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> Recoger al andar: <span id="auto-pick">${autoPickLabel}</span></div>
        <div class="menu-option" data-index="3"><span class="cursor">▶</span> Minimapa (HUD): <span id="minimap-opt">${minimapLabel}</span></div>
        <div class="menu-option" data-index="4"><span class="cursor">▶</span> Volver</div>
      </div>
      <div class="panel-instructions" style="margin-top: 10px; font-size: 12px; color: #888;">
        Usa Izquierda/Derecha para ajustar
      </div>
    </div>
  `;

  ui.showMenu('options', html);

  const persistVolume = () => {
    try {
      localStorage.setItem('pokerogue_volumes', JSON.stringify({
        sfx: ui.sfx._volume,
        music: ui.music.masterGain.gain.value
      }));
    } catch (e) {}
  };

  const persistPrefs = () => {
    try {
      const showMinimap = !!(ui.game.renderer && ui.game.renderer.hud && ui.game.renderer.hud.showMinimap);
      localStorage.setItem('pokerogue_prefs', JSON.stringify({
        autoPickup: !!ui.game.autoPickup,
        showMinimap
      }));
    } catch (e) {}
  };

  ui.menuOptions = [
    (dir) => {
      if (dir === 'left') ui.sfx.setVolume(Math.max(0, ui.sfx._volume - 0.1));
      if (dir === 'right') ui.sfx.setVolume(Math.min(1, ui.sfx._volume + 0.1));
      const el = document.getElementById('sfx-vol');
      if (el) el.textContent = Math.round(ui.sfx._volume * 100);
      ui.sfx.playMenuSound();
      persistVolume();
    },
    (dir) => {
      if (dir === 'left') ui.music.setVolume(Math.max(0, ui.music.masterGain.gain.value - 0.1));
      if (dir === 'right') ui.music.setVolume(Math.min(1, ui.music.masterGain.gain.value + 0.1));
      const el = document.getElementById('music-vol');
      if (el) el.textContent = Math.round(ui.music.masterGain.gain.value * 100);
      ui.sfx.playMenuSound();
      persistVolume();
    },
    (dir) => {
      if (dir === 'left' || dir === 'right' || dir == null) {
        ui.game.autoPickup = !ui.game.autoPickup;
        const el = document.getElementById('auto-pick');
        if (el) el.textContent = ui.game.autoPickup ? 'Sí' : 'No';
        ui.sfx.playMenuSound();
        persistPrefs();
      }
    },
    (dir) => {
      if (dir === 'left' || dir === 'right' || dir == null) {
        if (ui.game.renderer && ui.game.renderer.hud) {
          ui.game.renderer.hud.showMinimap = !ui.game.renderer.hud.showMinimap;
          const el = document.getElementById('minimap-opt');
          if (el) el.textContent = ui.game.renderer.hud.showMinimap ? 'Sí' : 'No';
          ui.game.needsRender = true;
        }
        ui.sfx.playMenuSound();
        persistPrefs();
      }
    },
    () => openPauseMenu(ui)
  ];

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
