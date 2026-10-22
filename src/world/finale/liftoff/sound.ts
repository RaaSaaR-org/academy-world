import type { LoopHandle, Vec3Input, ZoneContext } from '@/core/zones';
import { registerLoopKind, type LoopKit } from '@/systems/Audio';
import { SOUND } from '../tuning';

/**
 * The lift-off's sound (plan §4.15 „Audio“): every voice is a loop of the island module, so it lands on
 * the ambience bus, the D14 „Atmosphäre & Musik“ group (zone tones would go to the cues bus). One-shots
 * (the whump of a spin-up, a hydraulic thunk, the nav confirm) are short loops whose factory schedules
 * its own envelope; the director stops them after their length. The Recamán notes are sustained loops
 * pitched to 220 Hz · 2^(a/12) (GDD §8.1); the break-out melody is one voice scheduled note by note.
 * Peaks stay ≤ −10 dBFS on master (liftoff-check), ≤ 40 voices.
 *
 * A loop's output gain rises with a 0.3 s time constant when it starts (src/systems/Audio.ts), which would
 * blunt a percussive hit: the one-shots schedule their envelope `PRE` seconds after the start, and the
 * director starts them that much ahead of their beat.
 */
/** pre-roll of the one-shot loops (s): their hit lands this long after the call */
export const PRE = 0.45;
declare module '@/systems/Audio' {
  interface LoopKindRegistry {
    'liftoff-note': true;
    'liftoff-whump': true;
    'liftoff-thunk': true;
    'liftoff-chime': true;
    'liftoff-rumble': true;
    'liftoff-pad': true;
    'liftoff-melody': true;
  }
}

let registered = false;

/** A decaying envelope on a fresh gain node feeding the loop's output (it starts PRE after the loop). */
function env(k: LoopKit, attack: number, decay: number, peak = 1): GainNode {
  const g = k.ctx.createGain();
  const t = k.ctx.currentTime + PRE;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0.0001, t + attack, decay);
  g.connect(k.out);
  return g;
}

