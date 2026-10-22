/**
 * The 3-stop spike tour (WP-D0): dock, Schauhalle, Sonnenacker with placeholder cards, so the founder
 * can measure on a real phone before D1's tour lands. It is the 'tour' mode only while no package
 * registered one, and it shows the choreography D1 builds on: pre-roll (the stop's areas, the observer
 * pinned at the target until its robots are in or 3 s pass, the programs compiled, „lädt …“), the
 * flight, then the card, the top bar, the live line and the crash marker's stop.
 */
import * as THREE from 'three';
import type { CardSpec, DiscoverHandle, DiscoverMode, TourEnterArg, TourStop, Vec3 } from './types';
import { dirOf } from './camera';
import { SPIKE_STOPS, SPIKE_TEXT } from './spike-data';

/** Feet where the stop's camera will be (the pre-roll pins the observer there). */
export function feetOf(stop: TourStop): Vec3 {
  const r = stop.rig;
  if (r.kind === 'look') return [r.eye[0], r.eye[1] - 1.7, r.eye[2]];
  const e = new THREE.Vector3(...r.target).addScaledVector(dirOf(r.yawDeg, r.pitchDeg), -r.distance);
  return [e.x, e.y - 1.7, e.z];
}

/** Wait until the robot queue is idle (nothing running or pending) or `ms` passed. */
export async function robotsSettled(h: DiscoverHandle, ms = 3000): Promise<void> {
  const t0 = performance.now();
  for (;;) {
    const s = h.game.robots.stats() as { running?: number; jobs?: { running: boolean; pending: number; state: string }[] };
    const busy = (s.running ?? 0) > 0 || (s.jobs ?? []).some((j) => j.running || j.pending > 0 || j.state === 'queued' || j.state === 'loading');
    if (!busy || performance.now() - t0 > ms) return;
    await new Promise((r) => window.setTimeout(r, 100));
  }
}

function spikeCard(h: DiscoverHandle, stop: TourStop): CardSpec {
  if (stop.id === 'dock') return { id: stop.card, eyebrow: SPIKE_TEXT.dock.eyebrow, title: SPIKE_TEXT.dock.title, blocks: [{ kind: 'p', text: SPIKE_TEXT.dock.body }] };
  if (stop.id === 'schauhalle') {
    const robots = h.robots;
    return {
      id: stop.card,
      eyebrow: SPIKE_TEXT.schauhalle.eyebrow,
      title: stop.title,
      blocks: [],
      // D2's viewer, once it is registered
      actions: robots && h.modes.has('viewer') ? [{ id: 'viewer', primary: true, label: { de: 'Roboter ansehen', en: 'View the robots' }, onSelect: () => void h.modes.enter('viewer', {}) }] : [],
    };
  }
  return { id: stop.card, eyebrow: SPIKE_TEXT.sonnenacker.eyebrow, title: stop.title, blocks: [{ kind: 'p', text: SPIKE_TEXT.sonnenacker.body }] };
}

/** The stops with their rigs fitted to this world (the farm's eye on its terrain). */
export function spikeStops(h: DiscoverHandle): TourStop[] {
  return SPIKE_STOPS.map((s) => {
    if (s.id !== 'sonnenacker' || s.rig.kind !== 'look') return s;
    const g = h.ctx.frames?.heightAt?.(s.rig.eye[0], s.rig.eye[2]);
    return Number.isFinite(g) ? { ...s, rig: { ...s.rig, eye: [s.rig.eye[0], (g as number) + 1.7, s.rig.eye[2]] as Vec3 } } : s;
  });
}

export function spikeTour(h: DiscoverHandle): DiscoverMode & { goto(id: string, o?: { instant?: boolean }): Promise<void>; readonly at: number } {
  let stops: TourStop[] = [];
  let at = -1;
  let seq = 0;
  let offNav: (() => void) | null = null;

  const goto = async (id: string, o: { instant?: boolean } = {}): Promise<void> => {
    if (!stops.length) stops = spikeStops(h);
    const k = stops.findIndex((s) => s.id === id);
    if (k < 0) return;
    const my = ++seq;
    const s = stops[k];
    at = k;
    h.topbar.setStep(k + 1, stops.length, s.title);
    h.sheet.setNav({ prev: k > 0, next: k < stops.length - 1 });
    // pre-roll: the areas, the observer at the target (robots, LOD), the programs
    h.ui.busy(true);
    try {
      h.observer.pin(feetOf(s));
      await h.ensureAreas(s.areas);
      await robotsSettled(h, 3000);
      await h.warm();
    } finally {
      h.ui.busy(false);
    }
    if (my !== seq) return;
    if (o.instant) h.camera.setRig(s.rig);
    else await h.camera.flyTo(s.rig, { via: s.via });
    if (my !== seq) return;
    h.observer.follow();
    h.setStop(s.id);
    h.sheet.show(spikeCard(h, s), 'peek');
    h.ui.announce(s.title);
  };

  return {
    get at() {
      return at;
    },
    goto,
    enter(arg?: unknown) {
      const a = (arg ?? {}) as TourEnterArg;
      offNav ??= h.gestures.onNav((dir) => {
        const next = stops[at + dir];
        if (next && !h.camera.flying) void goto(next.id);
      });
      if (!stops.length) stops = spikeStops(h);
      return goto(a.stop && stops.some((s) => s.id === a.stop) ? a.stop : stops[Math.max(0, at)].id);
    },
    exit() {
      offNav?.();
      offNav = null;
      h.sheet.hide();
    },
  };
}
