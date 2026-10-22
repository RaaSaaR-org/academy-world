import * as THREE from 'three';
import type { Surface } from '@/core/Physics';

/**
 * Procedural WebAudio — no audio files. The AudioContext is created on the first
 * user gesture (`unlock()`); everything requested earlier is queued/ignored safely.
 *
 * Signal path (docs/ARCHITECTURE.md §5.12):
 *
 *   ambience ─┐ (low-pass, WP2)          (wind, rotors, engine/zone loops)
 *   zones ────┤                         (every zone's ctx.audio.zoneBus, distance-faded)
 *   ui ───────┤                         (click, hover, open, close, type, toast beeps)
 *   foley ────┼─→ mix → limiter → soft clip ─┬─→ volume (slider, mute) → speakers
 *   cues ─────┤                              └─→ meter taps (__academy.audioMeter)
 *   voice ────┘                         (EMI chirps; ducks ambience + zones briefly)
 *
 * Loudness hierarchy (dBFS before the volume slider): ambience < UI < cues < EMI, with the
 * master ceiling at −1 dBFS. LEVEL_TARGETS holds the numbers; tools/audio-levels.mjs
 * measures them in headless Chromium.
 */
export type SfxName =
  | 'click'
  | 'hover'
  | 'beep'
  | 'success'
  | 'whoosh'
  | 'jump'
  | 'land'
  | 'grab'
  | 'drop'
  | 'throw'
  | 'stamp'
  | 'error'
  | 'open'
  | 'close'
  | 'type'
  | 'thud';

export type BuiltinLoopKind = 'hum' | 'servo' | 'beacon' | 'conveyor' | 'drone' | 'generator' | 'data';
/**
 * Loop kinds added with registerLoopKind (Phase 7 plan §5.2: spin-up, bees, farm bed, rail — their WPs).
 * A package names its ids for the type checker: `declare module '@/systems/Audio' { interface LoopKindRegistry { bees: true } }`.
 */
export interface LoopKindRegistry {}
export type LoopKind = BuiltinLoopKind | Extract<keyof LoopKindRegistry, string>;

/** What a registered loop builds with: nodes made through it are started, pitched and stopped with the loop. */
export interface LoopKit {
  readonly ctx: AudioContext;
  /** the loop's output (gain ramped by the handle's volume × `base`); connect your last node here */
  readonly out: GainNode;
  osc(type: OscillatorType, freq: number): OscillatorNode;
  lfo(freq: number, depth: number, target: AudioParam): void;
  filter(type: BiquadFilterType, freq: number, q?: number): BiquadFilterNode;
  /** looping white noise */
  noise(): AudioBufferSourceNode;
  /** any other source node you start yourself through the loop */
  add<T extends AudioScheduledSourceNode>(node: T): T;
}
/** Builds one loop instance (called when the loop starts, and again after the AudioContext is created). */
export type LoopFactory = (kit: LoopKit) => void;
const customLoops = new Map<string, { make: LoopFactory; base: number }>();
const BUILTIN_LOOPS = new Set<string>(['hum', 'servo', 'beacon', 'conveyor', 'drone', 'generator', 'data']);

/**
 * A new continuous sound for ctx.audio.loop(kind). `base` = its gain at volume 1 (the built-ins use
 * 0.02–0.12; calibrate against LEVEL_TARGETS.zoneLoop). Register at boot or in a zone's init.
 */
export function registerLoopKind(id: string, make: LoopFactory, o: { base?: number } = {}): LoopKind {
  if (BUILTIN_LOOPS.has(id)) throw new Error(`loop kind "${id}" is built in`);
  customLoops.set(id, { make, base: o.base ?? 0.05 });
  return id as LoopKind;
}

/** Mixer buses. Every sound lands on exactly one. */
export type AudioBusName = 'ambience' | 'zones' | 'ui' | 'foley' | 'cues' | 'voice';
/** What `__academy.audioMeter()` can measure: the master output or one bus (post bus gain). */
export type MeterTarget = 'master' | AudioBusName;

/**
 * Level targets in dBFS, measured before the player's volume slider with
 * `__academy.audioMeter()` (sample peak; RMS over the window). Zone teams aim for these.
 */
export const LEVEL_TARGETS = {
  /** island bed (wind + rotors) while walking the deck: RMS, peak */
  ambience: { rms: [-36, -28], peak: -20 },
  /** one zone's beds/loops at their source (≤ 3 m): RMS */
  zoneLoop: { rms: [-34, -24], peak: -16 },
  /** UI clicks, hovers, open/close: peak */
  ui: { peak: [-26, -18] },
  /** footsteps, jump, land: peak */
  foley: { peak: [-28, -18] },
  /** cues (stamp, success, error, pads, lift chime, gusts, zone events): peak */
  cues: { peak: [-18, -9] },
  /** EMI chirp at a talking distance: peak */
  voice: { peak: [-14, -8] },
  /** master: hard ceiling (limiter + soft clip) */
  master: { peak: -1 },
} as const;

export interface SfxOptions {
  volume?: number;
  /** playback-rate style multiplier for pitched sounds (1 = default) */
  pitch?: number;
  /** world position → spatialised one-shot */
  at?: THREE.Vector3;
  /** override the bus the sound is mixed into (engine use) */
  bus?: AudioBusName;
}

export interface LoopOptions {
  /** Object3D to follow or fixed world position. Omit for non-positional. */
  at?: THREE.Object3D | THREE.Vector3;
  volume?: number;
  pitch?: number;
  refDistance?: number;
  maxDistance?: number;
  /** 'ambience' (island, default) or 'zones' (zone-owned loops) */
  bus?: AudioBusName;
}

