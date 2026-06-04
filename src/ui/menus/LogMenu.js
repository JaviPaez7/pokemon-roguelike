import { openPauseMenu } from './PauseMenu.js';

/**
 * Abre el menú de historial de mensajes en pantalla.
 * @param {import('../UIManager.js').UIManager} ui - Gestor de UI
 */
export function openLogMenu(ui) {
  const logs = ui.game.getMessageLog() || [];

  let html = `
    <div class="game-panel" style="width: 380px; font-size: 8px;">
      <h2 class="game-panel-title">HISTORIAL DE MENSAJES</h2>
      <div id="message-log-container" style="max-height: 200px; overflow-y: auto; margin-bottom: 12px; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 4px; line-height: 1.6; text-align: left;">
  `;

  if (logs.length === 0) {
    html += `<div style="text-align: center; color: var(--text-secondary); padding: 20px;">No hay mensajes registrados.</div>`;
  } else {
    logs.forEach(log => {
      // Si el log es un objeto con texto
      const text = typeof log === 'object' ? log.text : log;
      html += `<div style="margin-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 4px; color: var(--text-primary);">${text}</div>`;
    });
  }

  html += `
      </div>
      <div id="options-list">
        <div class="menu-option selected" data-index="0" style="justify-content: center;">
          <span class="cursor">▶</span> Volver
        </div>
      </div>
    </div>
  `;

  ui.showMenu('log_history', html);

  ui.menuOptions = [
    () => openPauseMenu(ui)
  ];
  ui.selectedIndex = 0;
  ui.updateSelectionVisuals();

  // Desplazar automáticamente al fondo para ver los mensajes más recientes
  setTimeout(() => {
    const el = document.getElementById('message-log-container');
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, 50);
}
