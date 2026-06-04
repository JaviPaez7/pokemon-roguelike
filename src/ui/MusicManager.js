/**
 * MusicManager.js
 * 
 * Generador procedural de música chiptune usando Web Audio API.
 * Crea diferentes ambientes sonoros basados en la zona actual.
 */

export class MusicManager {
  constructor() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 0.3; // Volumen por defecto
    this.masterGain.connect(this.audioCtx.destination);
    
    this.isPlaying = false;
    this.currentZone = null;
    this.intervalId = null;
    this.beat = 0;
    this.tempo = 120; // BPM
    
    // Escalas musicales (MIDI notes)
    this.scales = {
      'c_major': [60, 62, 64, 65, 67, 69, 71, 72],
      'a_minor': [57, 59, 60, 62, 64, 65, 67, 69],
      'd_dorian': [62, 64, 65, 67, 69, 71, 72, 74],
      'e_phrygian': [64, 65, 67, 69, 71, 72, 74, 76]
    };
    
    // Configuración por zona
    this.zones = {
      'Llanura de Inicio': { scale: 'c_major', tempo: 110, waveform: 'square', octave: 0 },
      'Bosque Sombrío': { scale: 'a_minor', tempo: 90, waveform: 'triangle', octave: -1 },
      'Cueva Oscura': { scale: 'e_phrygian', tempo: 80, waveform: 'sine', octave: -1 },
      'default': { scale: 'c_major', tempo: 120, waveform: 'square', octave: 0 }
    };
  }

  /**
   * Inicia o cambia la música para una zona.
   * @param {string} zoneName 
   */
  playZone(zoneName) {
    if (this.currentZone === zoneName && this.isPlaying) return;
    
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    
    this.stop();
    this.currentZone = zoneName;
    this.isPlaying = true;
    
    const config = this.zones[zoneName] || this.zones['default'];
    this.tempo = config.tempo;
    const msPerBeat = 60000 / this.tempo;
    
    this.intervalId = setInterval(() => {
      this._playBeat(config);
      this.beat++;
    }, msPerBeat / 2); // Corcheas (1/8 notes)
  }

  stop() {
    this.isPlaying = false;
    this.beat = 0;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setVolume(vol) {
    this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
  }

  _playBeat(config) {
    const scale = this.scales[config.scale];
    
    // Melodía aleatoria dentro de la escala
    if (Math.random() > 0.3) {
      const noteIndex = Math.floor(Math.random() * scale.length);
      const note = scale[noteIndex] + (config.octave * 12);
      this._playTone(this._midiToFreq(note), config.waveform, 0.1);
    }
    
    // Bajo (cada tiempo fuerte)
    if (this.beat % 2 === 0) {
      const bassNote = scale[0] - 12 + (config.octave * 12);
      this._playTone(this._midiToFreq(bassNote), 'triangle', 0.2, 0.3);
    }
  }

  _midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

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
