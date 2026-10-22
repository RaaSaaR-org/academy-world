/**
 * Procedural WebAudio for the Dunkelfabrik (GDD §7.5 Sound). Everything is built lazily on the
 * zone bus (distance-attenuated by the engine) once the AudioContext exists; every call is a
 * no-op before that. A procedural hall impulse response gives the large-hall reverb.
 *
 * furnace roar · conveyor clacks · crate thud · breathing (0.4 → 0.8 Hz) · heartbeat ·
 * flip-dot clatter · beam creak + tipping clunk · relay clunks · dark-hall drone ·
 * RtI two-tone · MRC hiss
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';

export interface Sound {
  update(dt: number): void;
  /** breathing: effort 0…1 (resting 0.4 Hz → loaded 0.8 Hz); 0 = silent */
  setBreath(effort: number): void;
  /** heartbeat bpm, 0 = off */
  setHeart(bpm: number): void;
  /** furnace roar level 0…1 (positional at the mouth) */
  setFurnace(level: number): void;
  setDrone(on: boolean): void;
  thud(at?: THREE.Vector3Like, vol?: number): void;
  lift(): void;
  flip(n?: number): void;
  creak(): void;
  clunk(): void;
  relay(i: number): void;
  rti(): void;
  mrc(): void;
  clack(): void;
  dispose(): void;
}