export interface LoopHandle {
  setVolume(v: number, rampSeconds?: number): void;
  setPitch(p: number): void;
  stop(): void;
  readonly stopped: boolean;
}

export interface MeterReading {
  /** sample peak in the window (dBFS, −120 = silence) */
  peakDb: number;
  /** RMS over the window (dBFS) */
  rmsDb: number;
  /** RMS of the content above 4 kHz (dBFS): close to rmsDb = bright / harsh */
  hfDb: number;
  /** samples at or above −0.1 dBFS in the window */
  clipped: number;
  /** window actually covered (ms) */
  ms: number;
  /** false until the meter tap is running (first call arms it) */
  armed: boolean;
  /** AudioContext state ('none' before the first user gesture) */
  state: string;
}

interface LoopRecord {
  kind: LoopKind;
  opts: LoopOptions;
  volume: number;
  pitch: number;
  stopped: boolean;
  out: GainNode | null;
  panner: PannerNode | null;
  sources: AudioScheduledSourceNode[];
  pitchParams: { param: AudioParam; base: number }[];
}

interface MeterChunk {
  t: number;
  peak: number;
  sum: number;
  hsum: number;
  n: number;
  clip: number;
}

/** Bus gains: the coarse loudness hierarchy (per-sound constants do the fine tuning). */
const BUS_GAIN: Record<AudioBusName, number> = {
  ambience: 0.8,
  zones: 1,
  ui: 0.55,
  foley: 0.7,
  cues: 1,
  voice: 1.25,
};

/**
 * D14 (F3): the three volume sliders of the settings and the buses each one moves (user trims after the
 * bus, so the duck and the meters keep working on the bus gain itself).
 */
export type VolumeGroup = 'atmo' | 'effects' | 'emi';
export const VOLUME_GROUPS: Record<VolumeGroup, AudioBusName[]> = {
  atmo: ['ambience', 'zones'],
  effects: ['ui', 'foley', 'cues'],
  emi: ['voice'],
};

/** The ambience low-pass when open (Phase 7, WP2: setAmbienceFilter(null)). */
const AMBIENCE_OPEN_HZ = 20000;

/** UI sounds by name (everything else is a cue unless it is foley). */
const UI_SFX = new Set<SfxName>(['click', 'hover', 'open', 'close', 'type']);
const FOLEY_SFX = new Set<SfxName>(['jump', 'land']);

const _p = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();

