import { openPauseMenu } from './PauseMenu.js';

export function openOptionsMenu(ui) {
  const sfxVol = Math.round(ui.sfx._volume * 100);
  const musicVol = Math.round(ui.music.masterGain.gain.value * 100);

  const html = `
    <div class="game-panel" style="width: 300px;">
      <h2 class="game-panel-title">OPCIONES</h2>
      <div id="options-list">
        <div class="menu-option selected" data-index="0"><span class="cursor">▶</span> Volumen SFX: <span id="sfx-vol">${sfxVol}</span>%</div>
        <div class="menu-option" data-index="1"><span class="cursor">▶</span> Volumen Música: <span id="music-vol">${musicVol}</span>%</div>
        <div class="menu-option" data-index="2"><span class="cursor">▶</span> Volver</div>
      </div>
      <div class="panel-instructions" style="margin-top: 10px; font-size: 12px; color: #888;">
        Usa Izquierda/Derecha para ajustar
      </div>
    </div>
  `;

  ui.showMenu('options', html);

  const originalHandleMenuInput = ui.handleMenuInput;

  const restoreAndGoBack = () => {
    ui.handleMenuInput = originalHandleMenuInput;
    openPauseMenu(ui);
  };

  ui.menuOptions = [
    // SFX
    (dir) => {
      if (dir === 'left') ui.sfx.setVolume(Math.max(0, ui.sfx._volume - 0.1));
      if (dir === 'right') ui.sfx.setVolume(Math.min(1, ui.sfx._volume + 0.1));
      document.getElementById('sfx-vol').textContent = Math.round(ui.sfx._volume * 100);
      ui.sfx.playMenuSound();
    },
    // Music
    (dir) => {
      if (dir === 'left') ui.music.setVolume(Math.max(0, ui.music.masterGain.gain.value - 0.1));
      if (dir === 'right') ui.music.setVolume(Math.min(1, ui.music.masterGain.gain.value + 0.1));
      document.getElementById('music-vol').textContent = Math.round(ui.music.masterGain.gain.value * 100);
      ui.sfx.playMenuSound();
    },
    // Volver
    restoreAndGoBack
  ];
  
  // Custom input handler for Left/Right
  ui.handleMenuInput = (data) => {
    if (data.direction === 'left' || data.direction === 'right') {
      if (ui.selectedIndex < 2) {
        ui.menuOptions[ui.selectedIndex](data.direction);
      }
      return;
    }
    if (data.action === 'confirm' && ui.selectedIndex < 2) {
      // No hacer nada en confirm para opciones de volumen
      return;
    }
    if (data.action === 'cancel') {
      ui.sfx.playCancelSound();
      restoreAndGoBack();
      return;
    }
    originalHandleMenuInput.call(ui, data);
  };

  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();
}
