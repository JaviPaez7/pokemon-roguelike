/**
 * SpriteManager.js
 * 
 * Gestor de sprites para cargar, cachear y dibujar imágenes de Pokémon
 * y otros elementos visuales del juego.
 * 
 * Características:
 * - Carga asíncrona de imágenes con Promesas
 * - Caché interno para evitar cargas duplicadas
 * - Placeholder automático cuando un sprite no está disponible
 * - Pre-carga masiva para los Pokémon de un piso
 */

/** Colores para los placeholders según el tipo de entidad */
const COLORES_PLACEHOLDER = [
  '#e74c3c', // rojo
  '#3498db', // azul
  '#2ecc71', // verde
  '#f39c12', // naranja
  '#9b59b6', // púrpura
  '#1abc9c', // turquesa
  '#e67e22', // mandarina
  '#e91e63', // rosa
];

export class SpriteManager {
  /**
   * Crea un nuevo gestor de sprites.
   */
  constructor() {
    /**
     * Caché de imágenes cargadas.
     * Clave: URL del sprite, Valor: HTMLImageElement
     * @type {Map<string, HTMLImageElement>}
     */
    this._cache = new Map();

    /**
     * Promesas de carga en progreso para evitar cargas duplicadas.
     * @type {Map<string, Promise<HTMLImageElement>>}
     */
    this._loading = new Map();
  }

  /**
   * Carga un sprite desde una URL de forma asíncrona.
   * Si el sprite ya está en caché, lo devuelve inmediatamente.
   * Si ya se está cargando, devuelve la misma promesa.
   * 
   * @param {string} url - URL de la imagen a cargar
   * @returns {Promise<HTMLImageElement>} Promesa que resuelve con la imagen cargada
   */
  loadSprite(url) {
    // Verificar si ya está en caché
    if (this._cache.has(url)) {
      return Promise.resolve(this._cache.get(url));
    }

    // Verificar si ya se está cargando (evitar carga duplicada)
    if (this._loading.has(url)) {
      return this._loading.get(url);
    }

    // Crear nueva promesa de carga
    const promesaCarga = new Promise((resolve, reject) => {
      const imagen = new Image();
      
      imagen.onload = () => {
        // Almacenar en caché y limpiar la promesa de carga
        this._cache.set(url, imagen);
        this._loading.delete(url);
        resolve(imagen);
      };

      imagen.onerror = (error) => {
        // Registrar el error pero no bloquear - se usará placeholder
        console.warn(`[SpriteManager] Error cargando sprite: ${url}`, error);
        this._loading.delete(url);
        // Resolver con null en vez de rechazar para manejar graciosamente
        resolve(null);
      };

      // Iniciar la carga
      imagen.src = url;
    });

    // Guardar la promesa para evitar cargas duplicadas
    this._loading.set(url, promesaCarga);
    return promesaCarga;
  }

  /**
   * Obtiene un sprite del caché de forma síncrona.
   * Devuelve null si el sprite no se ha cargado todavía.
   * 
   * @param {string} url - URL del sprite a obtener
   * @returns {HTMLImageElement|null} La imagen cargada o null
   */
  getSprite(url) {
    return this._cache.get(url) || null;
  }

  /**
   * Pre-carga los sprites de todos los Pokémon de un piso.
   * Esto evita parpadeos durante el juego al tener todo en caché.
   * 
   * @param {Array<{spriteUrl: string}>} pokemonList - Lista de Pokémon con sus URLs de sprite
   * @returns {Promise<void>} Promesa que resuelve cuando todos los sprites están cargados
   */
  async preloadFloor(pokemonList) {
    const promesas = pokemonList
      .filter(pokemon => pokemon.spriteUrl) // Solo los que tienen URL
      .map(pokemon => this.loadSprite(pokemon.spriteUrl));

    // Esperar a que todos se carguen (o fallen graciosamente)
    await Promise.all(promesas);
    console.log(`[SpriteManager] Pre-cargados ${promesas.length} sprites para el piso`);
  }

  /**
   * Dibuja un sprite en el canvas, o un placeholder si no está disponible.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {string} url - URL del sprite a dibujar
   * @param {number} x - Posición X en píxeles
   * @param {number} y - Posición Y en píxeles
   * @param {number} width - Ancho en píxeles
   * @param {number} height - Alto en píxeles
   * @param {string} [nombre='?'] - Nombre para el placeholder (se usa la primera letra)
   */
  drawSprite(ctx, url, x, y, width, height, nombre = '?') {
    const sprite = this.getSprite(url);

    if (sprite) {
      // Dibujar el sprite real
      ctx.drawImage(sprite, x, y, width, height);
    } else {
      // Dibujar placeholder: círculo coloreado con la primera letra
      this._drawPlaceholder(ctx, x, y, width, height, nombre);

      // Intentar cargar el sprite para la próxima vez que se dibuje
      if (url && !this._loading.has(url)) {
        this.loadSprite(url).then(() => {
          if (window.game) {
            window.game.needsRender = true;
          }
        });
      }
    }
  }

  /**
   * Dibuja un placeholder cuando el sprite no está disponible.
   * Es un círculo coloreado con la primera letra del nombre.
   * 
   * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
   * @param {number} x - Posición X en píxeles
   * @param {number} y - Posición Y en píxeles
   * @param {number} width - Ancho en píxeles
   * @param {number} height - Alto en píxeles
   * @param {string} nombre - Nombre para obtener color e inicial
   * @private
   */
  _drawPlaceholder(ctx, x, y, width, height, nombre) {
    const centroX = x + width / 2;
    const centroY = y + height / 2;
    const radio = Math.min(width, height) / 2.5;

    // Elegir color basado en el nombre (determinístico)
    const indiceColor = nombre.charCodeAt(0) % COLORES_PLACEHOLDER.length;
    const color = COLORES_PLACEHOLDER[indiceColor];

    // Dibujar círculo de fondo
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(centroX, centroY, radio, 0, Math.PI * 2);
    ctx.fill();

    // Borde más oscuro
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Dibujar la inicial del nombre
    const inicial = nombre.charAt(0).toUpperCase();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(height * 0.4)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(inicial, centroX, centroY);
  }
}