export class AudioSystem {
  ctx: AudioContext | null = null;
  private volumeNode!: GainNode;
  private mix!: GainNode;
  private post!: AudioNode;
  private buses!: Record<AudioBusName, GainNode>;
  private noise!: AudioBuffer;
  private loops = new Set<LoopRecord>();
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  /** Phase 7 (WP2): the ambience bus low-pass (cloud muffle), between the bus gain and the player's trim */
  private ambienceLp: BiquadFilterNode | null = null;
  private volume = 0.8;
  private windIntensity = 0.5;
  private lastPlay = new Map<string, number>();
  private duckUntil = 0;
  private meters = new Map<MeterTarget, { node: AudioWorkletNode | null; ring: MeterChunk[] }>();
  private meterModule: Promise<void> | null = null;
  private gates = new Map<AudioBusName, GainNode>();
  /** D14: user trims per bus (1 = as mixed) */
  private trims = new Map<AudioBusName, GainNode>();
  private groupVolume: Record<VolumeGroup, number> = { atmo: 1, effects: 1, emi: 1 };
  private soloed: AudioBusName | null = null;
  muted = false;

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Create/resume the AudioContext. Call from a user gesture. Safe to call often. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.build();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (err) {
      console.warn('[audio] unavailable', err);
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    // master chain: mix → limiter (≈ −1 dBFS ceiling incl. the node's automatic make-up) → soft clip → volume
    this.mix = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = '2x';
    this.volumeNode = ctx.createGain();
    this.volumeNode.gain.value = this.muted ? 0 : this.volume;
    this.mix.connect(limiter).connect(clip).connect(this.volumeNode).connect(ctx.destination);
    this.post = clip;
    const bus = (name: AudioBusName): GainNode => {
      const g = ctx.createGain();
      g.gain.value = BUS_GAIN[name];
      // the player's trim (D14), then the solo/mute stage (meters tap the bus itself, so neither changes a reading)
      const trim = ctx.createGain();
      trim.gain.value = this.trimFor(name);
      const gate = ctx.createGain();
      // the ambience bus passes its low-pass (open at 20 kHz until setAmbienceFilter); meters tap the bus gain
      if (name === 'ambience') {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 0.707;
        lp.frequency.value = this.ambienceFilterHz ?? AMBIENCE_OPEN_HZ;
        this.ambienceLp = lp;
        g.connect(lp).connect(trim).connect(gate).connect(this.mix);
      } else g.connect(trim).connect(gate).connect(this.mix);
      this.trims.set(name, trim);
      this.gates.set(name, gate);
      return g;
    };
    this.buses = { ambience: bus('ambience'), zones: bus('zones'), ui: bus('ui'), foley: bus('foley'), cues: bus('cues'), voice: bus('voice') };
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startWind();
    for (const l of this.loops) if (!l.stopped && !l.out) this.startLoop(l);
    // meters and solo requested before the context existed
    for (const target of this.meters.keys()) this.armMeter(target);
    if (this.soloed) this.solo(this.soloed);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.visibilityState === 'hidden') void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  setVolume(v: number): void {
    this.volume = THREE.MathUtils.clamp(v, 0, 1);
    if (this.ctx) this.volumeNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  /** D14: one of the three player volumes (0…1); applied now or when the context is created. */
  setGroupVolume(group: VolumeGroup, v: number): void {
    this.groupVolume[group] = THREE.MathUtils.clamp(v, 0, 1);
    if (!this.ctx) return;
    for (const name of VOLUME_GROUPS[group]) this.trims.get(name)?.gain.setTargetAtTime(this.trimFor(name), this.ctx.currentTime, 0.05);
  }

  private trimFor(bus: AudioBusName): number {
    for (const g of Object.keys(VOLUME_GROUPS) as VolumeGroup[]) if (VOLUME_GROUPS[g].includes(bus)) return this.groupVolume[g];
    return 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.setVolume(this.volume);
  }

  /** Phase 7 (WP2): the ambience low-pass as last set (cloud muffle ≈ 600 Hz); null = open. */
  ambienceFilterHz: number | null = null;

  /**
   * Low-pass on the ambience bus (wind, rotors, island loops): the cloud muffle of the lift-off (plan §5.7,
   * §4.15: ≈ 600 Hz in the cloud, the filter opens at the break-out). The cutoff glides evenly in octaves
   * and reaches the target after `rampS` (s); null opens it again (20 kHz). UI, cues and EMI stay clear.
   * Set before the first gesture, it applies when the context is created.
   */
  setAmbienceFilter(hz: number | null, rampS = 0.5): void {
    const target = hz == null ? null : THREE.MathUtils.clamp(hz, 40, AMBIENCE_OPEN_HZ);
    this.ambienceFilterHz = target;
    const lp = this.ambienceLp;
    if (!this.ctx || !lp) return;
    const f = lp.frequency;
    const t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    // an exponential ramp moves the cutoff evenly in octaves (what the ear hears as an even close)
    if (rampS > 0.01) f.exponentialRampToValueAtTime(target ?? AMBIENCE_OPEN_HZ, t + rampS);
    else f.setValueAtTime(target ?? AMBIENCE_OPEN_HZ, t);
  }

  /** Wind bed intensity 0…1 (e.g. stronger near the island edge). */
  setWind(intensity: number): void {
    this.windIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
    if (this.ctx && this.wind) {
      const t = this.ctx.currentTime;
      this.wind.gain.gain.setTargetAtTime(0.05 + this.windIntensity * 0.22, t, 0.8);
      this.wind.filter.frequency.setTargetAtTime(350 + this.windIntensity * 700, t, 0.8);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    s.loopEnd = s.loopStart + 0.9;
    return s;
  }

  private busFor(name: SfxName | null, opts: SfxOptions, fallback: AudioBusName = 'cues'): GainNode {
    if (opts.bus) return this.buses[opts.bus];
    if (name && UI_SFX.has(name)) return this.buses.ui;
    if (name && FOLEY_SFX.has(name)) return this.buses.foley;
    return this.buses[fallback];
  }

  private dest(opts: SfxOptions, bus: AudioNode, hrtf = false): AudioNode {
    if (!opts.at) return bus;
    const p = this.ctx!.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 2;
    p.rolloffFactor = 1.3;
    p.maxDistance = 60;
    p.positionX.value = opts.at.x;
    p.positionY.value = opts.at.y;
    p.positionZ.value = opts.at.z;
    p.connect(bus);
    return p;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private osc(type: OscillatorType, f0: number, f1: number | null, t: number, dur: number, peak: number, out: AudioNode, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, attack, dur);
    // square / sawtooth carry hard upper harmonics: tame them (no fizz on laptop speakers)
    if (type === 'square' || type === 'sawtooth') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(4200, Math.max(1200, f0 * 5));
      lp.Q.value = 0.5;
      o.connect(lp).connect(g).connect(out);
    } else o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private burst(t: number, dur: number, peak: number, filterType: BiquadFilterType, freq: number, q: number, out: AudioNode, freqEnd?: number): void {
    const ctx = this.ctx!;
    const n = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, Math.min(0.01, dur * 0.2), dur);
    n.connect(f).connect(g).connect(out);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  // ── one-shots ────────────────────────────────────────────────────────────

  play(name: SfxName, opts: SfxOptions = {}): void {
    if (!this.unlocked) return;
    // de-duplicate identical sounds within 30 ms
    const now = performance.now();
    if (now - (this.lastPlay.get(name) ?? 0) < 30) return;
    this.lastPlay.set(name, now);
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005;
    const v = opts.volume ?? 1;
    const p = opts.pitch ?? 1;
    const out = this.dest(opts, this.busFor(name, opts));
    switch (name) {
      case 'click':
        this.osc('sine', 1900 * p, 1200 * p, t, 0.03, 0.12 * v, out);
        this.burst(t, 0.015, 0.035 * v, 'bandpass', 3000, 0.9, out);
        break;
      case 'hover':
        this.osc('sine', 1400 * p, null, t, 0.025, 0.06 * v, out);
        break;
      case 'beep':
        this.beepAt(t, 880 * p, 0.09, v, out);
        break;
      case 'success': {
        const notes = [1046.5, 1318.5, 1568, 2093];
        notes.forEach((f, i) => this.osc('triangle', f * p, null, t + i * 0.075, 0.32, 0.17 * v, out, 0.004));
        break;
      }
      case 'stamp':
        this.osc('sine', 120, 45, t, 0.18, 0.22 * v, out);
        this.burst(t, 0.07, 0.1 * v, 'bandpass', 1400, 0.9, out);
        [1318.5, 1760, 2637].forEach((f, i) => this.osc('triangle', f, null, t + 0.12 + i * 0.07, 0.4, 0.07 * v, out));
        break;
      case 'whoosh':
        this.burst(t, 0.55, 0.7 * v, 'bandpass', 380 * p, 1.4, out, 2400 * p);
        break;
      case 'jump':
        this.burst(t, 0.09, 0.2 * v, 'lowpass', 900, 0.7, out);
        break;
      case 'land':
        this.osc('sine', 95, 42, t, 0.14, 0.13 * v, out);
        this.burst(t, 0.08, 0.07 * v, 'lowpass', 600, 0.7, out);
        break;
      case 'thud':
        this.osc('sine', 80 * p, 38 * p, t, 0.16, 0.4 * v, out);
        this.burst(t, 0.06, 0.18 * v, 'lowpass', 900 * p, 0.8, out);
        break;
      case 'grab':
        this.osc('triangle', 320, 560, t, 0.07, 0.12 * v, out);
        this.burst(t, 0.02, 0.05 * v, 'bandpass', 2500, 0.9, out);
        break;
      case 'drop':
        this.osc('triangle', 520, 300, t, 0.07, 0.1 * v, out);
        break;
      case 'throw':
        this.burst(t, 0.28, 0.4 * v, 'bandpass', 600, 1.2, out, 2800);
        break;
      case 'error':
        // a soft low two-tone (no buzzer): filtered triangle, falling a whole tone
        this.beepAt(t, 330, 0.11, v * 1.6, out, 'triangle', 1400);
        this.beepAt(t + 0.15, 294, 0.16, v * 1.6, out, 'triangle', 1400);
        break;
      case 'open':
        this.osc('sine', 620 * p, 940 * p, t, 0.07, 0.09 * v, out);
        break;
      case 'close':
        this.osc('sine', 900 * p, 560 * p, t, 0.07, 0.08 * v, out);
        break;
      case 'type':
        this.burst(t, 0.012, 0.1 * v, 'bandpass', 3800, 1.2, out);
        break;
    }
  }

  private beepAt(t: number, freq: number, dur: number, v: number, out: AudioNode, type: OscillatorType = 'triangle', cutoff = 2400): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = Math.min(cutoff, Math.max(900, freq * 3));
    f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * v, t + 0.006);
    g.gain.setValueAtTime(0.11 * v, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.07);
  }

