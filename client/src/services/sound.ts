// Web Audio API Synthesizer for Telegram/Twine interface sounds & real-time WebRTC calling audio

class SoundService {
  private ctx: AudioContext | null = null;
  private ringtoneInterval: any = null;
  private dialToneInterval: any = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playSent() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      // Audio not permitted or supported
    }
  }

  playReceived() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(600, now);
      osc1.frequency.setValueAtTime(900, now + 0.06);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(750, now);
      osc2.frequency.setValueAtTime(1100, now + 0.06);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.18);
      osc2.stop(now + 0.18);
    } catch {
      // Ignore
    }
  }

  // --- WebRTC Calling Sounds ---

  /**
   * Play a melodious repeating phone ringtone for incoming calls
   */
  startRingtone() {
    this.stopRingtone();
    this.stopDialTone();

    const playRingPattern = () => {
      try {
        const ctx = this.getContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Chime note 1 (C#6 - 1108Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(853, now);
        osc1.frequency.setValueAtTime(960, now + 0.12);
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Chime note 2 (E6 - 1318Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(960, now + 0.2);
        osc2.frequency.setValueAtTime(1209, now + 0.32);
        gain2.gain.setValueAtTime(0.22, now + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.2);
        osc2.stop(now + 0.65);

        // Repeat pulse
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(853, now + 0.8);
        osc3.frequency.setValueAtTime(1209, now + 0.95);
        gain3.gain.setValueAtTime(0.22, now + 0.8);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(now + 0.8);
        osc3.stop(now + 1.3);
      } catch {
        // Ignore audio errors
      }
    };

    playRingPattern();
    this.ringtoneInterval = setInterval(playRingPattern, 2400);
  }

  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  /**
   * Play outgoing ringback dial tone (tuuut... tuuut...)
   */
  startDialTone() {
    this.stopDialTone();
    this.stopRingtone();

    const playDialPattern = () => {
      try {
        const ctx = this.getContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.setValueAtTime(0.08, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.3);
        osc2.stop(now + 1.3);
      } catch {
        // Ignore
      }
    };

    playDialPattern();
    this.dialToneInterval = setInterval(playDialPattern, 3200);
  }

  stopDialTone() {
    if (this.dialToneInterval) {
      clearInterval(this.dialToneInterval);
      this.dialToneInterval = null;
    }
  }

  playCallAccept() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Ignore
    }
  }

  playCallEnd() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.setValueAtTime(320, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Ignore
    }
  }

  /**
   * Generates a rich, audible voice audio clip as a base64 WAV data URI for voice message playback
   */
  generateVoiceSampleWav(durationSeconds: number = 3): string {
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * Math.max(1, durationSeconds));
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (v: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        v.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeStr(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(view, 8, 'WAVE');

    // fmt sub-chunk
    writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);

    // data sub-chunk
    writeStr(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true);

    // Harmonic vocal progression
    const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.floor((t / durationSeconds) * notes.length) % notes.length;
      const f0 = notes[noteIdx];

      const voice1 = Math.sin(2 * Math.PI * f0 * t);
      const voice2 = 0.5 * Math.sin(2 * Math.PI * f0 * 2 * t);
      const voice3 = 0.25 * Math.sin(2 * Math.PI * f0 * 3 * t);
      const voiceWarmth = (voice1 + voice2 + voice3) / 1.75;

      const syllableEnv = 0.6 + 0.4 * Math.sin(2 * Math.PI * 3.5 * t);
      const sample = Math.max(-1, Math.min(1, voiceWarmth * syllableEnv * 0.4));

      view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  }
}

export const sounds = new SoundService();
