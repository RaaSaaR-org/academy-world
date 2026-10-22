/**
 * Lern-Dojo procedural sounds (GDD §7.4 "Sound"), built on ctx.audio.zoneBus so they fade
 * with distance. Every node is short-lived; nothing allocates per frame.
 */
import type { Vec3Input, ZoneContext } from '@/core/zones';

export interface DojoSounds {
  /** record beep: two short 1.2 kHz pips */
  recBeep(at?: Vec3Input): void;
  /** ribbon shimmer: quiet high noise */
  shimmer(): void;
  /** training hum: rising filtered saw (seconds) */
  trainHum(seconds?: number): void;
  /** success chime: a fifth */
  chime(): void;
  /** failure: low descending */
  failure(): void;
  /** wall hover tick */
  tick(): void;
  /** filter whoosh */
  whoosh(): void;
  /** the game puts cubes in place: a soft wooden tock */
  place(): void;
  /** the jaws: a servo click, higher when they close */
  jaw(closing: boolean): void;
  /** a cube lands in the Kiste: a hollow clack (louder the harder) */
  clack(strength?: number): void;
}

export function createSounds(ctx: ZoneContext): DojoSounds {
  let noise: AudioBuffer | null = null;
  const noiseBuffer = (ac: AudioContext): AudioBuffer => {
    if (noise) return noise;
    const len = Math.floor(ac.sampleRate * 0.8);
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    return noise;
  };
  const env = (ac: AudioContext, bus: AudioNode, peak: number, attack: number, decay: number, t0 = ac.currentTime): GainNode => {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    g.connect(bus);
    return g;
  };
  const sine = (ac: AudioContext, out: AudioNode, f: number, t0: number, dur: number, type: OscillatorType = 'sine'): void => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };

  return {
    recBeep(at) {
      ctx.audio.beep(1200, 0.05, { volume: 0.5, at });
      ctx.after(0.09, () => ctx.audio.beep(1200, 0.05, { volume: 0.5, at }));
    },
    shimmer() {
      const ac = ctx.audio.context,
        bus = ctx.audio.zoneBus;
      if (!ac || !bus) return;
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac);
      const hp = ac.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(5200, t);
      hp.frequency.exponentialRampToValueAtTime(9000, t + 0.7);
      hp.Q.value = 3;
      src.connect(hp).connect(env(ac, bus, 0.05, 0.12, 0.6, t));
      src.start(t);
      src.stop(t + 0.8);
    },
    trainHum(seconds = 2) {
      const ac = ctx.audio.context,
        bus = ctx.audio.zoneBus;
      if (!ac || !bus) return;
      const t = ac.currentTime;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      // measured (audioMeter, at the desk): 0.09 peaked at −9 dBFS / RMS −24 — louder than a stamp;
      // 0.045 with a softer resonance sits with the other cues (≈ −15 dBFS peak)
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.25);
      g.gain.setValueAtTime(0.045, t + seconds - 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      g.connect(bus);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 4;
      lp.frequency.setValueAtTime(220, t);
      lp.frequency.exponentialRampToValueAtTime(2400, t + seconds);
      lp.connect(g);
      for (const [f0, f1] of [
        [82, 164],
        [82.6, 165.4],
      ]) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + seconds);
        o.connect(lp);
        o.start(t);
        o.stop(t + seconds + 0.05);
      }
    },
    chime() {
      const ac = ctx.audio.context,
        bus = ctx.audio.zoneBus;
      if (!ac || !bus) return;
      const t = ac.currentTime;
      // a perfect fifth: 660 Hz then 990 Hz, soft bell envelope
      sine(ac, env(ac, bus, 0.12, 0.01, 0.9, t), 660, t, 1);
      sine(ac, env(ac, bus, 0.1, 0.01, 1.1, t + 0.11), 990, t + 0.11, 1.2);
    },
    failure() {
      const ac = ctx.audio.context,
        bus = ctx.audio.zoneBus;
      if (!ac || !bus) return;
      const t = ac.currentTime;
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(240, t);
      o.frequency.exponentialRampToValueAtTime(96, t + 0.7);
      o.connect(env(ac, bus, 0.14, 0.02, 0.75, t));
      o.start(t);
      o.stop(t + 0.85);
    },
    tick() {
      ctx.audio.beep(2600, 0.012, { volume: 0.18 });
    },
    whoosh() {
      ctx.audio.play('whoosh', { volume: 0.5 });
    },
    place() {
      ctx.audio.tone({ freq: 520, to: 380, dur: 0.06, type: 'triangle', volume: 0.18 });
    },
    jaw(closing) {
      ctx.audio.tone({ freq: closing ? 1500 : 1100, to: closing ? 900 : 1300, dur: 0.05, type: 'square', volume: 0.08 });
    },
    clack(strength = 1) {
      const ac = ctx.audio.context,
        bus = ctx.audio.zoneBus;
      if (!ac || !bus) return;
      const t = ac.currentTime;
      // a short noise burst through a box-like resonance (≈ 900 Hz) plus a low knock
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 6;
      const v = 0.12 * Math.max(0.3, Math.min(1, strength));
      src.connect(bp).connect(env(ac, bus, v, 0.002, 0.12, t));
      src.start(t);
      src.stop(t + 0.16);
      sine(ac, env(ac, bus, v * 0.8, 0.002, 0.09, t), 180, t, 0.1, 'triangle');
    },
  };
}