  /** The AudioContext (null before the first user gesture). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** A gain bus feeding the zones bus (for zone-owned sounds); null until audio is unlocked. */
  createBus(): GainNode | null {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    g.connect(this.buses.zones);
    return g;
  }

  /** EMI line chirp: 3-note FM chirp; unit n has base pitch 520 + 40·(n−1) Hz (GDD §10.2). HRTF, voice bus. */
  chirp(unitIndex = 1, at?: THREE.Vector3): void {
    if (!this.unlocked) return;
    const ctx = this.ctx!;
    const base = 520 + 40 * (unitIndex - 1);
    const out = this.dest({ at }, this.buses.voice, true);
    const t0 = ctx.currentTime + 0.01;
    this.duck(2.2);
    [1, 1.26, 1.5].forEach((ratio, i) => {
      const t = t0 + i * 0.07;
      const car = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      car.frequency.value = base * ratio;
      mod.frequency.value = base * ratio * 2;
      // FM index ≈ 0.4 at the attack, falling to ~0: a soft "blip", not a buzz
      modGain.gain.setValueAtTime(base * 0.4, t);
      modGain.gain.exponentialRampToValueAtTime(1, t + 0.08);
      mod.connect(modGain).connect(car.frequency);
      const g = ctx.createGain();
      this.env(g, t, 0.12, 0.006, 0.07);
      car.connect(g).connect(out);
      car.start(t);
      mod.start(t);
      car.stop(t + 0.12);
      mod.stop(t + 0.12);
    });
  }