export function createSound(ctx: ZoneContext, furnaceLocal: THREE.Vector3Like): Sound {
  let ac: AudioContext | null = null;
  let bus: GainNode | null = null;
  let dry: GainNode | null = null;
  let wet: ConvolverNode | null = null;
  let noise: AudioBuffer | null = null;
  let brown: AudioBuffer | null = null;
  let furnace: { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode; panner: PannerNode } | null = null;
  let drone: { gain: GainNode; oscs: OscillatorNode[] } | null = null;
  const nodes: AudioNode[] = [];

  let breathEffort = 0;
  let breathPhase = 0;
  let heartBpm = 0;
  let heartPhase = 0;
  let furnaceLevel = 0.7;
  let droneOn = false;
  let lastMrc = -1;
  const furnaceWorld = ctx.toWorld([furnaceLocal.x, furnaceLocal.y, furnaceLocal.z]);

  const ensure = (): boolean => {
    if (ac && bus) return true;
    const c = ctx.audio.context;
    const b = ctx.audio.zoneBus;
    if (!c || !b || c.state !== 'running') return false;
    ac = c;
    bus = b;
    dry = c.createGain();
    dry.gain.value = 0.9;
    dry.connect(b);
    // procedural hall IR: 2.8 s exponential decay of filtered noise, slight stereo spread
    const len = Math.floor(c.sampleRate * 2.8);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / c.sampleRate;
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = lp * Math.exp(-t * 2.4) * (i < 400 ? i / 400 : 1);
      }
    }
    wet = c.createConvolver();
    wet.buffer = ir;
    const wetGain = c.createGain();
    wetGain.gain.value = 0.32;
    wet.connect(wetGain).connect(b);
    nodes.push(dry, wet, wetGain);
    // noise buffers
    const n = c.sampleRate * 2;
    noise = c.createBuffer(1, n, c.sampleRate);
    brown = c.createBuffer(1, n, c.sampleRate);
    const wn = noise.getChannelData(0);
    const bn = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      wn[i] = w;
      last = (last + 0.02 * w) / 1.02;
      bn[i] = last * 3.5;
    }
    // furnace roar: brown noise → low-pass, positional at the mouth
    const src = c.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 0.7;
    const gain = c.createGain();
    gain.gain.value = 0;
    const panner = c.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 4;
    panner.rolloffFactor = 0.9;
    panner.positionX.value = furnaceWorld.x;
    panner.positionY.value = furnaceWorld.y;
    panner.positionZ.value = furnaceWorld.z;
    src.connect(filter).connect(gain).connect(panner);
    panner.connect(dry);
    panner.connect(wet);
    src.start();
    furnace = { gain, filter, src, panner };
    nodes.push(filter, gain, panner);
    return true;
  };

  const out = (reverb = true): AudioNode[] => (reverb && wet ? [dry!, wet] : [dry!]);
  const env = (g: GainNode, t: number, peak: number, a: number, d: number): void => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const burst = (t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, q: number, f1?: number, reverb = true): void => {
    const c = ac!;
    const s = c.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.loopStart = Math.random();
    s.loopEnd = s.loopStart + 0.9;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    env(g, t, peak, Math.min(0.01, dur * 0.2), dur);
    s.connect(f).connect(g);
    for (const o of out(reverb)) g.connect(o);
    s.start(t);
    s.stop(t + dur + 0.1);
  };
  const tone = (t: number, f0: number, f1: number | null, dur: number, peak: number, type: OscillatorType = 'sine', attack = 0.005, reverb = true): void => {
    const c = ac!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    env(g, t, peak, attack, dur);
    o.connect(g);
    for (const x of out(reverb)) g.connect(x);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  };

  const breathOnce = (t: number, rate: number, effort: number): void => {
    // inhale (higher, shorter) then exhale (lower, longer); filtered noise envelopes
    const period = 1 / rate;
    burst(t, period * 0.32, 0.05 + effort * 0.09, 'bandpass', 1300 + effort * 400, 1.2, 1700, false);
    burst(t + period * 0.42, period * 0.45, 0.06 + effort * 0.12, 'bandpass', 700 + effort * 200, 0.9, 420, false);
  };
  const heartOnce = (t: number): void => {
    tone(t, 62, 42, 0.12, 0.22, 'sine', 0.004, false);
    tone(t + 0.16, 58, 40, 0.1, 0.15, 'sine', 0.004, false);
  };

  return {
    update(dt) {
      if (!ensure()) return;
      const c = ac!;
      const now = c.currentTime;
      // furnace roar with slow flicker
      if (furnace) {
        const fl = furnaceLevel * (0.85 + 0.15 * Math.sin(now * 1.7) * Math.sin(now * 0.63));
        furnace.gain.gain.setTargetAtTime(0.45 * fl, now, 0.3);
        furnace.filter.frequency.setTargetAtTime(220 + 90 * fl, now, 0.3);
      }
      // breathing
      if (breathEffort > 0.01) {
        const rate = 0.4 + 0.4 * breathEffort;
        breathPhase += dt * rate;
        if (breathPhase >= 1) {
          breathPhase -= 1;
          breathOnce(now + 0.02, rate, breathEffort);
        }
      }
      if (heartBpm > 0) {
        heartPhase += (dt * heartBpm) / 60;
        if (heartPhase >= 1) {
          heartPhase -= 1;
          heartOnce(now + 0.02);
        }
      }
      if (drone) drone.gain.gain.setTargetAtTime(droneOn ? 0.09 : 0, now, droneOn ? 1.5 : 0.6);
    },
    setBreath(e) {
      breathEffort = Math.max(0, Math.min(1, e));
    },
    setHeart(bpm) {
      heartBpm = bpm;
    },
    setFurnace(level) {
      furnaceLevel = level;
    },
    setDrone(on) {
      droneOn = on;
      if (on && ensure() && !drone) {
        const c = ac!;
        const g = c.createGain();
        g.gain.value = 0;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 180;
        const oscs = [55, 55.35, 82.4].map((fr, i) => {
          const o = c.createOscillator();
          o.type = i === 2 ? 'sine' : 'sawtooth';
          o.frequency.value = fr;
          const og = c.createGain();
          og.gain.value = i === 2 ? 0.25 : 0.5;
          o.connect(og).connect(f);
          o.start();
          nodes.push(og);
          return o;
        });
        f.connect(g);
        g.connect(dry!);
        g.connect(wet!);
        drone = { gain: g, oscs };
        nodes.push(f, g);
      }
    },
    thud(_at, vol = 1) {
      if (!ensure()) return;
      const t = ac!.currentTime + 0.005;
      tone(t, 95, 48, 0.16, 0.35 * vol);
      burst(t, 0.08, 0.18 * vol, 'lowpass', 900, 0.8);
    },
    lift() {
      if (!ensure()) return;
      const t = ac!.currentTime + 0.005;
      burst(t, 0.35, 0.09, 'bandpass', 500, 1.4, 900, false); // strained exhale
      tone(t + 0.05, 140, 110, 0.12, 0.05, 'triangle');
    },
    flip(n = 6) {
      if (!ensure()) return;
      const t0 = ac!.currentTime + 0.005;
      // band-passed clicks (measured: a high-pass clatter sat within 15 dB HF of its RMS → harsh)
      for (let i = 0; i < n; i++) burst(t0 + i * 0.022 + Math.random() * 0.01, 0.014, 0.13, 'bandpass', 1900 + Math.random() * 900, 1.1);
    },
    creak() {
      if (!ensure()) return;
      const t = ac!.currentTime + 0.01;
      const c = ac!;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(68, t);
      o.frequency.linearRampToValueAtTime(92, t + 0.7);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 700;
      f.Q.value = 6;
      const g = c.createGain();
      env(g, t, 0.05, 0.1, 0.65);
      o.connect(f).connect(g);
      for (const x of out()) g.connect(x);
      o.start(t);
      o.stop(t + 0.85);
    },
    clunk() {
      if (!ensure()) return;
      const t = ac!.currentTime + 0.005;
      // measured at 0.55/0.3: peak −6 dBFS on the zone bus; now ≈ −11 (cue range, like the engine stamp)
      tone(t, 70, 36, 0.4, 0.3);
      burst(t, 0.18, 0.16, 'lowpass', 1200, 0.7, 300);
      tone(t + 0.01, 410, 400, 0.9, 0.05, 'triangle'); // metallic ring
      tone(t + 0.01, 731, 720, 0.6, 0.03, 'triangle');
    },
    relay(i) {
      if (!ensure()) return;
      const t = ac!.currentTime + 0.005;
      // measured at 0.6/0.4/0.18: peak −4.8 dBFS on the zone bus; now in the cue range (≈ −12)
      tone(t, 58 - i * 2, 34, 0.32, 0.25);
      burst(t, 0.06, 0.16, 'bandpass', 1800, 1.2);
      burst(t + 0.03, 0.25, 0.08, 'lowpass', 600, 0.7, 120);
    },
    rti() {
      if (!ensure()) return;
      const t = ac!.currentTime + 0.01;
      tone(t, 660, null, 0.22, 0.12, 'sine', 0.02, false);
      tone(t + 0.26, 880, null, 0.32, 0.12, 'sine', 0.02, false);
    },
    mrc() {
      if (!ensure()) return;
      // several safe stops in one frame (an instant night) must not stack into one loud hiss
      if (ac!.currentTime - lastMrc < 0.5) return;
      lastMrc = ac!.currentTime;
      const t = ac!.currentTime + 0.01;
      burst(t, 1.1, 0.22, 'highpass', 2400, 0.6, 5200); // pneumatic hiss
      tone(t, 220, 60, 0.9, 0.12, 'sawtooth'); // motor spinning down
    },
    clack() {
      if (!ensure()) return;
      const t = ac!.currentTime + 0.005;
      burst(t, 0.02, 0.07, 'bandpass', 2200, 2);
    },
    dispose() {
      try {
        furnace?.src.stop();
        drone?.oscs.forEach((o) => o.stop());
        for (const n of nodes) n.disconnect();
      } catch {
        /* already stopped */
      }
      furnace = null;
      drone = null;
    },
  };
}
