/**
 * Regelgarten signature sound (GDD §7.2): the loop-rate click train. One soft click per controller
 * sample, so you HEAR the Takt: discrete clicks up to 200 Hz, a quiet buzz (≈ −30 dB) at 1 kHz.
 * Plus the pendulum creak (resonant filtered noise tied to angular velocity).
 * Nodes are created lazily once the AudioContext exists; rate changes rebuild one buffer source.
 */
import type { ZoneContext } from '@/core/zones';

export interface ZoneSound {
  /** per frame: Takt (Hz), whether the loop runs, |ω| (rad/s) of the giant pole */
  update(taktHz: number, running: boolean, omega: number): void;
  /** debug: what the click train is doing right now */
  state(): { ready: boolean; rate: number; on: boolean; level: number; samplesPerClick: number };
  dispose(): void;
}

export function createZoneSound(ctx: ZoneContext): ZoneSound {
  let ac: AudioContext | null = null;
  let clickOut: GainNode | null = null;
  let src: AudioBufferSourceNode | null = null;
  let curRate = 0;
  let curOn = false;
  let creakGain: GainNode | null = null;
  let creakFilter: BiquadFilterNode | null = null;
  let creakSrc: AudioBufferSourceNode | null = null;
  const buffers = new Map<number, AudioBuffer>();

  const clickBuffer = (rate: number): AudioBuffer => {
    let b = buffers.get(rate);
    if (b) return b;
    const sr = ac!.sampleRate;
    const len = Math.max(8, Math.round(sr / rate));
    b = ac!.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    // a short mechanical tick: decaying 3.2 kHz burst, ≤ 1.2 ms (shorter at 1 kHz so it becomes a buzz)
    const clickLen = Math.min(len, Math.round(sr * (rate >= 500 ? 0.00045 : 0.0012)));
    for (let i = 0; i < clickLen; i++) {
      const env = Math.pow(1 - i / clickLen, 2.2);
      d[i] = env * (Math.sin((2 * Math.PI * 3200 * i) / sr) * 0.8 + Math.sin((2 * Math.PI * 1100 * i) / sr) * 0.4);
    }
    buffers.set(rate, b);
    return b;
  };

  const ensure = (): boolean => {
    if (ac) return true;
    const c = ctx.audio.context;
    const bus = ctx.audio.zoneBus;
    if (!c || !bus) return false;
    ac = c;
    clickOut = c.createGain();
    clickOut.gain.value = 0;
    clickOut.connect(bus);
    // creak: looped noise → resonant band-pass → gain
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    creakSrc = c.createBufferSource();
    creakSrc.buffer = nb;
    creakSrc.loop = true;
    creakFilter = c.createBiquadFilter();
    creakFilter.type = 'bandpass';
    creakFilter.Q.value = 14;
    creakFilter.frequency.value = 220;
    creakGain = c.createGain();
    creakGain.gain.value = 0;
    creakSrc.connect(creakFilter).connect(creakGain).connect(bus);
    creakSrc.start();
    return true;
  };

  const setRate = (rate: number, on: boolean): void => {
    if (!ac || !clickOut) return;
    if (rate === curRate && on === curOn) return;
    const t = ac.currentTime;
    if (rate !== curRate || !src) {
      if (src) {
        try {
          src.stop(t + 0.02);
        } catch {
          /* already stopped */
        }
        src.disconnect();
      }
      src = ac.createBufferSource();
      src.buffer = clickBuffer(rate);
      src.loop = true;
      src.connect(clickOut);
      src.start(t + 0.02);
      curRate = rate;
    }
    curOn = on;
    // ≈ −30 dB buzz at 1 kHz, clearly audible discrete clicks at ≤ 200 Hz
    const level = !on ? 0 : rate >= 1000 ? 0.032 : rate >= 200 ? 0.05 : 0.11;
    clickOut.gain.setTargetAtTime(level, t, 0.03);
  };

  return {
    update(takt, running, omega) {
      if (!ensure()) return;
      setRate(takt, running);
      const t = ac!.currentTime;
      const w = Math.min(3, Math.abs(omega));
      creakFilter!.frequency.setTargetAtTime(160 + w * 260, t, 0.08);
      creakGain!.gain.setTargetAtTime(Math.min(0.22, w * 0.11), t, 0.08);
    },
    state() {
      return { ready: !!ac, rate: curRate, on: curOn, level: clickOut ? clickOut.gain.value : 0, samplesPerClick: src?.buffer?.length ?? 0 };
    },
    dispose() {
      try {
        src?.stop();
        creakSrc?.stop();
      } catch {
        /* ignore */
      }
      src?.disconnect();
      creakSrc?.disconnect();
      clickOut?.disconnect();
      creakGain?.disconnect();
      creakFilter?.disconnect();
      buffers.clear();
    },
  };
}
