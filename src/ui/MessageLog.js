/**
 * MessageLog.js — Log de mensajes estilo roguelike
 * Muestra mensajes de combate y eventos en la parte inferior
 */

import { COLORS } from '../constants.js';

export class MessageLog {
  /**
   * @param {number} maxMessages - Máximo de mensajes en historial
   */
  constructor(maxMessages = 100) {
    this.messages = [];
    this.maxMessages = maxMessages;
    this.displayCount = 2; // Pocos mensajes: no tapar el mapa
    this.fadeTimer = 0;
  }

  /**
   * Añade un mensaje al log
   * @param {string} text - Texto del mensaje
   * @param {string} color - Color del texto (hex)
   */
  add(text, color = COLORS.UI_TEXT) {
    this.messages.push({
      text: String(text),
      color,
      timestamp: Date.now(),
      age: 0
    });

    // Limitar historial
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    this.fadeTimer = 0;
  }

  /**
   * Añade un mensaje de combate con formato
   * @param {string} text - Texto
   */
  addCombat(text) {
    this.add(text, '#ffffff');
  }

  /**
   * Añade un mensaje de super efectivo
   * @param {string} text - Texto
   */
  addSuperEffective(text) {
    this.add(text, COLORS.SUPER_EFFECTIVE);
  }

  /**
   * Añade un mensaje de no muy efectivo
   * @param {string} text - Texto
   */
  addNotEffective(text) {
    this.add(text, COLORS.NOT_EFFECTIVE);
  }

  /**
   * Añade un mensaje de crítico
   * @param {string} text - Texto
   */
  addCritical(text) {
    this.add(text, COLORS.CRITICAL);
  }

  /**
   * Añade un mensaje de sistema (pickup, piso, etc)
   * @param {string} text - Texto
   */
  addSystem(text) {
    this.add(text, '#60a5fa');
  }

  /**
   * Añade un mensaje de peligro
   * @param {string} text - Texto
   */
  addDanger(text) {
    this.add(text, COLORS.HP_RED);
  }

  /**
   * Añade un mensaje de éxito
   * @param {string} text - Texto
   */
  addSuccess(text) {
    this.add(text, COLORS.HP_GREEN);
  }

  /**
   * Obtiene los últimos N mensajes para mostrar
   * @param {number} count - Cantidad de mensajes
   * @returns {Array} Mensajes recientes
   */
  getRecent(count = this.displayCount) {
    const now = Date.now();
    // Solo mensajes recientes (desaparecen solos ~3.5s)
    const fresh = this.messages.filter(m => (now - (m.timestamp || 0)) < 3500);
    return fresh.slice(-count);
  }

  /**
   * Renderiza el log de mensajes en el canvas
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {number} x - Posición X
   * @param {number} y - Posición Y de inicio (parte inferior)
   * @param {number} width - Ancho disponible
   */
  render(ctx, x, y, width) {
    const recent = this.getRecent();
    if (recent.length === 0) return;

    const lineHeight = 12;
    const padding = 4;
    const bgHeight = recent.length * lineHeight + padding * 2;
    const now = Date.now();

    ctx.save();
    // Fondo suave: no tapa el mapa
    ctx.fillStyle = 'rgba(8, 10, 18, 0.45)';
    ctx.fillRect(x, y - bgHeight, width, bgHeight);

    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const maxTextW = Math.max(40, width - padding * 2);
    for (let i = 0; i < recent.length; i++) {
      const msg = recent[i];
      const age = now - (msg.timestamp || now);
      const fade = Math.max(0.25, 1 - age / 3500);
      const msgY = y - bgHeight + padding + i * lineHeight;
      let drawText = msg.text;
      if (ctx.measureText(drawText).width > maxTextW) {
        while (drawText.length > 1 && ctx.measureText(drawText + '…').width > maxTextW) {
          drawText = drawText.slice(0, -1);
        }
        drawText += '…';
      }
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillText(drawText, x + padding + 1, msgY + 1);
      ctx.fillStyle = msg.color || '#c8c8e8';
      ctx.fillText(drawText, x + padding, msgY);
    }

    ctx.restore();
  }

  /**
   * Limpia todos los mensajes
   */
  clear() {
    this.messages = [];
  }
}
