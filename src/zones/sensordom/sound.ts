/**
 * Sensordom sound (GDD §7.1 "Sound"), procedural WebAudio on the zone bus:
 *   dome room tone (80 Hz + low-passed noise), LiDAR-head whirr (band-passed noise, 10 Hz AM,
 *   positional, audible ≈ 40 m) with a tick each time the fan sweeps past you, the visor scanner
 *   whirr, two-tone mode clicks, the glass thud, 4 kHz ultrasonic pips, measurement ticks.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';

const _w = new THREE.Vector3();

export class SensorSound {
  private ac: AudioContext | null = null;
  private room: GainNode | null = null;
  private head: GainNode | null = null;
  private headPan: PannerNode | null = null;
  private visor: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private lastFanSide = 0;

  constructor(private ctx: ZoneContext) {}

  /** Build the graph lazily: the AudioContext exists only after the first user gesture. */
  private ensure(): boolean {
    if (this.ac) return true;
    const ac = this.ctx.audio.context;
    const bus = this.ctx.audio.zoneBus;
    if (!ac || !bus) return false;
    this.ac = ac;
    const noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = (): AudioBufferSourceNode => {
      const s = ac.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      this.sources.push(s);
      return s;
    };
    const gain = (v: number): GainNode => {
      const g = ac.createGain();
      g.gain.value = v;
      this.nodes.push(g);
      return g;
    };
    const filt = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const b = ac.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      this.nodes.push(b);
      return b;
    };
    const lfoInto = (f: number, depth: number, param: AudioParam, type: OscillatorType = 'sine'): void => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = gain(depth);
      o.connect(g).connect(param);
      this.sources.push(o);
    };

    // room tone
    this.room = gain(0);
    const hum = ac.createOscillator();
    hum.frequency.value = 80;
    this.sources.push(hum);
    hum.connect(gain(0.05)).connect(this.room);
    noise().connect(filt('lowpass', 320, 0.5)).connect(gain(0.035)).connect(this.room);
    this.room.connect(bus);

    // LiDAR head on the dome: band-passed noise, amplitude-modulated at 10 Hz, positional
    this.head = gain(0);
    const am = gain(0.55);
    lfoInto(10, 0.45, am.gain, 'triangle');
    noise().connect(filt('bandpass', 2600, 3.5)).connect(am).connect(this.head);
    const pan = ac.createPanner();
    pan.panningModel = 'equalpower';
    pan.distanceModel = 'linear';
    pan.refDistance = 4;
    pan.maxDistance = 42;
    pan.rolloffFactor = 1;
    this.headPan = pan;
    this.nodes.push(pan);
    this.head.connect(pan).connect(bus);

    // visor scanner (head-mounted): a slightly brighter whirr than the head on the dome; triangle AM
    // and a 3 kHz band keep it from turning harsh over minutes of LiDAR mode (measured hf ≈ 20 dB below RMS)
    this.visor = gain(0);
    const am2 = gain(0.5);
    lfoInto(10, 0.4, am2.gain, 'triangle');
    noise().connect(filt('bandpass', 3000, 4)).connect(am2).connect(this.visor);
    this.visor.connect(bus);

    for (const s of this.sources) s.start();
    return true;
  }

  /** per frame (cheap: parameter targets only) */
  update(s: { inDome: boolean; scanning: boolean; headWorld: THREE.Vector3; fanAngle: number; playerLocal: THREE.Vector3; headLocal: THREE.Vector3 }): void {
    if (!this.ensure() || !this.ac) return;
    const t = this.ac.currentTime;
    // levels (engine meter, zones bus): room tone ≈ −33 dBFS RMS like the island bed; zone-bed target −34 … −24
    this.room!.gain.setTargetAtTime(s.inDome ? 0.6 : 0, t, 0.4);
    this.visor!.gain.setTargetAtTime(s.scanning ? 0.08 : 0, t, 0.08);
    this.head!.gain.setTargetAtTime(s.inDome ? 0.05 : 0.22, t, 0.3);
    const p = this.headPan!;
    _w.copy(s.headWorld);
    p.positionX.value = _w.x;
    p.positionY.value = _w.y;
    p.positionZ.value = _w.z;
    // a tick when the fan sweeps past the listener's bearing
    const bearing = Math.atan2(-(s.playerLocal.z - s.headLocal.z), s.playerLocal.x - s.headLocal.x); // pivot frame: +X at angle 0, rotating toward −Z
    const rel = Math.sin(s.fanAngle - bearing);
    const side = rel >= 0 ? 1 : -1;
    if (this.lastFanSide !== 0 && side !== this.lastFanSide && Math.cos(s.fanAngle - bearing) > 0 && !s.inDome) {
      this.ctx.audio.tone({ freq: 2200, to: 1800, dur: 0.035, type: 'triangle', volume: 0.35, at: [s.headLocal.x, s.headLocal.y, s.headLocal.z] });
    }
    this.lastFanSide = side;
  }

  modeClick(up: boolean): void {
    const a = up ? 1320 : 1760,
      b = up ? 1760 : 1320;
    // UI-level feedback (peak ≈ −25 dBFS; engine UI range −26 … −18)
    this.ctx.audio.tone({ freq: a, dur: 0.035, type: 'square', volume: 0.4 });
    this.ctx.after(0.06, () => this.ctx.audio.tone({ freq: b, dur: 0.05, type: 'square', volume: 0.4 }));
  }

  glassThud(at: [number, number, number]): void {
    // a surprise, not a punishment: peak ≈ −12 dBFS on the master, level with the engine's success cue
    this.ctx.audio.tone({ freq: 70, to: 52, dur: 0.28, type: 'sine', volume: 0.8, at });
    this.ctx.audio.tone({ freq: 3600, to: 3350, dur: 0.07, type: 'sine', volume: 0.3, at });
    this.ctx.audio.play('thud', { volume: 0.45, at });
  }

  sonarPip(): void {
    this.ctx.audio.tone({ freq: 4000, dur: 0.025, type: 'sine', volume: 0.07 });
  }

  /** measurement tick, pitched by histogram bin (0 … bins−1) */
  tick(bin: number, bins: number): void {
    const semis = Math.round(((bin - bins / 2) / bins) * 24);
    this.ctx.audio.tone({ freq: 660 * Math.pow(2, semis / 12), dur: 0.035, type: 'triangle', volume: 0.28 });
  }

  dropout(): void {
    this.ctx.audio.tone({ freq: 180, dur: 0.05, type: 'square', volume: 0.12 });
  }

  dispose(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* not started */
      }
      s.disconnect();
    }
    for (const n of this.nodes) n.disconnect();
    this.sources = [];
    this.nodes = [];
    this.ac = null;
  }
}
