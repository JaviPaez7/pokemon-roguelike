/** Efectos de sonido chiptune con Web Audio API. */
export class SfxManager {
  /** @type {AudioContext|null} */
  _audioCtx = null;
  /** @type {GainNode|null} */
  _masterGain = null;
  /** @type {number} */
  _volume = 0.5;

  _getAudioContext() {
    try {
      if (!this._audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        this._audioCtx = new Ctx();
        this._masterGain = this._audioCtx.createGain();
        this._masterGain.gain.value = this._volume;
        this._masterGain.connect(this._audioCtx.destination);
      }
      if (this._audioCtx.state === 'suspended') {
        this._audioCtx.resume();
      }
      return { ctx: this._audioCtx, master: this._masterGain };
    } catch (e) {
      return null;
    }
  }

  setVolume(vol) {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this._masterGain) {
      this._masterGain.gain.value = this._volume;
    }
  }

  _playTone(freq, startTime, duration, waveform = 'square', volume = 0.03) {
    const audioEnv = this._getAudioContext();
    if (!audioEnv) return;
    const { ctx, master } = audioEnv;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveform;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  playMenuSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(880, t, 0.025, 'square', 0.015);
      this._playTone(660, t + 0.02, 0.02, 'square', 0.01);
    } catch (e) {}
  }

  playConfirmSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(523, t, 0.06, 'square', 0.025);
      this._playTone(659, t + 0.06, 0.08, 'square', 0.025);
    } catch (e) {}
  }

  playCancelSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(392, t, 0.05, 'triangle', 0.02);
      this._playTone(262, t + 0.05, 0.06, 'triangle', 0.015);
    } catch (e) {}
  }

  playDamageSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx, master } = audioEnv;
      const t = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(80, t + 0.15);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(t);
      source.stop(t + 0.2);
    } catch (e) {}
  }

  playLevelUpSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        this._playTone(freq, t + i * 0.1, 0.12, 'square', 0.02);
      });
    } catch (e) {}
  }

  playCaptureShakeSound(shakeIndex) {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx, master } = audioEnv;
      const t = ctx.currentTime;
      const freq = 440 + shakeIndex * 80;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq + 60, t + 0.3);
      gain.gain.setValueAtTime(0.025, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.35);
    } catch (e) {}
  }

  playHealSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(440, t, 0.1, 'sine', 0.03);
      this._playTone(554, t + 0.1, 0.1, 'sine', 0.03);
      this._playTone(659, t + 0.2, 0.2, 'sine', 0.03);
    } catch (e) {}
  }

  playCaptureSuccessSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(523, t, 0.1, 'square', 0.03);
      this._playTone(659, t + 0.1, 0.1, 'square', 0.03);
      this._playTone(784, t + 0.2, 0.3, 'square', 0.03);
    } catch (e) {}
  }

  playCaptureEscapeSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(300, t, 0.15, 'sawtooth', 0.03);
      this._playTone(250, t + 0.15, 0.2, 'sawtooth', 0.03);
    } catch (e) {}
  }

  playStatUpSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        this._playTone(400 + i * 100, t + i * 0.05, 0.05, 'square', 0.02);
      }
    } catch (e) {}
  }

  playStatDownSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        this._playTone(800 - i * 100, t + i * 0.05, 0.05, 'sawtooth', 0.02);
      }
    } catch (e) {}
  }

  playMissSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(200, t, 0.1, 'sine', 0.02);
      this._playTone(180, t + 0.1, 0.15, 'sine', 0.02);
    } catch (e) {}
  }

  playStatusEffectSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(600, t, 0.05, 'square', 0.02);
      this._playTone(400, t + 0.1, 0.05, 'square', 0.02);
      this._playTone(600, t + 0.2, 0.05, 'square', 0.02);
    } catch (e) {}
  }

  playStairsSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        this._playTone(300 - i * 20, t + i * 0.08, 0.08, 'triangle', 0.02);
      }
    } catch (e) {}
  }

  playItemPickupSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(880, t, 0.05, 'sine', 0.02);
      this._playTone(1108, t + 0.05, 0.1, 'sine', 0.02);
    } catch (e) {}
  }

  playFaintSound() {
    try {
      const audioEnv = this._getAudioContext();
      if (!audioEnv) return;
      const { ctx } = audioEnv;
      const t = ctx.currentTime;
      this._playTone(200, t, 0.2, 'sawtooth', 0.03);
      this._playTone(150, t + 0.2, 0.2, 'sawtooth', 0.03);
      this._playTone(100, t + 0.4, 0.4, 'sawtooth', 0.03);
    } catch (e) {}
  }
}
