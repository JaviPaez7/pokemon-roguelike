/**
 * MusicManager.js
 *
 * Música chiptune sintetizada con Web Audio API. Toca el tema que se le pide
 * (`playTheme`) con los parámetros de data/music.json: escala, tempo, forma de
 * onda, octava y, si los tiene, patrones de melodía y bajo. Qué tema toca en
 * cada lugar no lo decide aquí: lo elige core/MusicSelect.js.
 *
 * Los navegadores no dejan sonar audio hasta que la página recibe una
 * interacción. Por eso el contexto de audio se crea con la primera tecla o
 * pulsación (y se reanuda con la siguiente si el navegador lo suspende). Hasta
 * entonces el tema elegido queda apuntado y no se programan notas, que se
 * acumularían y sonarían todas de golpe.
 */

import { themeConfig, validTheme, scaleNotes, noteForDegree, patternStep } from '../core/MusicSelect.js';

/** Eventos que el navegador acepta como interacción para arrancar el audio. */
const UNLOCK_EVENTS = ['keydown', 'mousedown', 'pointerup', 'touchend'];

export class MusicManager {
  constructor() {
    /** @type {AudioContext | null} Se crea con la primera interacción */
    this.audioCtx = null;
    /**
     * Volumen general (lo leen y cambian las opciones). Hasta que existe el
     * contexto de audio solo guarda el valor.
     * @type {GainNode | { gain: { value: number } }}
     */
    this.masterGain = { gain: { value: 0.3 } };

    this.isPlaying = false;
    /** @type {string | null} Tema que suena (o que sonará en cuanto haya audio) */
    this.currentTheme = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.intervalId = null;
    /** Corchea del tema por la que va. */
    this.step = 0;

    this._listenForUnlock();
  }

  /**
   * Toca un tema de data/music.json. Si ya está sonando, no lo reinicia; si
   * no existe, suena el de por defecto.
   * @param {string} themeId
   */
  playTheme(themeId) {
    const id = validTheme(themeId);
    if (this.currentTheme === id && this.isPlaying) return;

    this.stop();
    const theme = themeConfig(id);
    this.currentTheme = id;
    this.isPlaying = true;

    const msPerStep = 60000 / theme.tempo / 2; // Corcheas
    this.intervalId = setInterval(() => this._playStep(theme), msPerStep);
  }

  stop() {
    this.isPlaying = false;
    this.step = 0;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** @param {number} vol - De 0 a 1 */
  setVolume(vol) {
    this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
  }

  /** Arranca el audio con cada interacción mientras no esté sonando. */
  _listenForUnlock() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, () => this._unlock(), true);
  }

  /** Crea el contexto de audio o, si el navegador lo ha suspendido, lo reanuda. */
  _unlock() {
    if (!this.audioCtx) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return; // Sin Web Audio: el juego sigue en silencio
        const ctx = new Ctx();
        const gain = ctx.createGain();
        gain.gain.value = this.masterGain.gain.value;
        gain.connect(ctx.destination);
        this.audioCtx = ctx;
        this.masterGain = gain;
      } catch (e) {
        return;
      }
    }
    if (this.audioCtx.state !== 'running') {
      try {
        Promise.resolve(this.audioCtx.resume()).catch(() => {});
      } catch (e) {
        // Navegadores sin resume(): nada que hacer
      }
    }
  }

  /**
   * Una corchea: la nota de la melodía y la del bajo, si tocan.
   * @param {import('../core/MusicSelect.js').Theme} theme
   */
  _playStep(theme) {
    // Sin audio no avanza: el tema empieza por el principio cuando suene
    if (this.audioCtx?.state !== 'running') return;
    const scale = scaleNotes(theme.scale);
    const shift = (theme.octave ?? 0) * 12;

    // Melodía: el patrón (con alguna nota movida si el tema tiene `variation`)
    // o, sin patrón, notas al azar de la escala
    let degree = patternStep(theme.melody, this.step);
    if (degree === undefined) {
      degree = Math.random() < (theme.density ?? 0.7) ? Math.floor(Math.random() * (scale.length + 1)) : null;
    } else if (degree !== null && theme.variation && Math.random() < theme.variation) {
      degree += Math.random() < 0.5 ? -1 : 1;
    }
    if (degree !== null) {
      this._playTone(this._midiToFreq(noteForDegree(scale, degree) + shift), theme.waveform, theme.noteLength ?? 0.1);
    }

    // Bajo: el patrón o, sin patrón, la tónica en cada tiempo fuerte
    let bass = patternStep(theme.bass, this.step);
    if (bass === undefined) bass = this.step % 2 === 0 ? 0 : null;
    if (bass !== null) {
      this._playTone(this._midiToFreq(noteForDegree(scale, bass) - 12 + shift), 'triangle', 0.2, 0.3);
    }
    this.step++;
  }

  /** @param {number} midi @returns {number} Hz */
  _midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * @param {number} freq - Hz
   * @param {OscillatorType} type
   * @param {number} duration - Segundos
   * @param {number} [vol]
   */
  _playTone(freq, type, duration, vol = 0.5) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

    gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioCtx.currentTime + duration);
  }
}
