/**
 * Procedural sounds of the Greifwerkstatt (GDD §7.3 „Sound"), built from oscillators, noise and
 * biquads on the zone bus (distance-attenuated by the engine) with an equal-power panner per source.
 *
 *  servo whine   low-passed sawtooth, cutoff 300 + 400·|ω| Hz (station A, giant arm)
 *  creak         force-pitched rasp, 200 Hz + 20 Hz/N (station B, Kraftsensor)
 *  crack         noise burst + 3 clicks · squeak: downward band-pass sweep · clatter · tally blips
 *
 * Every voice is created lazily: the AudioContext exists only after the first user gesture,
 * and headless runs may never have one. All calls are safe no-ops without audio.
 *
 * Levels (zones bus, operate camera at the source, __academy.audioMeasure, 2026-10): crack −15 … −18,
 * glass ≈ −15, ring tick ≈ −17, squeak ≈ −19, servo ≈ −23, creak ≈ −25, clack ≈ −25, tally run ≈ −22
 * dBFS peak — inside the engine's cue range (−18 … −9) or below it, never above the stamp (≈ −13).
 * Square clicks are low-passed (no laptop-speaker buzz); the crack and glass noise are band-limited.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';

interface Voice {
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  lfo?: OscillatorNode;
}

export class Sfx {
  private noise: AudioBuffer | null = null;
  private voices = new Map<string, Voice>();
  private panners = new Map<string, PannerNode>();
  private lastPos = new Map<string, THREE.Vector3>();
  private disposed = false;
  private readonly w = new THREE.Vector3();

  constructor(private readonly ctx: ZoneContext) {}

  private get ac(): AudioContext | null {
    return this.disposed ? null : this.ctx.audio.context;
  }

  /** a panner at a fixed local point (cached per key), connected to the zone bus */
  private out(key: string, at: THREE.Vector3Like): AudioNode | null {
    const ac = this.ac,
      bus = this.ctx.audio.zoneBus;
    if (!ac || !bus) return null;
    let p = this.panners.get(key);
    if (!p) {
      p = ac.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.rolloffFactor = 1;
      p.maxDistance = 50;
      p.connect(bus);
      this.panners.set(key, p);
    }
    // sources are mostly static per key: only touch the panner when the local position changed
    let last = this.lastPos.get(key);
    if (!last) this.lastPos.set(key, (last = new THREE.Vector3(NaN, NaN, NaN)));
    if (last.x !== at.x || last.y !== at.y || last.z !== at.z) {
      last.set(at.x, at.y, at.z);
      this.ctx.toWorld(last, this.w);
      p.positionX.value = this.w.x;
      p.positionY.value = this.w.y;
      p.positionZ.value = this.w.z;
    }
    return p;
  }

  private noiseBuf(ac: AudioContext): AudioBuffer {
    if (!this.noise) {
      const len = Math.floor(ac.sampleRate * 1.0);
      this.noise = ac.createBuffer(1, len, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  private voice(key: string, at: THREE.Vector3Like, make: (ac: AudioContext) => Voice): Voice | null {
    const ac = this.ac;
    if (!ac) return null;
    let v = this.voices.get(key);
    if (!v) {
      const out = this.out(key, at);
      if (!out) return null;
      v = make(ac);
      v.gain.gain.value = 0;
      v.osc.connect(v.filter).connect(v.gain).connect(out);
      v.osc.start();
      v.lfo?.start();
      this.voices.set(key, v);
    }
    return v;
  }

  /** Continuous servo whine. omega = |joint speed| (rad/s); 0 fades it out. */
  servo(key: string, at: THREE.Vector3Like, omega: number, volume = 1): void {
    const v = this.voice(key, at, (ac) => {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 110;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 6;
      filter.frequency.value = 300;
      return { osc, filter, gain: ac.createGain() };
    });
    if (!v) return;
    const t = this.ac!.currentTime;
    const w = Math.min(4, Math.abs(omega));
    v.filter.frequency.setTargetAtTime(300 + 400 * w, t, 0.04);
    v.osc.frequency.setTargetAtTime(90 + 70 * w, t, 0.05);
    v.gain.gain.setTargetAtTime(w > 0.01 ? Math.min(0.2, 0.055 + 0.07 * w) * volume : 0, t, 0.05);
  }

  /** Continuous creak pitched by force: 200 Hz + 20 Hz/N. force ≤ 0 silences it. */
  creak(at: THREE.Vector3Like, forceN: number): void {
    const v = this.voice('creak', at, (ac) => {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 200;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 4;
      filter.frequency.value = 900;
      const gain = ac.createGain();
      // a slow tremolo makes it read as "material under load" rather than a pure tone
      const lfo = ac.createOscillator();
      lfo.frequency.value = 23;
      const depth = ac.createGain();
      depth.gain.value = 40;
      lfo.connect(depth).connect(osc.frequency);
      return { osc, filter, gain, lfo };
    });
    if (!v) return;
    const t = this.ac!.currentTime;
    const f = Math.max(0, forceN);
    v.osc.frequency.setTargetAtTime(200 + 20 * f, t, 0.02);
    v.filter.frequency.setTargetAtTime(Math.min(2000, 600 + 40 * f), t, 0.03); // capped: no harsh top at 80 N
    v.gain.gain.setTargetAtTime(f > 0.05 ? 0.36 : 0, t, 0.03);
  }

  private burst(out: AudioNode, t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number | null, q: number): void {
    const ac = this.ac!;
    const s = ac.createBufferSource();
    s.buffer = this.noiseBuf(ac);
    s.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.008, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  private click(out: AudioNode, t: number, freq: number, peak: number, dur = 0.018): void {
    const ac = this.ac!;
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    // unfiltered squares buzz on laptop speakers (ARCHITECTURE §5.12): low-pass at 3.5 kHz
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3500;
    lp.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Egg crack: noise burst plus three dry clicks. `slow` stretches it for the slow-motion replay. */
  crack(at: THREE.Vector3Like, slow = 1): void {
    const out = this.out('crack', at);
    if (!out) return;
    const t = this.ac!.currentTime + 0.005;
    this.burst(out, t, 0.09 * slow, 0.4, 'bandpass', 1700 / slow, null, 0.9);
    this.click(out, t + 0.004 * slow, 2600 / slow, 0.18, 0.02 * slow);
    this.click(out, t + 0.03 * slow, 1900 / slow, 0.14, 0.02 * slow);
    this.click(out, t + 0.065 * slow, 3100 / slow, 0.1, 0.02 * slow);
  }

  /** Glass break: brighter, longer, with a ringing partial. */
  shatter(at: THREE.Vector3Like): void {
    const out = this.out('crack', at);
    if (!out) return;
    const ac = this.ac!;
    const t = ac.currentTime + 0.005;
    this.burst(out, t, 0.35, 0.24, 'bandpass', 2200, 3000, 0.8);
    for (let i = 0; i < 5; i++) this.click(out, t + i * 0.025 + Math.random() * 0.02, 2400 + Math.random() * 1600, 0.07, 0.03);
    const o = ac.createOscillator();
    o.frequency.value = 3000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.02, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.65);
  }

  /** Slip squeak: a downward band-pass sweep. */
  squeak(at: THREE.Vector3Like): void {
    const out = this.out('squeak', at);
    if (!out) return;
    const ac = this.ac!;
    const t = ac.currentTime + 0.005;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.28);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(800, t + 0.28);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.32);
  }

  /** Ring threaded: bright tick + a soft teal chime. */
  tick(at: THREE.Vector3Like, n: number): void {
    const out = this.out('tick', at);
    if (!out) return;
    const ac = this.ac!;
    const t = ac.currentTime + 0.005;
    this.click(out, t, 2400, 0.2, 0.015);
    const base = [880, 1108.7, 1318.5][Math.min(2, n)];
    for (const [mul, d] of [[1, 0], [1.5, 0.06]] as const) {
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.value = base * mul;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.2, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5);
      o.connect(g).connect(out);
      o.start(t + d);
      o.stop(t + d + 0.55);
    }
  }

  /** Mechanical clack (joint jump, floor contact, cabinet rhythm). */
  clack(key: string, at: THREE.Vector3Like, pitch = 1, volume = 1): void {
    const out = this.out(key, at);
    if (!out) return;
    const t = this.ac!.currentTime + 0.003;
    this.burst(out, t, 0.04, 0.5 * volume, 'bandpass', 1500 * pitch, null, 2.2);
    this.click(out, t, 700 * pitch, 0.22 * volume, 0.025);
  }

  /** Tally blip: 880 Hz success, 220 Hz failure. */
  blip(at: THREE.Vector3Like, ok: boolean, volume = 1): void {
    const out = this.out('blip', at);
    if (!out) return;
    const ac = this.ac!;
    const t = ac.currentTime + 0.003;
    const o = ac.createOscillator();
    o.type = ok ? 'sine' : 'triangle';
    o.frequency.value = ok ? 880 : 220;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07 * volume, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.08);
  }

  dispose(): void {
    this.disposed = true;
    for (const v of this.voices.values()) {
      try {
        v.osc.stop();
        v.lfo?.stop();
        v.gain.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear();
    for (const p of this.panners.values()) p.disconnect();
    this.panners.clear();
  }
}
