/** Efectos de sonido chiptune con Web Audio API. */
export class SfxManager {
  /** @type {AudioContext|null} */
  _audioCtx = null;

  _getAudioContext() {
    try {
      if (!this._audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        this._audioCtx = new Ctx();
      }
      if (this._audioCtx.state === 'suspended') {
        this._audioCtx.resume();
      }
      return this._audioCtx;
    } catch (e) {
      return null;
    }
  }

  _playTone(freq, startTime, duration, waveform = 'square', volume = 0.03) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveform;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  playMenuSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._playTone(880, t, 0.025, 'square', 0.015);
      this._playTone(660, t + 0.02, 0.02, 'square', 0.01);
    } catch (e) {}
  }

  playConfirmSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._playTone(523, t, 0.06, 'square', 0.025);
      this._playTone(659, t + 0.06, 0.08, 'square', 0.025);
    } catch (e) {}
  }

  playCancelSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      this._playTone(392, t, 0.05, 'triangle', 0.02);
      this._playTone(262, t + 0.05, 0.06, 'triangle', 0.015);
    } catch (e) {}
  }

  playDamageSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
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
      gain.connect(ctx.destination);
      source.start(t);
      source.stop(t + 0.2);
    } catch (e) {}
  }

  playLevelUpSound() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        this._playTone(freq, t + i * 0.1, 0.12, 'square', 0.02);
      });
    } catch (e) {}
  }

  playCaptureShakeSound(shakeIndex) {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
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
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    } catch (e) {}
  }
}
