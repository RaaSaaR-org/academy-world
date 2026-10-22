/**
 * Prüffeld sound kit (procedural WebAudio, GDD §7.6 "Sound"): showroom jingle, spotlight
 * clunk, shutter rattle (granular clicks), container rumble, docking clunk, trial blips,
 * split-flap clatter, printer buzz, κ ticks. Custom nodes go through a panner into the zone bus.
 */
import type { ZoneContext } from '@/core/zones';
import * as THREE from 'three';

type V3 = [number, number, number];

export interface Sfx {
  jingle(at: V3): void;
  clunk(at: V3, deep?: boolean): void;
  rattle(at: V3, dur: number): void;
  clatter(at: V3, dur: number, density?: number): void;
  buzz(at: V3, dur: number): void;
  blip(at: V3, ok: boolean): void;
  tick(at: V3, pitch?: number): void;
  chime(at: V3): void;
  denied(at: V3): void;
}

export function createSfx(ctx: ZoneContext): Sfx {
  let noise: AudioBuffer | null = null;
  const w = new THREE.Vector3();
  const getNoise = (ac: AudioContext): AudioBuffer => {
    if (noise && noise.sampleRate === ac.sampleRate) return noise;
    const len = Math.floor(ac.sampleRate * 0.5);
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  };
  /** panner at a local point → zone bus; null when audio is not unlocked yet */
  const out = (at: V3): { ac: AudioContext; node: AudioNode } | null => {
    const ac = ctx.audio.context,
      bus = ctx.audio.zoneBus;
    if (!ac || !bus || ac.state !== 'running') return null;
    ctx.toWorld(at, w);
    const p = ac.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 0.9;
    p.positionX.value = w.x;
    p.positionY.value = w.y;
    p.positionZ.value = w.z;
    p.connect(bus);
    return { ac, node: p };
  };
  const grain = (ac: AudioContext, dest: AudioNode, t: number, freq: number, q: number, gain: number, dur: number): void => {
    const s = ac.createBufferSource();
    s.buffer = getNoise(ac);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.4);
    s.stop(t + dur + 0.02);
  };

  return {
    jingle(at) {
      // the only "glossy" music in the game: soft major arpeggio (Cmaj9), bell-ish sines
      const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
      notes.forEach((f, i) => ctx.after(i * 0.13, () => ctx.audio.tone({ freq: f, dur: 0.9, type: 'sine', volume: 0.09, at })));
      ctx.after(0.85, () => ctx.audio.tone({ freq: 1318.51, dur: 1.4, type: 'triangle', volume: 0.045, at }));
    },
    clunk(at, deep = true) {
      ctx.audio.play('thud', { at, pitch: deep ? 0.55 : 0.9, volume: 0.9 });
      ctx.audio.tone({ freq: deep ? 62 : 110, to: deep ? 38 : 70, dur: 0.35, type: 'sine', volume: 0.35, at });
    },
    rattle(at, dur) {
      const o = out(at);
      if (!o) return;
      const t0 = o.ac.currentTime;
      const n = Math.floor(dur * 26);
      for (let i = 0; i < n; i++) {
        const t = t0 + (i / n) * dur + Math.random() * 0.02;
        grain(o.ac, o.node, t, 1300 + Math.random() * 1800, 6, 0.12 + Math.random() * 0.1, 0.03);
        if (i % 3 === 0) grain(o.ac, o.node, t + 0.01, 420 + Math.random() * 200, 3, 0.08, 0.06);
      }
    },
    clatter(at, dur, density = 1) {
      const o = out(at);
      if (!o) return;
      const t0 = o.ac.currentTime;
      const n = Math.floor(dur * 70 * density);
      for (let i = 0; i < n; i++) {
        const t = t0 + Math.pow(Math.random(), 1.4) * dur;
        grain(o.ac, o.node, t, 1700 + Math.random() * 2000, 9, 0.07 + Math.random() * 0.05, 0.018);
      }
    },
    buzz(at, dur) {
      const o = out(at);
      if (!o) return;
      const { ac, node } = o;
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 196;
      const lfo = ac.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 34;
      const lg = ac.createGain();
      lg.gain.value = 0.5;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
      g.gain.setValueAtTime(0.06, t + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const am = ac.createGain();
      am.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400;
      f.Q.value = 1.2;
      osc.connect(am).connect(f).connect(g).connect(node);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);
    },
    blip(at, ok) {
      ctx.audio.tone({ freq: ok ? 1480 : 330, dur: ok ? 0.035 : 0.06, type: ok ? 'sine' : 'triangle', volume: ok ? 0.12 : 0.15, at });
    },
    tick(at, pitch = 1) {
      const o = out(at);
      if (!o) return;
      grain(o.ac, o.node, o.ac.currentTime, 3200 * pitch, 12, 0.18, 0.012);
    },
    chime(at) {
      ctx.audio.tone({ freq: 880, dur: 0.25, type: 'sine', volume: 0.08, at });
      ctx.after(0.12, () => ctx.audio.tone({ freq: 1318.51, dur: 0.5, type: 'sine', volume: 0.07, at }));
    },
    denied(at) {
      ctx.audio.tone({ freq: 220, to: 180, dur: 0.18, type: 'square', volume: 0.3, at });
      ctx.after(0.2, () => ctx.audio.tone({ freq: 196, to: 160, dur: 0.24, type: 'square', volume: 0.3, at }));
    },
  };
}
