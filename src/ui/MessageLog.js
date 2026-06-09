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
    this.displayCount = 4; // Mensajes visibles en pantalla
    this.fadeTimer = 0;
  }

  /**
   * Añade un mensaje al log
   * @param {string} text - Texto del mensaje
   * @param {string} color - Color del texto (hex)
   */
  add(text, color = COLORS.UI_TEXT) {
    this.messages.push({
      text,
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
    return this.messages.slice(-count);
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

    const lineHeight = 14;
    const padding = 6;
    const bgHeight = recent.length * lineHeight + padding * 2;

    // Fondo semitransparente
    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
    ctx.fillRect(x, y - bgHeight, width, bgHeight);

    // Borde superior sutil
    ctx.strokeStyle = 'rgba(74, 74, 106, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - bgHeight);
    ctx.lineTo(x + width, y - bgHeight);
    ctx.stroke();

    // Dibujar mensajes
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let i = 0; i < recent.length; i++) {
      const msg = recent[i];
      const msgY = y - bgHeight + padding + i * lineHeight;
      
      // Fade basado en posición (más antiguo = más transparente)
      const alpha = 0.5 + (i / recent.length) * 0.5;
      
      // Sombra del texto
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.fillText(msg.text, x + padding + 1, msgY + 1);
      
      // Texto
      ctx.fillStyle = msg.color;
      ctx.globalAlpha = alpha;
      ctx.fillText(msg.text, x + padding, msgY);
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
