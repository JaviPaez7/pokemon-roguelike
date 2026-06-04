/**
 * ParticleSystem.js
 * 
 * Sistema de partículas ligero para el juego.
 * Gestiona y dibuja partículas para ataques, capturas y otras acciones.
 */

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  /**
   * Genera partículas para un efecto específico.
   * @param {number} x - Posición X en el mundo (tiles)
   * @param {number} y - Posición Y en el mundo (tiles)
   * @param {string} type - Tipo de partícula ('hit', 'capture', 'heal', 'dust')
   * @param {string} color - Color de la partícula
   * @param {number} count - Cantidad de partículas a generar
   */
  spawn(x, y, type, color = '#ffffff', count = 10) {
    const time = performance.now();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 1;
      const life = Math.random() * 300 + 200; // 200ms - 500ms

      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed;
      
      if (type === 'heal') {
        vy = -Math.abs(vy); // Hacia arriba
      }

      this.particles.push({
        x: x, // Coordenadas del mundo (tiles, se ajustarán a píxeles al dibujar)
        y: y,
        vx,
        vy,
        color,
        life,
        maxLife: life,
        spawnTime: time,
        type
      });
    }
  }

  /**
   * Actualiza el estado de las partículas (movimiento y tiempo de vida).
   * @param {number} now - Tiempo actual
   */
  update(now) {
    this.particles = this.particles.filter(p => now - p.spawnTime < p.maxLife);
    for (const p of this.particles) {
      const dt = 16 / 1000; // Asumiendo ~60fps
      p.x += (p.vx * dt);
      p.y += (p.vy * dt);
      if (p.type === 'hit') {
        p.vy += 5 * dt; // Gravedad
      } else if (p.type === 'heal') {
        p.vy -= 2 * dt; // Sube
      }
    }
  }

  /**
   * Dibuja las partículas activas
   * @param {CanvasRenderingContext2D} ctx 
   * @param {import('./Camera.js').Camera} camera 
   */
  render(ctx, camera) {
    if (this.particles.length === 0) return;

    const now = performance.now();
    const tileSize = camera.tileSize;

    for (const p of this.particles) {
      const age = now - p.spawnTime;
      const progress = age / p.maxLife;
      const alpha = 1 - progress;

      // Calcular posición en pantalla
      const screenPos = camera.worldToScreen(p.x, p.y);
      const sx = screenPos.x + tileSize / 2;
      const sy = screenPos.y + tileSize / 2;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'hit') {
        // Estrella o cuadrado
        ctx.translate(sx, sy);
        ctx.rotate(progress * Math.PI * 4);
        ctx.fillRect(-2, -2, 4, 4);
      } else if (p.type === 'heal') {
        // Cruz pequeña
        ctx.translate(sx, sy);
        ctx.fillRect(-1, -3, 2, 6);
        ctx.fillRect(-3, -1, 6, 2);
      } else {
        // Círculo
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }
}
