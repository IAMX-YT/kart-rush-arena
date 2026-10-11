// Procedural Web Audio synthesizer for Power Wash Simulator 2
export class WashAudio {
  ctx: AudioContext | null = null;
  motorGain: GainNode | null = null;
  sprayGain: GainNode | null = null;
  sprayFilter: BiquadFilterNode | null = null;
  noiseNode: AudioBufferSourceNode | null = null;
  enabled: boolean = false;

  constructor() {}

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Create continuous noise buffer for spray
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = noiseBuffer;
      this.noiseNode.loop = true;

      // Spray filter
      this.sprayFilter = this.ctx.createBiquadFilter();
      this.sprayFilter.type = 'bandpass';
      this.sprayFilter.frequency.value = 2400;
      this.sprayFilter.Q.value = 1.2;

      this.sprayGain = this.ctx.createGain();
      this.sprayGain.gain.value = 0;

      this.noiseNode.connect(this.sprayFilter);
      this.sprayFilter.connect(this.sprayGain);
      this.sprayGain.connect(this.ctx.destination);
      this.noiseNode.start(0);

      // Motor drone oscillator
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 75; // Low 75Hz engine idle hum

      this.motorGain = this.ctx.createGain();
      this.motorGain.gain.value = 0;

      osc.connect(this.motorGain);
      this.motorGain.connect(this.ctx.destination);
      osc.start(0);
    } catch {
      // AudioContext not allowed until user gesture
    }
  }

  toggle() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.enabled = !this.enabled;
    if (!this.enabled) {
      if (this.motorGain) this.motorGain.gain.value = 0;
      if (this.sprayGain) this.sprayGain.gain.value = 0;
    }
    return this.enabled;
  }

  update(spraying: boolean, nozzle: number) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Motor hum revs up when spraying
    if (this.motorGain) {
      const targetMotorGain = spraying ? 0.05 : 0.015;
      this.motorGain.gain.setTargetAtTime(targetMotorGain, now, 0.05);
    }

    // Spray water sound
    if (this.sprayGain && this.sprayFilter) {
      const targetSprayGain = spraying ? (nozzle === 3 ? 0.07 : 0.06) : 0;
      this.sprayGain.gain.setTargetAtTime(targetSprayGain, now, 0.04);

      // Adjust frequency profile based on nozzle
      const freqs = [3800, 2600, 1800, 1100]; // 0 pinpoint is high hiss, 3 soap is deep rushing foam
      this.sprayFilter.frequency.setTargetAtTime(freqs[nozzle] || 2400, now, 0.05);
    }
  }

  playObjectComplete() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Cheerful 3-note ascending chime (C6, E6, G6)
    const notes = [1046.5, 1318.51, 1567.98];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + idx * 0.08;
      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  playJobVictory() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Fanfare chords
    const chord1 = [523.25, 659.25, 783.99]; // C5, E5, G5
    const chord2 = [587.33, 739.99, 880.0];  // D5, F#5, A5
    const chord3 = [783.99, 987.77, 1046.5]; // G5, B5, C6

    const playChord = (chord: number[], time: number, dur: number) => {
      chord.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + dur + 0.05);
      });
    };

    playChord(chord1, now, 0.25);
    playChord(chord2, now + 0.28, 0.25);
    playChord(chord3, now + 0.58, 0.85);
  }

  playSonarPulse() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playNozzleClick() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1400;
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  dispose() {
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
    this.ctx = null;
  }
}
