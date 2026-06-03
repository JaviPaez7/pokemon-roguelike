/**
 * main.js
 * 
 * Entry point principal del juego.
 * Obtiene el canvas, instancia la clase principal `Game` e inicia el bucle.
 */

import './style.css';
import { Game } from './core/Game.js';

window.addEventListener('DOMContentLoaded', async () => {
  console.log('[Main] Arrancando juego...');
  
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('[Main] No se encontró el elemento #game-canvas en el DOM.');
    return;
  }

  // Instanciar la máquina de estados y núcleo del juego
  const game = new Game(canvas);
  
  try {
    // Cargar datos estáticos e inicializar variables del juego
    await game.init();
    
    // Iniciar loop de renderizado asíncrono
    game.start();
    
    console.log('[Main] Juego iniciado y corriendo.');
  } catch (error) {
    console.error('[Main] Falló la inicialización del juego:', error);
  }
});