  /** Tests: hear (and meter on master) only one bus; null restores the full mix. */
  solo(bus: AudioBusName | null): void {
    this.soloed = bus;
    if (!this.ctx) return;
    for (const [name, g] of this.gates) g.gain.setTargetAtTime(bus === null || bus === name ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  /** Duck the beds (ambience, zones) by ≈ 4 dB for a moment, so EMI lines read clearly. */
  duck(seconds: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const until = t + seconds;
    for (const b of [this.buses.ambience, this.buses.zones]) {
      const base = b === this.buses.ambience ? BUS_GAIN.ambience : BUS_GAIN.zones;
      b.gain.cancelScheduledValues(t);
      b.gain.setTargetAtTime(base * 0.63, t, 0.06);
      b.gain.setTargetAtTime(base, Math.max(until, this.duckUntil), 0.35);
    }
    this.duckUntil = Math.max(until, this.duckUntil);
  }

  /** Stamp: mechanical thunk + the Recamán melody note for stamp n (GDD §8.1). */
  stamp(noteHz: number): void {
    if (!this.unlocked) return;
    const t = this.ctx!.currentTime + 0.005;
    const out = this.buses.cues;
    this.osc('sine', 120, 45, t, 0.18, 0.22, out);
    this.burst(t, 0.07, 0.1, 'bandpass', 1400, 0.9, out);
    // soft mallet
    this.osc('triangle', noteHz * 2, null, t + 0.1, 0.9, 0.11, out, 0.003);
    this.osc('sine', noteHz * 4, null, t + 0.1, 0.35, 0.025, out, 0.002);
  }

  private lastCue = new Map<string, number>();

  /**
   * Game-layer cues (docs/FUN-PLAN.md §4, ctx.game.juice.cue), cues bus, peak −18 … −9 dBFS at
   * volume 1 (tools/audio-levels.mjs measures all nine). `pitch` scales every partial, so a
   * rising star sequence is cue('star', { pitch: 1 }), 1.12, 1.26. Identical cues within 40 ms merge.
   */
  cue(name: 'good' | 'great' | 'bad' | 'oops' | 'tick' | 'go' | 'star' | 'pb' | 'collect', opts: SfxOptions = {}): void {
    if (!this.unlocked) return;
    const now = performance.now();
    const k = `${name}:${(opts.pitch ?? 1).toFixed(2)}`;
    if (now - (this.lastCue.get(k) ?? 0) < 40) return;
    this.lastCue.set(k, now);
    const t = this.ctx!.currentTime + 0.005;
    const v = Math.max(0, Math.min(1.5, opts.volume ?? 1));
    const p = opts.pitch ?? 1;
    const out = this.dest(opts, this.buses.cues);
    switch (name) {
      case 'good':
        // two rising mallet notes (a fifth): "yes"
        this.osc('triangle', 784 * p, null, t, 0.16, 0.2 * v, out, 0.003);
        this.osc('triangle', 1175 * p, null, t + 0.075, 0.24, 0.2 * v, out, 0.003);
        this.osc('sine', 2350 * p, null, t + 0.075, 0.12, 0.03 * v, out, 0.002);
        break;
      case 'great':
        // low thump + a bright four-note run: the station is solved
        this.osc('sine', 110, 55, t, 0.2, 0.2 * v, out);
        [784, 988, 1175, 1568].forEach((f, i) => this.osc('triangle', f * p, null, t + 0.05 + i * 0.07, 0.36, 0.105 * v, out, 0.003));
        this.osc('sine', 3136 * p, null, t + 0.26, 0.4, 0.018 * v, out, 0.002);
        break;
      case 'bad':
        // a heavy, low two-step down with a muffled knock: something went wrong
        this.osc('sine', 92, 46, t, 0.22, 0.24 * v, out);
        this.burst(t, 0.07, 0.08 * v, 'lowpass', 700, 0.7, out);
        this.beepAt(t + 0.02, 247 * p, 0.12, 0.95 * v, out, 'triangle', 1100);
        this.beepAt(t + 0.17, 185 * p, 0.18, 0.95 * v, out, 'triangle', 1000);
        break;
      case 'oops':
        // a falling slide-whistle "bwoop": a funny, harmless miss
        this.osc('triangle', 720 * p, 300 * p, t, 0.26, 0.18 * v, out, 0.01);
        this.osc('sine', 1440 * p, 600 * p, t, 0.2, 0.03 * v, out, 0.01);
        break;
      case 'tick':
        // dry clock tick (pitch rises with the seconds)
        this.burst(t, 0.018, 0.2 * v, 'bandpass', 2600 * p, 2.2, out);
        this.osc('sine', 1320 * p, null, t, 0.045, 0.16 * v, out, 0.002);
        break;
      case 'go':
        // start: bright fifth with a short whoosh
        this.osc('triangle', 1046.5 * p, null, t, 0.34, 0.12 * v, out, 0.004);
        this.osc('triangle', 1568 * p, null, t, 0.34, 0.09 * v, out, 0.004);
        this.burst(t, 0.18, 0.06 * v, 'bandpass', 900, 1.1, out, 3200);
        break;
      case 'star':
        // a small bell: fundamental + soft octave
        this.osc('triangle', 1318.5 * p, null, t, 0.42, 0.15 * v, out, 0.002);
        this.osc('sine', 2637 * p, null, t, 0.24, 0.04 * v, out, 0.002);
        break;
      case 'pb':
        // personal best: a short fanfare (G–C–E–G)
        [784, 1046.5, 1318.5].forEach((f, i) => this.osc('triangle', f * p, null, t + i * 0.09, 0.16, 0.16 * v, out, 0.003));
        this.osc('triangle', 1568 * p, null, t + 0.27, 0.5, 0.17 * v, out, 0.003);
        this.osc('sine', 3136 * p, null, t + 0.27, 0.3, 0.03 * v, out, 0.002);
        break;
      case 'collect':
        // Sensorkapsel: a quick upward shimmer and a chime
        this.osc('sine', 880 * p, 1760 * p, t, 0.14, 0.15 * v, out, 0.004);
        this.osc('triangle', 1760 * p, null, t + 0.12, 0.45, 0.18 * v, out, 0.002);
        this.osc('sine', 2637 * p, null, t + 0.16, 0.36, 0.05 * v, out, 0.002);
        break;
    }
  }

  /**
   * Soft laser hiss for the tower's logo drawing (ART-V2 §5.9): band-passed noise with a slow
   * shimmer, cues bus, ≈ −24 dBFS. Returns stop() (0.25 s release).
   */
  hiss(opts: SfxOptions = {}): () => void {
    if (!this.unlocked) return () => undefined;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005;
    const n = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    f.Q.value = 2.2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 900;
    lfo.connect(lfoGain).connect(f.frequency);
    const g = ctx.createGain();
    const v = 0.05 * (opts.volume ?? 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.12);
    n.connect(f).connect(g).connect(this.dest(opts, this.buses.cues));
    n.start(t);
    lfo.start(t);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const t1 = ctx.currentTime;
      g.gain.cancelScheduledValues(t1);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t1);
      g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.25);
      n.stop(t1 + 0.3);
      lfo.stop(t1 + 0.3);
    };
  }

  /** Simple beep: frequency (Hz), duration (s). Filtered triangle (cue bus). */
  beep(freq = 880, dur = 0.09, opts: SfxOptions = {}): void {
    if (!this.unlocked) return;
    this.beepAt(this.ctx!.currentTime + 0.005, freq, dur, opts.volume ?? 1, this.dest(opts, this.busFor(null, opts)), 'triangle');
  }

  /** Freeform tone for zone-specific cues (e.g. sonification of a sensor value). Square/saw are low-passed. */
  tone(o: { freq: number; to?: number; dur?: number; type?: OscillatorType; volume?: number; at?: THREE.Vector3; bus?: AudioBusName }): void {
    if (!this.unlocked) return;
    const t = this.ctx!.currentTime + 0.005;
    this.osc(o.type ?? 'sine', o.freq, o.to ?? null, t, o.dur ?? 0.15, 0.12 * (o.volume ?? 1), this.dest({ at: o.at }, this.busFor(null, { bus: o.bus })));
  }

  /** Footstep for a surface. intensity 0…1.5 (sprint louder). Foley bus. */
  step(surface: Surface = 'concrete', intensity = 1): void {
    if (!this.unlocked) return;
    const t = this.ctx!.currentTime + 0.003;
    const r = 0.9 + Math.random() * 0.2;
    const v = 0.9 * intensity;
    const out = this.buses.foley;
    switch (surface) {
      case 'metal':
        this.burst(t, 0.05, 0.09 * v, 'bandpass', 1700 * r, 3, out);
        this.osc('sine', 2300 * r, 2200 * r, t, 0.1, 0.012 * v, out);
        this.osc('sine', 85 * r, 50, t, 0.06, 0.14 * v, out);
        break;
      case 'grass':
        this.burst(t, 0.09, 0.2 * v, 'lowpass', 520 * r, 0.6, out);
        break;
      case 'wood':
        this.burst(t, 0.05, 0.1 * v, 'bandpass', 420 * r, 2.2, out);
        this.osc('sine', 110 * r, 70, t, 0.07, 0.12 * v, out);
        break;
      case 'glass':
        // glass floor on a steel frame: a short bright tap over a low knock
        this.burst(t, 0.04, 0.16 * v, 'bandpass', 2400 * r, 2.5, out);
        this.osc('sine', 90 * r, 50, t, 0.06, 0.1 * v, out);
        break;
      case 'rubber':
        this.burst(t, 0.05, 0.06 * v, 'lowpass', 380 * r, 0.6, out);
        break;
      default:
        this.burst(t, 0.06, 0.09 * v, 'bandpass', 720 * r, 1.1, out);
        this.osc('sine', 75 * r, 45, t, 0.06, 0.13 * v, out);
    }
  }

  // ── loops ────────────────────────────────────────────────────────────────

  /** Continuous (optionally positional) sound. Returns a handle; call stop() when done. */
  loop(kind: LoopKind, opts: LoopOptions = {}): LoopHandle {
    const rec: LoopRecord = { kind, opts, volume: opts.volume ?? 1, pitch: opts.pitch ?? 1, stopped: false, out: null, panner: null, sources: [], pitchParams: [] };
    this.loops.add(rec);
    if (this.ctx) this.startLoop(rec);
    const self = this;
    return {
      setVolume(v: number, ramp = 0.1) {
        rec.volume = v;
        if (self.ctx && rec.out) rec.out.gain.setTargetAtTime(v * loopBase(kind), self.ctx.currentTime, Math.max(0.01, ramp / 3));
      },
      setPitch(p: number) {
        rec.pitch = p;
        if (self.ctx) for (const pp of rec.pitchParams) pp.param.setTargetAtTime(pp.base * p, self.ctx.currentTime, 0.05);
      },
      stop() {
        self.stopLoop(rec);
      },
      get stopped() {
        return rec.stopped;
      },
    };
  }

  private startLoop(rec: LoopRecord): void {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(rec.volume * loopBase(rec.kind), ctx.currentTime, 0.3);
    rec.out = out;
    const bus = this.buses[rec.opts.bus ?? 'ambience'];
    if (rec.opts.at) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = rec.opts.refDistance ?? 3;
      p.maxDistance = rec.opts.maxDistance ?? 60;
      p.rolloffFactor = 1.4;
      rec.panner = p;
      out.connect(p).connect(bus);
      this.updateLoopPosition(rec);
    } else out.connect(bus);

    const P = rec.pitch;
    const add = <T extends AudioScheduledSourceNode>(n: T): T => {
      rec.sources.push(n);
      return n;
    };
    const osc = (type: OscillatorType, f: number): OscillatorNode => {
      const o = add(ctx.createOscillator());
      o.type = type;
      o.frequency.value = f * P;
      rec.pitchParams.push({ param: o.frequency, base: f });
      return o;
    };
    const lfo = (f: number, depth: number, target: AudioParam): void => {
      const o = add(ctx.createOscillator());
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };

    switch (rec.kind) {
      case 'hum': {
        const lp = filter('lowpass', 240, 1.2);
        osc('sawtooth', 55).connect(lp);
        osc('sawtooth', 110.7).connect(lp);
        lfo(0.3, 60, lp.frequency);
        lp.connect(out);
        break;
      }
      case 'generator': {
        const lp = filter('lowpass', 420, 2);
        osc('square', 48).connect(lp);
        const n = add(this.noiseSrc());
        const nf = filter('bandpass', 260, 0.8);
        n.connect(nf).connect(lp);
        lfo(7, 120, lp.frequency);
        lp.connect(out);
        break;
      }
      case 'servo': {
        const bp = filter('bandpass', 900, 2.5);
        const o = osc('triangle', 230);
        lfo(2.7, 40, o.frequency);
        o.connect(bp).connect(out);
        break;
      }
      case 'beacon': {
        const o = osc('sine', 1046.5);
        const gate = ctx.createGain();
        gate.gain.value = 0;
        const lf = add(ctx.createOscillator());
        lf.type = 'square';
        lf.frequency.value = 0.6;
        const smooth = filter('lowpass', 25);
        const half = ctx.createGain();
        half.gain.value = 0.5;
        const dc = add(ctx.createConstantSource());
        dc.offset.value = 0.5;
        lf.connect(half).connect(smooth);
        dc.connect(smooth);
        smooth.connect(gate.gain);
        o.connect(gate).connect(out);
        break;
      }
      case 'conveyor': {
        const n = add(this.noiseSrc());
        const bp = filter('bandpass', 320, 0.9);
        const am = ctx.createGain();
        am.gain.value = 0.6;
        lfo(5.5, 0.4, am.gain);
        n.connect(bp).connect(am).connect(out);
        const lp = filter('lowpass', 160);
        osc('sawtooth', 41).connect(lp).connect(out);
        break;
      }
      case 'drone': {
        // rotor drone: two detuned saws through ≈ 90 Hz… 600 Hz low-pass (GDD §10.2), blade-rate AM
        const lp = filter('lowpass', 520, 0.9);
        osc('sawtooth', 88).connect(lp);
        osc('sawtooth', 132.5).connect(lp);
        const am = ctx.createGain();
        am.gain.value = 0.7;
        lfo(19, 0.3, am.gain);
        lp.connect(am).connect(out);
        break;
      }
      case 'data': {
        // Regelkern / data tick: a soft filtered pulse, not a square buzz
        const bp = filter('bandpass', 1800, 4);
        const o = osc('triangle', 1200);
        lfo(13, 500, o.frequency);
        const am = ctx.createGain();
        am.gain.value = 0.3;
        lfo(4, 0.3, am.gain);
        const lp = filter('lowpass', 3200, 0.5);
        o.connect(bp).connect(lp).connect(am).connect(out);
        break;
      }
      default: {
        const custom = customLoops.get(rec.kind);
        if (!custom) {
          console.warn(`[audio] unknown loop kind "${rec.kind}"`);
          break;
        }
        try {
          custom.make({ ctx, out, osc, lfo, filter, noise: () => add(this.noiseSrc()), add });
        } catch (err) {
          console.error(`[audio] loop kind "${rec.kind}" threw`, err);
        }
      }
    }
    for (const s of rec.sources) s.start();
  }

  private stopLoop(rec: LoopRecord): void {
    if (rec.stopped) return;
    rec.stopped = true;
    this.loops.delete(rec);
    if (!this.ctx || !rec.out) return;
    const t = this.ctx.currentTime;
    rec.out.gain.setTargetAtTime(0, t, 0.08);
    for (const s of rec.sources) {
      try {
        s.stop(t + 0.4);
      } catch {
        /* already stopped */
      }
    }
    const out = rec.out,
      pan = rec.panner;
    window.setTimeout(() => {
      out.disconnect();
      pan?.disconnect();
    }, 600);
  }

  private startWind(): void {
    const ctx = this.ctx!;
    const n = this.noiseSrc();
    n.loopStart = 0;
    n.loopEnd = 2;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lf = ctx.createOscillator();
    lf.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 220;
    lf.connect(lg).connect(f.frequency);
    const lf2 = ctx.createOscillator();
    lf2.frequency.value = 0.13;
    const lg2 = ctx.createGain();
    lg2.gain.value = 0.04;
    lf2.connect(lg2).connect(g.gain);
    n.connect(f).connect(g).connect(this.buses.ambience);
    n.start();
    lf.start();
    lf2.start();
    this.wind = { gain: g, filter: f };
    this.setWind(this.windIntensity);
  }

  private updateLoopPosition(rec: LoopRecord): void {
    const at = rec.opts.at;
    if (!at || !rec.panner) return;
    if ((at as THREE.Object3D).isObject3D) (at as THREE.Object3D).getWorldPosition(_p);
    else _p.copy(at as THREE.Vector3);
    rec.panner.positionX.value = _p.x;
    rec.panner.positionY.value = _p.y;
    rec.panner.positionZ.value = _p.z;
  }

  /** Per frame: listener follows camera; positional loops follow their objects. */
  update(camera: THREE.Camera): void {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    camera.getWorldPosition(_p);
    _f.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (L.positionX) {
      L.positionX.value = _p.x;
      L.positionY.value = _p.y;
      L.positionZ.value = _p.z;
      L.forwardX.value = _f.x;
      L.forwardY.value = _f.y;
      L.forwardZ.value = _f.z;
      L.upX.value = _u.x;
      L.upY.value = _u.y;
      L.upZ.value = _u.z;
    }
    for (const rec of this.loops) if (rec.opts.at && (rec.opts.at as THREE.Object3D).isObject3D) this.updateLoopPosition(rec);
  }

  // ── metering (tests: __academy.audioMeter) ─────────────────────────────────

  /**
   * Start a meter tap on the master output (post limiter, before the volume slider) or on one
   * bus (post bus gain). Taps are created on demand, so a normal session runs none.
   */
  armMeter(target: MeterTarget = 'master'): void {
    if (!this.meters.has(target)) this.meters.set(target, { node: null, ring: [] });
    const ctx = this.ctx;
    if (!ctx || !ctx.audioWorklet) return;
    const m = this.meters.get(target)!;
    if (m.node) return;
    if (!this.meterModule) {
      const url = URL.createObjectURL(new Blob([METER_WORKLET], { type: 'application/javascript' }));
      this.meterModule = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    }
    void this.meterModule
      .then(() => {
        if (m.node || !this.ctx) return;
        const node = new AudioWorkletNode(this.ctx, 'academy-meter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        node.port.onmessage = (e: MessageEvent<MeterChunk>) => {
          m.ring.push(e.data);
          // keep 60 s of history
          while (m.ring.length && m.ring[0].t < e.data.t - 60) m.ring.shift();
        };
        const src: AudioNode = target === 'master' ? this.post : this.buses[target];
        src.connect(node);
        // a silent sink keeps the node pulled by the graph
        const sink = this.ctx.createGain();
        sink.gain.value = 0;
        node.connect(sink).connect(this.ctx.destination);
        m.node = node;
      })
      .catch((err) => console.warn('[audio] meter unavailable', err));
  }

  /** Peak / RMS / HF RMS over the last `ms` milliseconds (arms the tap on the first call). */
  meter(ms = 1000, target: MeterTarget = 'master'): MeterReading {
    const state = this.ctx ? this.ctx.state : 'none';
    const m = this.meters.get(target);
    if (!m || !m.node) {
      this.armMeter(target);
      return { peakDb: -120, rmsDb: -120, hfDb: -120, clipped: 0, ms: 0, armed: false, state };
    }
    const now = this.ctx!.currentTime;
    const from = now - ms / 1000;
    let peak = 0,
      sum = 0,
      hsum = 0,
      n = 0,
      clip = 0,
      t0 = now;
    for (let i = m.ring.length - 1; i >= 0; i--) {
      const c = m.ring[i];
      if (c.t < from) break;
      peak = Math.max(peak, c.peak);
      sum += c.sum;
      hsum += c.hsum;
      n += c.n;
      clip += c.clip;
      t0 = c.t;
    }
    const db = (x: number): number => (x > 1e-12 ? Math.round(10 * Math.log10(x) * 10) / 10 : -120);
    return {
      peakDb: peak > 1e-6 ? Math.round(20 * Math.log10(peak) * 10) / 10 : -120,
      rmsDb: n ? db(sum / n) : -120,
      hfDb: n ? db(hsum / n) : -120,
      clipped: clip,
      ms: Math.round((now - t0) * 1000),
      armed: true,
      state,
    };
  }
}

