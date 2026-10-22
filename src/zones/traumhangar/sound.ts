/**
 * The hangar's sounds (R3 §5.8): the dream swell (reversed noise rising 0.4 s), the ghost hum (a
 * detuned sine pair while Space is held, an octave down: the hangar „goes slow“), the reality snap
 * (a click and a low thump on release), the slip foley (a scuff and a thud), robot footsteps and the
 * wake-up of a robot rising from its dock. Procedural, on the zone's bus (full ≤ 20 m, silent ≥ 60 m).
 */
import type { Vec3Input, ZoneContext } from '@/core/zones';

export interface HangarSound {
  swell(): void;
  hum(on: boolean): void;
  snap(): void;
  slip(at?: Vec3Input): void;
  thud(at?: Vec3Input): void;
  step(at: Vec3Input, heavy: number): void;
  wake(at: Vec3Input): void;
  ok(): void;
  dispose(): void;
}

export function createHangarSound(ctx: ZoneContext): HangarSound {
  let ac: AudioContext | null = null;
  let bus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let humNodes: { o1: OscillatorNode; o2: OscillatorNode; g: GainNode } | null = null;

  const ensure = (): boolean => {
    if (ac) return true;
    const c = ctx.audio.context;
    const b = ctx.audio.zoneBus;
    if (!c || !b) return false;
    ac = c;
    bus = c.createGain();
    bus.gain.value = 0.9;
    bus.connect(b);
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  };

  const burst = (o: { dur: number; freq: number; q: number; vol: number; reverse?: boolean; type?: BiquadFilterType }): void => {
    if (!ensure()) return;
    const c = ac!;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.value = o.freq;
    f.Q.value = o.q;
    const g = c.createGain();
    if (o.reverse) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol, t + o.dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur + 0.05);
      f.frequency.setValueAtTime(o.freq * 0.5, t);
      f.frequency.exponentialRampToValueAtTime(o.freq * 2, t + o.dur);
    } else {
      g.gain.setValueAtTime(o.vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    }
    src.connect(f).connect(g).connect(bus!);
    src.start(t);
    src.stop(t + o.dur + 0.1);
  };

  return {
    swell() {
      burst({ dur: 0.4, freq: 900, q: 1.2, vol: 0.32, reverse: true });
      ctx.audio.tone({ freq: 196, to: 98, dur: 0.45, type: 'sine', volume: 0.18 });
    },
    hum(on) {
      if (!ensure()) return;
      const c = ac!;
      const t = c.currentTime;
      if (on && !humNodes) {
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
        const o1 = c.createOscillator();
        const o2 = c.createOscillator();
        o1.type = o2.type = 'sine';
        o1.frequency.value = 110;
        o2.frequency.value = 110 * 1.012;
        o1.connect(g);
        o2.connect(g);
        g.connect(bus!);
        o1.start(t);
        o2.start(t);
        humNodes = { o1, o2, g };
      } else if (!on && humNodes) {
        const h = humNodes;
        humNodes = null;
        h.g.gain.setTargetAtTime(0.0001, t, 0.08);
        h.o1.stop(t + 0.5);
        h.o2.stop(t + 0.5);
      }
    },
    snap() {
      burst({ dur: 0.04, freq: 3200, q: 2, vol: 0.4 });
      ctx.audio.tone({ freq: 70, to: 45, dur: 0.18, type: 'sine', volume: 0.45 });
    },
    slip(at) {
      burst({ dur: 0.35, freq: 1500, q: 0.8, vol: 0.28, type: 'highpass' });
      ctx.audio.play('drop', { volume: 0.5, pitch: 1.3, at });
    },
    thud(at) {
      ctx.audio.tone({ freq: 60, to: 38, dur: 0.3, type: 'sine', volume: 0.55, at });
      ctx.audio.play('thud', { volume: 0.6, pitch: 0.8, at });
    },
    step(at, heavy) {
      ctx.audio.play('land', { volume: 0.12 + heavy * 0.1, pitch: 1.5 - heavy * 0.4, at });
    },
    wake(at) {
      ctx.audio.tone({ freq: 220, to: 440, dur: 0.6, type: 'triangle', volume: 0.22, at });
      ctx.audio.play('whoosh', { volume: 0.25, pitch: 0.6, at });
    },
    ok() {
      ctx.audio.tone({ freq: 660, to: 880, dur: 0.18, type: 'sine', volume: 0.25 });
    },
    dispose() {
      try {
        humNodes?.o1.stop();
        humNodes?.o2.stop();
      } catch {
        /* stopped */
      }
      humNodes = null;
      bus?.disconnect();
    },
  };
}