function registerKinds(): void {
  if (registered) return;
  registered = true;
  // a sustained chord tone (pitch: the Recamán ratio); a soft triangle with a little air
  registerLoopKind(
    'liftoff-note',
    (k) => {
      const f = k.filter('lowpass', 1800, 0.4);
      f.connect(k.out);
      const o = k.osc('triangle', SOUND.base);
      o.connect(f);
      const o2 = k.osc('sine', SOUND.base * 2);
      const g2 = k.ctx.createGain();
      g2.gain.value = 0.18;
      o2.connect(g2).connect(f);
    },
    { base: 0.045 },
  );
  // the spin-up whump: a low sine drop with a noise puff (≈ 1 s)
  registerLoopKind(
    'liftoff-whump',
    (k) => {
      const t = k.ctx.currentTime + PRE;
      const o = k.osc('sine', 62);
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.7);
      o.connect(env(k, 0.02, 0.22));
      const n = k.noise();
      const f = k.filter('lowpass', 420, 0.6);
      n.connect(f);
      f.connect(env(k, 0.03, 0.16, 0.45));
    },
    { base: 0.16 },
  );
  // a hydraulic thunk as an arm locks (≈ 0.6 s)
  registerLoopKind(
    'liftoff-thunk',
    (k) => {
      const t = k.ctx.currentTime + PRE;
      const o = k.osc('square', 92);
      o.frequency.setValueAtTime(92, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
      const f = k.filter('lowpass', 520, 0.8);
      o.connect(f);
      f.connect(env(k, 0.005, 0.06));
    },
    { base: 0.11 },
  );
  // the nav lamp's confirm: two soft sine partials (≈ 1.5 s)
  registerLoopKind(
    'liftoff-chime',
    (k) => {
      const e = env(k, 0.06, 0.45);
      k.osc('sine', 880).connect(e);
      const g = k.ctx.createGain();
      g.gain.value = 0.4;
      k.osc('sine', 1318.5).connect(g).connect(e);
    },
    { base: 0.05 },
  );
  // the climb's rumble: filtered noise plus a low fundamental; volume follows the thrust
  registerLoopKind(
    'liftoff-rumble',
    (k) => {
      const n = k.noise();
      const f = k.filter('lowpass', 140, 0.7);
      n.connect(f).connect(k.out);
      const o = k.osc('sine', 38);
      const g = k.ctx.createGain();
      g.gain.value = 0.6;
      o.connect(g).connect(k.out);
      k.lfo(0.23, 4, f.frequency);
    },
    { base: 0.09 },
  );
  // a warm pad under the break-out melody (A, C♯, E an octave down, slowly breathing)
  registerLoopKind(
    'liftoff-pad',
    (k) => {
      const f = k.filter('lowpass', 900, 0.5);
      f.connect(k.out);
      for (const r of [1, 1.2599, 1.4983]) {
        const o = k.osc('sawtooth', (SOUND.base / 2) * r);
        o.detune.value = (r - 1.25) * 9;
        o.connect(f);
      }
      k.lfo(0.11, 260, f.frequency);
    },
    { base: 0.012 },
  );
  // the 18-note Recamán melody (≈ 3 notes/s), one voice with its own envelope per note
  registerLoopKind(
    'liftoff-melody',
    (k) => {
      const o = k.osc('triangle', SOUND.base);
      const g = k.ctx.createGain();
      g.gain.value = 0;
      o.connect(g).connect(k.out);
      const t0 = k.ctx.currentTime + PRE;
      SOUND.recaman.forEach((a, i) => {
        const t = t0 + i * SOUND.melodyNoteS;
        o.frequency.setValueAtTime(SOUND.base * Math.pow(2, a / 12), t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(1, t + 0.025);
        g.gain.setTargetAtTime(0.0001, t + 0.05, i === SOUND.recaman.length - 1 ? 0.9 : 0.16);
      });
    },
    { base: 0.07 },
  );
}

export interface LiftoffSound {
  /** a sustained Recamán note a (0…25); returns its handle (fade with setVolume) */
  note(a: number, volume?: number): LoopHandle;
  whump(at: Vec3Input): void;
  thunk(at: Vec3Input): void;
  chime(): void;
  /** the rumble from the release on; level 0…1 */
  rumble(level: number): void;
  /** the pad + melody at the break-out */
  melody(): void;
  /** release everything (end, skip, dispose) over `fadeS` */
  stopAll(fadeS?: number): void;
}

export function buildLiftoffSound(ctx: ZoneContext): LiftoffSound {
  registerKinds();
  const live = new Set<LoopHandle>();
  const shot = (kind: Parameters<ZoneContext['audio']['loop']>[0], seconds: number, o: { at?: Vec3Input; volume?: number } = {}): void => {
    const h = ctx.audio.loop(kind, { volume: o.volume ?? 1, ...(o.at ? { at: o.at } : {}) });
    live.add(h);
    ctx.after(seconds, () => {
      h.stop();
      live.delete(h);
    });
  };
  let rumble: LoopHandle | null = null;
  let pad: LoopHandle | null = null;
  const api: LiftoffSound = {
    note(a, volume = SOUND.chordVol) {
      const h = ctx.audio.loop('liftoff-note', { volume: 0, pitch: Math.pow(2, a / 12) });
      h.setVolume(volume, 0.35);
      live.add(h);
      return h;
    },
    whump: (at) => shot('liftoff-whump', PRE + 1.4, { at, volume: SOUND.whumpVol }),
    thunk: (at) => shot('liftoff-thunk', PRE + 0.8, { at, volume: SOUND.thunkVol }),
    chime: () => shot('liftoff-chime', PRE + 2.2, { volume: 0.8 }),
    rumble(level) {
      if (!rumble && level > 0.01) {
        rumble = ctx.audio.loop('liftoff-rumble', { volume: 0 });
        live.add(rumble);
      }
      rumble?.setVolume(Math.max(0, Math.min(1, level)) * SOUND.rumbleMax, 0.4);
    },
    melody() {
      pad ??= ctx.audio.loop('liftoff-pad', { volume: 0 });
      live.add(pad);
      pad.setVolume(0.9, 1.5);
      shot('liftoff-melody', PRE + SOUND.recaman.length * SOUND.melodyNoteS + 3, { volume: 1 });
      // the pad breathes out after the melody's last chord
      ctx.after(SOUND.recaman.length * SOUND.melodyNoteS + 4, () => pad?.setVolume(0.25, 4));
    },
    stopAll(fadeS = 1.2) {
      for (const h of live) h.setVolume(0, fadeS);
      const all = [...live];
      live.clear();
      rumble = null;
      pad = null;
      ctx.after(fadeS + 0.1, () => all.forEach((h) => h.stop()));
    },
  };
  ctx.onDispose(() => api.stopAll(0));
  return api;
}