/** tanh-style soft clip: linear below −2 dBFS, rounds off above, never exceeds ±1 (the limiter's ceiling is ≈ −1.2 dBFS). */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  const knee = 0.794; // −2 dBFS
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/** AudioWorklet: per 8 render quanta (~21 ms) post peak, Σx², Σ(HP 4 kHz)², n and clipped samples. */
const METER_WORKLET = `
class AcademyMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    const f0 = 4000, Q = Math.SQRT1_2, w = 2 * Math.PI * f0 / sampleRate, al = Math.sin(w) / (2 * Q), c = Math.cos(w), a0 = 1 + al;
    this.b0 = (1 + c) / 2 / a0; this.b1 = -(1 + c) / a0; this.b2 = (1 + c) / 2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0;
    this.z = [[0, 0, 0, 0], [0, 0, 0, 0]];
    this.peak = 0; this.sum = 0; this.hsum = 0; this.n = 0; this.clip = 0; this.blocks = 0;
  }
  process(inputs) {
    const inp = inputs[0];
    if (inp && inp.length) {
      const chs = Math.min(2, inp.length);
      for (let ch = 0; ch < chs; ch++) {
        const x = inp[ch], z = this.z[ch];
        let x1 = z[0], x2 = z[1], y1 = z[2], y2 = z[3];
        for (let i = 0; i < x.length; i++) {
          const v = x[i], a = v < 0 ? -v : v;
          if (a > this.peak) this.peak = a;
          if (a >= 0.989) this.clip++;
          this.sum += v * v;
          const y = this.b0 * v + this.b1 * x1 + this.b2 * x2 - this.a1 * y1 - this.a2 * y2;
          x2 = x1; x1 = v; y2 = y1; y1 = y;
          this.hsum += y * y;
        }
        z[0] = x1; z[1] = x2; z[2] = y1; z[3] = y2;
        this.n += x.length;
      }
    } else this.n += 128;
    if (++this.blocks >= 8) {
      this.port.postMessage({ t: currentTime, peak: this.peak, sum: this.sum, hsum: this.hsum, n: this.n, clip: this.clip });
      this.peak = 0; this.sum = 0; this.hsum = 0; this.n = 0; this.clip = 0; this.blocks = 0;
    }
    return true;
  }
}
registerProcessor('academy-meter', AcademyMeter);
`;

function loopBase(kind: LoopKind): number {
  switch (kind) {
    case 'hum':
      return 0.09;
    case 'generator':
      return 0.07;
    case 'servo':
      return 0.05;
    case 'beacon':
      return 0.035;
    case 'conveyor':
      return 0.12;
    case 'drone':
      return 0.05;
    case 'data':
      return 0.02;
    default:
      return customLoops.get(kind)?.base ?? 0.05;
  }
}
